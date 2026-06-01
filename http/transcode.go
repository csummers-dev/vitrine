package fbhttp

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/spf13/afero"
)

// Server-side video transcoding (v1.3 #3).
//
// Browsers can't decode non-web containers/codecs (.mkv, .avi, …). When the
// frontend's <video> reports it can't play a file, it falls back to
// GET /api/transcode{path}, which produces a browser-playable MP4 with
// ffmpeg, caches it on the cache volume, and serves it with http.ServeContent
// (so range requests / seeking work off the cached file — bounded memory,
// unlike loading the whole video into RAM).
//
// Strategy: when ffprobe is available AND the streams are already
// browser-friendly (H.264 video + AAC/MP3 audio) we do a fast stream-copy
// remux (seconds, ~no CPU) — common for .mkv. Otherwise a full transcode
// (H.264/AAC). ffmpeg is detected at runtime via the shared ffmpegPath();
// when it's absent the endpoint 501s and the frontend shows the download
// card. Mirrors the S6-2 thumbnail machinery (detection + concurrency).

const (
	// Generous: a full transcode of a long file can take minutes. Remux is
	// near-instant. The request blocks until the cache file is ready.
	transcodeTimeout = 60 * time.Minute
	// Bound concurrent ffmpeg transcodes so a few requests can't peg every
	// core on a homelab box. Extra requests queue here.
	transcodeConcurrency = 2
	// Size cap for the transcode cache directory (oldest evicted first).
	transcodeCacheMaxBytes int64 = 20 << 30 // 20 GiB
)

var (
	transcodeSem = make(chan struct{}, transcodeConcurrency)

	ffprobeOnce sync.Once
	ffprobeBin  string

	// Where transcoded MP4s are cached. Set once at startup from the
	// configured cacheDir; empty falls back to a temp dir.
	transcodeCacheDir = ""

	// Per-source-file lock so two requests for the same video don't both
	// transcode it — the second waits and serves the first's output.
	transcodeLocks sync.Map // key -> *sync.Mutex
)

// SetTranscodeCacheDir wires the transcode cache to the cache volume. Called
// once from the server bootstrap with the configured cacheDir (may be "").
func SetTranscodeCacheDir(dir string) { transcodeCacheDir = dir }

// videoTranscodeEnabled reports whether transcoding can run (ffmpeg present).
func videoTranscodeEnabled() bool { return ffmpegPath() != "" }

// ffprobePath resolves ffprobe once; "" when absent (remux optimization is
// then skipped and everything is full-transcoded — correct, just slower).
func ffprobePath() string {
	ffprobeOnce.Do(func() {
		if p, err := exec.LookPath("ffprobe"); err == nil {
			ffprobeBin = p
		}
	})
	return ffprobeBin
}

func transcodeDir() string {
	base := transcodeCacheDir
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "transcode")
}

func transcodeCacheKey(f *files.FileInfo) string {
	sum := sha1.Sum([]byte(fmt.Sprintf("%s|%d", f.RealPath(), f.ModTime.Unix())))
	return hex.EncodeToString(sum[:]) + ".mp4"
}

// Video extensions we accept for transcoding even when MIME sniffing didn't
// classify the file as "video" (e.g. exotic containers).
var transcodeVideoExts = map[string]bool{
	".mkv": true, ".avi": true, ".mov": true, ".wmv": true, ".flv": true,
	".mpg": true, ".mpeg": true, ".m4v": true, ".ts": true, ".webm": true,
	".mp4": true, ".3gp": true, ".ogv": true, ".m2ts": true, ".mts": true,
	".vob": true, ".divx": true, ".f4v": true, ".rm": true, ".rmvb": true,
}

func transcodeHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		src, err := url.PathUnescape(r.URL.Path)
		if err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		if !d.Check(src) {
			return http.StatusForbidden, nil
		}
		if !videoTranscodeEnabled() {
			// No ffmpeg → frontend falls back to the download card.
			return http.StatusNotImplemented, nil
		}

		file, err := files.NewFileInfo(&files.FileOptions{
			Fs:         d.user.Fs,
			Path:       src,
			Modify:     d.user.Perm.Modify,
			Expand:     false,
			ReadHeader: d.server.TypeDetectionByHeader,
			Checker:    d,
		})
		if err != nil {
			if errors.Is(err, afero.ErrFileNotFound) {
				return http.StatusNotFound, err
			}
			return errToStatus(err), err
		}
		ext := strings.ToLower(filepath.Ext(file.Name))
		if file.Type != "video" && !transcodeVideoExts[ext] {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}

		dir := transcodeDir()
		if mkErr := os.MkdirAll(dir, 0o700); mkErr != nil {
			return http.StatusInternalServerError, mkErr
		}
		outPath := filepath.Join(dir, transcodeCacheKey(file))

		// Fast path: already cached.
		if _, statErr := os.Stat(outPath); statErr == nil {
			return serveTranscoded(w, r, outPath, file.ModTime)
		}

		// Serialize per source file so duplicate requests don't double-encode.
		lk, _ := transcodeLocks.LoadOrStore(outPath, &sync.Mutex{})
		mu := lk.(*sync.Mutex)
		mu.Lock()
		defer mu.Unlock()

		// Re-check: another request may have finished while we waited.
		if _, statErr := os.Stat(outPath); statErr != nil {
			transcodeSem <- struct{}{}
			genErr := generateTranscode(file.RealPath(), outPath, dir)
			<-transcodeSem
			if genErr != nil {
				return http.StatusInternalServerError, genErr
			}
		}

		return serveTranscoded(w, r, outPath, file.ModTime)
	})
}

