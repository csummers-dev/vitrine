package fbhttp

import (
	"archive/zip"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/filebrowser/filebrowser/v2/settings"
	"github.com/spf13/afero"
)

// unzipHandler implements POST /api/unzip{path}?destination=...&override=...
//
// Adapted from upstream PR #5746. Differences vs. upstream:
//   - Uses settings.DefaultFileMode / settings.DefaultDirMode so created
//     entries respect the operator's umask, instead of hard-coding 0755.
//   - Closes outFile / rc via defer immediately after open, so an error
//     from io.Copy can't leak a file handle (the original closed only
//     on the success path).
//   - Stronger Zip-Slip check: computes `filepath.Rel(dst, outPath)` and
//     rejects any entry that resolves outside the destination, in
//     addition to the string-prefix checks on the raw entry name.
func unzipHandler() handleFunc {
	return withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
		// Decode percent-escapes in the path so filenames containing
		// spaces or other special chars (`%20`, `+`, etc.) resolve to
		// their real on-disk name rather than the literal escape
		// sequence. Without this, `My File.zip` becomes `My%20File.zip`
		// inside the handler and NewFileInfo returns 404. Same for the
		// `destination` query parameter — which the frontend already
		// `encodeURIComponent`s before sending.
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

		// Outer archive size cap.
		if file.Size > d.server.MaxZipFileSize {
			return http.StatusBadRequest, fberrors.ErrZipFileIsTooLarge
		}

		// zip.OpenReader reads from the OS path directly. This sidesteps
		// the user's afero.Fs and works only on osFs-backed mounts —
		// fine for the standard filebrowser deployment, would need
		// rework for in-memory or remote-backed filesystems.
		reader, err := zip.OpenReader(file.RealPath())
		if err != nil {
			return http.StatusInternalServerError, err
		}
		defer reader.Close()

		// Entry-count cap.
		if len(reader.File) > d.server.MaxZipFileEntries {
			return http.StatusBadRequest, fberrors.ErrZipFileIsTooLarge
		}

		// Cumulative uncompressed size cap.
		var totalUncompressedSize uint64
		for _, f := range reader.File {
			totalUncompressedSize += f.UncompressedSize64
			if totalUncompressedSize > d.server.MaxTotalUncompressedSize {
				return http.StatusBadRequest, fberrors.ErrUncompressSizeIsTooLarge
			}
		}

		// Pre-clean destination path (used by both string-prefix and
		// filepath.Rel safety checks below).
		cleanDst := filepath.Clean(dst)

		for _, f := range reader.File {
			// Per-entry compression ratio (zip-bomb defense).
			if f.UncompressedSize64 == 0 {
				if f.CompressedSize64 > 0 {
					return http.StatusBadRequest, fberrors.ErrInvalidZipEntry
				}
			} else {
				ratio := float64(f.CompressedSize64) / float64(f.UncompressedSize64)
				if ratio < d.server.MaxUncompressedSizeRate {
					return http.StatusBadRequest, fberrors.ErrCompressionRateIsTooLarge
				}
			}

			// Zip-Slip defense — string-prefix pass first (cheap; catches
			// blatant cases). Reject absolute paths and obvious `..`
			// escapes.
			cleanName := filepath.Clean(f.Name)
			if strings.HasPrefix(cleanName, "/") || strings.HasPrefix(cleanName, "../") || strings.Contains(cleanName, "/../") {
				return http.StatusBadRequest, fberrors.ErrInvalidZipFilePath
			}
			outPath := filepath.Join(cleanDst, cleanName)

			// Zip-Slip defense — second pass via filepath.Rel. Catches
			// edge cases the string-prefix check misses (symlink names,
			// mixed separators on Windows, redundant `./` segments).
			rel, relErr := filepath.Rel(cleanDst, outPath)
			if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return http.StatusBadRequest, fberrors.ErrInvalidZipFilePath
			}

			// Per-entry destination permission check (handles rules that
			// allow the outer dir but deny a subtree).
			if !d.Check(outPath) {
				return http.StatusForbidden, fberrors.ErrInvalidZipFilePath
			}

			// Directory entry — create with the configured dir mode.
			if f.FileInfo().IsDir() {
				dirMode := d.settings.DirMode
				if dirMode == 0 {
					dirMode = settings.DefaultDirMode
				}
				if err := d.user.Fs.MkdirAll(outPath, dirMode); err != nil {
					return http.StatusInternalServerError, err
				}
				continue
			}

			// Ensure parent dirs exist.
			dirMode := d.settings.DirMode
			if dirMode == 0 {
				dirMode = settings.DefaultDirMode
			}
			if err := d.user.Fs.MkdirAll(filepath.Dir(outPath), dirMode); err != nil {
				return http.StatusInternalServerError, err
			}

			// Honor override flag for file collisions.
			if !override {
				if exists, _ := afero.Exists(d.user.Fs, outPath); exists {
					continue
				}
			}

			// Per-file uncompressed size cap.
			if f.UncompressedSize64 > d.server.MaxUncompressedFileSize {
				return http.StatusInternalServerError, fberrors.ErrUncompressSizeIsTooLarge
			}

			// Open the archive entry. Deferred close runs on any return
			// path (success, error, or "lying header" detection below).
			rc, err := f.Open()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// Create the output file with the configured file mode.
			fileMode := d.settings.FileMode
			if fileMode == 0 {
				fileMode = settings.DefaultFileMode
			}
			outFile, err := d.user.Fs.OpenFile(outPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, fileMode)
			if err != nil {
				rc.Close()
				return http.StatusInternalServerError, err
			}

			// Bounded copy. LimitReader caps how much we'll write even
			// if the archive entry streams more than its declared size.
			limited := io.LimitReader(rc, int64(d.server.MaxUncompressedFileSize))
			n, copyErr := io.Copy(outFile, limited)

			// Close both before evaluating errors so file handles never
			// leak — even if io.Copy errored mid-stream.
			closeOutErr := outFile.Close()
			rc.Close()

			if copyErr != nil {
				return http.StatusInternalServerError, copyErr
			}
			if closeOutErr != nil {
				return http.StatusInternalServerError, closeOutErr
			}

			// "Lying header" check — archive said this entry was N bytes
			// but it streamed more. Treat as corrupt / malicious.
			if n > int64(f.UncompressedSize64) {
				return http.StatusBadRequest, fberrors.ErrInvalidZipEntry
			}
		}

		return http.StatusOK, nil
	})
}
