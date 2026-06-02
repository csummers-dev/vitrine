package fbhttp

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/filebrowser/filebrowser/v2/files"
)

// Server-side video thumbnails (v1.3 S6-2).
//
// On a thumbnail request for a video, we extract a representative poster
// frame with ffmpeg, cache it through the S1-7 disk cache (keyed by real
// path + mtime), and serve it as a JPEG — reusing the exact same preview
// endpoint + cache machinery that image thumbnails already use.
//
// Hard requirement: NO hard dependency on ffmpeg. We detect it once at
// runtime; when it's absent (minimal / non-Docker installs) video rows
// simply keep the generic video icon (the frontend never even requests a
// thumb, because the EnableVideoThumbnails flag is false). The Docker
// image bundles ffmpeg so it works out of the box.

const (
	videoThumbTimeout = 30 * time.Second
	// Bound concurrent ffmpeg processes: a folder full of videos must not
	// be able to fork one process per row. This is the "generation queue"
	// — extra requests park here waiting for a slot. The listing JSON
	// itself never blocks (thumbnails are separate, lazily-loaded
	// requests).
	videoThumbConcurrency = 2
)

var (
	ffmpegOnce sync.Once
	ffmpegBin  string

	videoThumbSem = make(chan struct{}, videoThumbConcurrency)
)

// ffmpegPath resolves the ffmpeg binary once and caches the result.
// Returns "" when ffmpeg isn't on PATH.
func ffmpegPath() string {
	ffmpegOnce.Do(func() {
		if p, err := exec.LookPath("ffmpeg"); err == nil {
			ffmpegBin = p
		}
	})
	return ffmpegBin
}

// videoThumbnailsEnabled reports whether the server can produce video
// thumbnails (i.e. ffmpeg is available). Used both by the preview handler
// and by the static-data bootstrap so the frontend only requests video
// thumbs when they can actually be served.
func videoThumbnailsEnabled() bool {
	return ffmpegPath() != ""
}

func videoThumbCacheKey(f *files.FileInfo) string {
	return fmt.Sprintf("video_thumb_%x%x", f.RealPath(), f.ModTime.Unix())
}

// handleVideoPreview serves a cached video poster frame, generating it on
// first request. Thumbnail-size only — the "big" preview for a video is
// the actual player, not an image.
func handleVideoPreview(
	w http.ResponseWriter,
	r *http.Request,
	fileCache FileCache,
	file *files.FileInfo,
	previewSize PreviewSize,
	enableThumbnails bool,
) (int, error) {
	// Nothing to serve when thumbnails are off, ffmpeg is missing, or a
	// non-thumb size is asked for — signal "not implemented" so the client
	// falls back to the generic video icon.
	if previewSize != PreviewSizeThumb || !enableThumbnails || !videoThumbnailsEnabled() {
		return http.StatusNotImplemented, nil
	}

	cacheKey := videoThumbCacheKey(file)
	thumb, ok, err := fileCache.Load(r.Context(), cacheKey)
	if err != nil {
		return errToStatus(err), err
	}
	if !ok {
		thumb, err = createVideoThumbnail(file)
		if err != nil {
			// ffmpeg failed for THIS file (corrupt, unsupported codec, or
			// timeout). Degrade to the generic icon rather than 500ing the
			// row — one bad file shouldn't error the listing.
			log.Printf("video thumbnail: %v", err)
			return http.StatusNotImplemented, nil
		}
		// Cache asynchronously so the response isn't held on disk I/O.
		go func(key string, data []byte) {
			if storeErr := fileCache.Store(context.Background(), key, data); storeErr != nil {
				log.Printf("failed to cache video thumbnail: %v", storeErr)
			}
		}(cacheKey, thumb)
	}

	w.Header().Set("Cache-Control", "private")
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeContent(w, r, "thumb.jpg", file.ModTime, bytes.NewReader(thumb))
	return 0, nil
}

// createVideoThumbnail extracts a 256² poster frame as JPEG bytes for a
// listing file. Concurrency-bounded (the semaphore is the generation
// queue).
func createVideoThumbnail(file *files.FileInfo) ([]byte, error) {
	bin := ffmpegPath()
	if bin == "" {
		return nil, errors.New("ffmpeg not available")
	}

	// Acquire a generation slot (blocks if videoThumbConcurrency ffmpeg
	// processes are already running).
	videoThumbSem <- struct{}{}
	defer func() { <-videoThumbSem }()

	return runFFmpegThumbnail(bin, file.RealPath(), file.Name)
}

// runFFmpegThumbnail invokes ffmpeg to produce a single 256² JPEG poster
// frame from inputPath. Time-bounded. Kept free of FileInfo/semaphore so
// it's unit-testable against a real file. `label` is only used in errors.
func runFFmpegThumbnail(bin, inputPath, label string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), videoThumbTimeout)
	defer cancel()

	// `thumbnail` picks a representative frame from the opening ~100
	// frames (skips black intros, needs no duration probe); scale + crop
	// to a 256² fill so it matches the image-thumbnail dimensions exactly.
	cmd := exec.CommandContext(ctx, bin,
		"-loglevel", "error",
		"-i", inputPath,
		"-vf", "thumbnail,scale=256:256:force_original_aspect_ratio=increase,crop=256:256",
		"-frames:v", "1",
		"-f", "mjpeg",
		"-q:v", "4",
		"pipe:1",
	)

	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg %q: %w (%s)", label, err, strings.TrimSpace(stderr.String()))
	}
	if out.Len() == 0 {
		return nil, fmt.Errorf("ffmpeg %q produced no thumbnail", label)
	}
	return out.Bytes(), nil
}
