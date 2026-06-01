package fbhttp

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/mholt/archives"
	"github.com/spf13/afero"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/filebrowser/filebrowser/v2/settings"
)

// extractHandler implements POST /api/unzip{path}?destination=...&override=...
//
// Despite the legacy "/api/unzip" route name, this extracts any supported
// archive format — zip, 7z, rar (incl. RAR multi-volume), and the tar family
// (.tar / .tar.gz / .tgz / .tar.bz2 / .tar.xz / .tar.zst) — via
// github.com/mholt/archives. Split-ZIP (.z01) and multi-volume 7z (.7z.001)
// are detected and rejected; password-protected archives are rejected.
//
// Like the original zip-only handler it reads from the real OS path
// (file.RealPath()), so it only works on osFs-backed mounts: 7z needs
// io.ReaderAt+Seeker and RAR multi-volume needs an fs.FS over the volume
// directory. The Zip-Slip defenses, per-entry permission checks, and size /
// entry-count / decompression caps all carry over from the zip implementation;
// the caps are now enforced as running counters during the streaming walk.
func extractHandler() handleFunc {
	return withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
		// Decode percent-escapes so names with spaces / special chars resolve
		// to their real on-disk name (mirrors the old handler).
		src, err := url.PathUnescape(r.URL.Path)
		if err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		dst, err := url.QueryUnescape(r.URL.Query().Get("destination"))
		if err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		dst = filepath.Clean(dst)
		override := r.URL.Query().Get("override") == "true"

		// Permission + feature gates.
		if !d.server.UnzipEnabled || !d.user.Perm.Create || !d.Check(src) || !d.Check(dst) {
			return http.StatusForbidden, nil
		}

		// Resolve source archive metadata.
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

		// Outer archive size cap (pre-open). For a multi-volume set this only
		// caps the clicked volume — a cheap pre-filter, not the real defense.
		if file.Size > d.server.MaxZipFileSize {
			return http.StatusBadRequest, fberrors.ErrZipFileIsTooLarge
		}

		// Pick the right extractor for this archive (handles RAR multi-volume
		// and rejects unsupported / multi-volume-7z / split-zip formats).
		extractor, reader, closeFn, err := detectArchive(r.Context(), file.RealPath())
		if err != nil {
			return errToStatus(err), err
		}
		defer closeFn()

		cleanDst := filepath.Clean(dst)

		// Running guards: archive walks stream entries (no pre-scan), so the
		// caps are enforced as we go.
		var (
			entryCount int
			totalBytes uint64
		)

		walkErr := extractor.Extract(r.Context(), reader, func(_ context.Context, entry archives.FileInfo) error {
			// Entry-count cap.
			entryCount++
			if entryCount > d.server.MaxZipFileEntries {
				return fberrors.ErrZipFileIsTooLarge
			}

			// Skip symlinks / hard links / devices / fifos / sockets — only
			// plain files and directories are materialized. Closes link-based
			// escape vectors (tar can carry these; zip rarely did).
			mode := entry.Mode()
			if entry.LinkTarget != "" || mode&fs.ModeSymlink != 0 ||
				(!entry.IsDir() && !mode.IsRegular()) {
				return nil
			}

			// Zip-only compression-ratio (zip-bomb) check: only zip exposes
			// per-entry compressed size uniformly. Other formats rely on the
			// streaming total / per-file / entry-count / outer-size caps.
			if zh, ok := entry.Header.(zip.FileHeader); ok {
				if zh.UncompressedSize64 == 0 {
					if zh.CompressedSize64 > 0 {
						return fberrors.ErrInvalidZipEntry
					}
				} else {
					ratio := float64(zh.CompressedSize64) / float64(zh.UncompressedSize64)
					if ratio < d.server.MaxUncompressedSizeRate {
						return fberrors.ErrCompressionRateIsTooLarge
					}
				}
			}

			// Zip-Slip defense — string-prefix pass first.
			cleanName := filepath.Clean(entry.NameInArchive)
			if strings.HasPrefix(cleanName, "/") ||
				strings.HasPrefix(cleanName, "../") ||
				strings.Contains(cleanName, "/../") {
				return fberrors.ErrInvalidZipFilePath
			}
			outPath := filepath.Join(cleanDst, cleanName)

			// Zip-Slip defense — second pass via filepath.Rel (catches mixed
			// separators, redundant ./ segments, etc.).
			rel, relErr := filepath.Rel(cleanDst, outPath)
			if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return fberrors.ErrInvalidZipFilePath
			}

			// Per-entry destination permission check.
			if !d.Check(outPath) {
				return fberrors.ErrInvalidZipFilePath
			}

			dirMode := d.settings.DirMode
			if dirMode == 0 {
				dirMode = settings.DefaultDirMode
			}

			// Directory entry.
			if entry.IsDir() {
				if mkErr := d.user.Fs.MkdirAll(outPath, dirMode); mkErr != nil {
					return mkErr
				}
				return nil
			}

			// Ensure parent dirs exist.
			if mkErr := d.user.Fs.MkdirAll(filepath.Dir(outPath), dirMode); mkErr != nil {
				return mkErr
			}

			// Honor override flag for file collisions.
			if !override {
				if exists, _ := afero.Exists(d.user.Fs, outPath); exists {
					return nil
				}
			}

			// Per-file uncompressed size cap (declared size, when known).
			declared := entry.Size()
			if declared > 0 && uint64(declared) > d.server.MaxUncompressedFileSize {
				return fberrors.ErrUncompressSizeIsTooLarge
			}

			// Open the archive entry.
			rc, openErr := entry.Open()
			if openErr != nil {
				return openErr
			}

			fileMode := d.settings.FileMode
			if fileMode == 0 {
				fileMode = settings.DefaultFileMode
			}
			outFile, outErr := d.user.Fs.OpenFile(outPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, fileMode)
			if outErr != nil {
				rc.Close()
				return outErr
			}

			// Bounded copy — caps written bytes even if the entry streams
			// more than its declared size.
			limited := io.LimitReader(rc, int64(d.server.MaxUncompressedFileSize))
			n, copyErr := io.Copy(outFile, limited)

			closeOutErr := outFile.Close()
			rc.Close()

			if copyErr != nil {
				return copyErr
			}
			if closeOutErr != nil {
				return closeOutErr
			}

			// "Lying header" check — entry declared N bytes but streamed more.
			if declared > 0 && n > declared {
				return fberrors.ErrInvalidZipEntry
			}

			// Cumulative uncompressed cap.
			totalBytes += uint64(n)
			if totalBytes > d.server.MaxTotalUncompressedSize {
				return fberrors.ErrUncompressSizeIsTooLarge
			}

			return nil
		})

		if walkErr != nil {
			// Map a password / encryption failure to a friendly error.
			if isEncryptionErr(walkErr) {
				return http.StatusBadRequest, fberrors.ErrEncryptedArchiveUnsupported
			}
			return errToStatus(walkErr), walkErr
		}

		return http.StatusOK, nil
	})
}