func serveTranscoded(w http.ResponseWriter, r *http.Request, path string, modTime time.Time) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	defer f.Close()
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "private")
	// ServeContent handles Range/seek using the file's io.ReadSeeker.
	http.ServeContent(w, r, "video.mp4", modTime, f)
	return 0, nil
}

// generateTranscode produces a browser-playable MP4 at outPath (atomic via a
// temp file), remuxing when the codecs are already web-safe, else fully
// transcoding. Evicts the cache to its size cap afterward.
func generateTranscode(inputPath, outPath, dir string) error {
	bin := ffmpegPath()
	if bin == "" {
		return errors.New("ffmpeg not available")
	}
	tmp := outPath + ".tmp"
	_ = os.Remove(tmp)

	ctx, cancel := context.WithTimeout(context.Background(), transcodeTimeout)
	defer cancel()

	var err error
	if canRemux(inputPath) {
		err = runFFmpegRemux(ctx, bin, inputPath, tmp)
		if err != nil {
			_ = os.Remove(tmp)
		}
	} else {
		err = errors.New("skip remux")
	}
	if err != nil {
		// Full transcode fallback.
		if tErr := runFFmpegTranscode(ctx, bin, inputPath, tmp); tErr != nil {
			_ = os.Remove(tmp)
			return tErr
		}
	}

	if rnErr := os.Rename(tmp, outPath); rnErr != nil {
		_ = os.Remove(tmp)
		return rnErr
	}
	evictTranscodeCache(dir, transcodeCacheMaxBytes)
	return nil
}

// canRemux reports whether the input's streams are already browser-friendly
// (H.264 + AAC/MP3, or no audio), so a fast stream-copy into MP4 suffices.
// Requires ffprobe; returns false when it's absent (→ full transcode).
func canRemux(inputPath string) bool {
	probe := ffprobePath()
	if probe == "" {
		return false
	}
	vcodec := probeCodec(probe, inputPath, "v:0")
	if vcodec != "h264" {
		return false
	}
	acodec := probeCodec(probe, inputPath, "a:0")
	switch acodec {
	case "", "aac", "mp3":
		return true
	default:
		return false
	}
}

// probeCodec returns the codec_name of the given stream selector, or "" if
// the stream is absent / probing fails.
func probeCodec(probe, inputPath, stream string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, probe,
		"-v", "error",
		"-select_streams", stream,
		"-show_entries", "stream=codec_name",
		"-of", "default=nw=1:nk=1",
		inputPath,
	).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func runFFmpegRemux(ctx context.Context, bin, inputPath, outPath string) error {
	cmd := exec.CommandContext(ctx, bin,
		"-loglevel", "error",
		"-i", inputPath,
		"-c", "copy",
		"-movflags", "+faststart",
		"-f", "mp4",
		"-y", outPath,
	)
	return runFFmpeg(cmd, "remux", inputPath)
}

func runFFmpegTranscode(ctx context.Context, bin, inputPath, outPath string) error {
	cmd := exec.CommandContext(ctx, bin,
		"-loglevel", "error",
		"-i", inputPath,
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
		"-c:a", "aac", "-b:a", "160k",
		"-movflags", "+faststart",
		"-f", "mp4",
		"-y", outPath,
	)
	return runFFmpeg(cmd, "transcode", inputPath)
}

func runFFmpeg(cmd *exec.Cmd, op, label string) error {
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg %s %q: %w (%s)", op, filepath.Base(label), err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

// evictTranscodeCache deletes the oldest .mp4 files until the directory is
// under capBytes. Unlinking a file currently being served is safe on POSIX
// (the open fd keeps the data alive until the response finishes).
func evictTranscodeCache(dir string, capBytes int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type entry struct {
		path    string
		size    int64
		modTime time.Time
	}
	var mp4s []entry
	var total int64
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".mp4") {
			continue
		}
		info, infoErr := e.Info()
		if infoErr != nil {
			continue
		}
		mp4s = append(mp4s, entry{filepath.Join(dir, e.Name()), info.Size(), info.ModTime()})
		total += info.Size()
	}
	if total <= capBytes {
		return
	}
	// Oldest first.
	sort.Slice(mp4s, func(i, j int) bool { return mp4s[i].modTime.Before(mp4s[j].modTime) })
	for _, f := range mp4s {
		if total <= capBytes {
			break
		}
		if rmErr := os.Remove(f.path); rmErr == nil {
			total -= f.size
		}
	}
}