// Archive name patterns. Compiled once.
var (
	reSplitZip   = regexp.MustCompile(`(?i)\.z\d+$`)    // foo.z01, foo.z02 …
	reMultiVol7z = regexp.MustCompile(`(?i)\.7z\.\d+$`) // foo.7z.001 …
	rePartRar    = regexp.MustCompile(`(?i)^(.*\.part)(\d+)(\.rar)$`)
	reOldRar     = regexp.MustCompile(`(?i)^(.*)\.r\d+$`) // foo.r00, foo.r01 …
)

// detectArchive selects the extractor for the archive at realPath. It returns
// the extractor, the source reader to feed Extract (nil for the RAR
// multi-volume path, which opens via its own fs.FS), and a cleanup func the
// caller must defer. Unsupported / split / multi-volume-7z formats yield a
// typed error.
func detectArchive(ctx context.Context, realPath string) (archives.Extractor, io.Reader, func(), error) {
	base := filepath.Base(realPath)
	lower := strings.ToLower(base)
	noop := func() {}

	// Reject split / multi-volume formats we don't support (by name).
	if reSplitZip.MatchString(lower) || reMultiVol7z.MatchString(lower) {
		return nil, nil, noop, fberrors.ErrMultiVolumeUnsupported
	}

	// RAR (single or multi-volume): rardecode derives sibling volumes itself
	// when given the FIRST volume name + an fs.FS over the directory.
	if strings.HasSuffix(lower, ".rar") || reOldRar.MatchString(base) {
		dir := filepath.Dir(realPath)
		first := firstRarVolume(base)
		// The first volume must be present to start the set.
		if _, statErr := os.Stat(filepath.Join(dir, first)); statErr != nil {
			return nil, nil, noop, fmt.Errorf("opening rar volume %q: %w", first, fs.ErrNotExist)
		}
		ex := archives.Rar{Name: first, FS: os.DirFS(dir)}
		return ex, nil, noop, nil
	}

	// Everything else: sniff by header+name and use the identified format.
	f, err := os.Open(realPath)
	if err != nil {
		return nil, nil, noop, err
	}
	format, _, idErr := archives.Identify(ctx, base, f)
	if idErr != nil {
		f.Close()
		if errors.Is(idErr, archives.NoMatch) {
			return nil, nil, noop, fberrors.ErrUnsupportedArchive
		}
		return nil, nil, noop, idErr
	}
	ex, ok := format.(archives.Extractor)
	if !ok {
		// e.g. a lone compressed file (.gz) with no archive inside — nothing
		// to "extract" into a folder.
		f.Close()
		return nil, nil, noop, fberrors.ErrUnsupportedArchive
	}
	// Identify may have advanced the stream; rewind before extracting.
	if _, seekErr := f.Seek(0, io.SeekStart); seekErr != nil {
		f.Close()
		return nil, nil, noop, seekErr
	}
	return ex, f, func() { f.Close() }, nil
}

// firstRarVolume returns the first-volume filename for a RAR set so rardecode
// can start from the beginning regardless of which part the user clicked.
//   - new-style:  name.partNN.rar -> name.part0…1.rar (preserving digit width)
//   - old-style:  name.rNN        -> name.rar
//   - single rar / .rar:           -> itself
func firstRarVolume(base string) string {
	if m := rePartRar.FindStringSubmatch(base); m != nil {
		width := len(m[2])
		return fmt.Sprintf("%s%0*d%s", m[1], width, 1, m[3])
	}
	if strings.HasSuffix(strings.ToLower(base), ".rar") {
		return base
	}
	if m := reOldRar.FindStringSubmatch(base); m != nil {
		return m[1] + ".rar"
	}
	return base
}

// isEncryptionErr reports whether an extraction error is due to the archive
// being password-protected. We match on message text to avoid taking direct
// dependencies on the rardecode / sevenzip sentinel errors.
func isEncryptionErr(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "password") || strings.Contains(msg, "encrypt")
}
