package fbhttp

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/mholt/archives"

	fberrors "github.com/csummers-dev/vitrine/v3/errors"
	"github.com/csummers-dev/vitrine/v3/files"
)

// Comic reader — paged CBZ (zip) / CBR (rar) image viewing, read-only.
//
// A comic is just an ordered set of images inside an archive we already read.
// We enumerate + open entries via mholt/archives' read-only fs.FS (random
// access; the format is sniffed from the header, so the .cbz/.cbr extension is
// irrelevant), natural-sort the image entries into "pages", and cache each
// page's bytes on the S1-7 disk cache keyed by realPath + mtime + entry name —
// the same extract-once / serve-from-cache shape as the preview + thumbnail
// handlers (see http/preview.go, http/media_thumbnail.go).
//
// osFs-only: needs file.RealPath(), like the extract handler. Non-osFs mounts
// (in-memory / remote) aren't supported.

// A comic page is an image; 64 MB is far more than any real page needs and
// bounds how much a malformed entry can stream into memory.
const maxComicPageBytes = 64 << 20

var comicImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
	".webp": true, ".bmp": true, ".avif": true,
}

// isComicImageEntry reports whether an archive entry path is a comic page
// image. Skips dotfiles (macOS `._x` forks), the `__MACOSX/` metadata tree, and
// non-image files (ComicInfo.xml, Thumbs.db, …).
func isComicImageEntry(name string) bool {
	if strings.HasPrefix(name, "__MACOSX/") || strings.Contains(name, "/__MACOSX/") {
		return false
	}
	base := path.Base(name)
	if base == "" || strings.HasPrefix(base, ".") {
		return false
	}
	return comicImageExts[strings.ToLower(path.Ext(name))]
}

// comicListHandler: GET /api/comic/list/{path} -> {"pages": N}.
func comicListHandler(fileCache FileCache) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if !d.user.Perm.Download {
			return http.StatusForbidden, nil
		}
		file, status, err := comicFileInfo(r, d)
		if err != nil {
			return status, err
		}
		names, status, err := comicPages(r.Context(), fileCache, file.RealPath(), file.ModTime, d.server.MaxZipFileEntries)
		if err != nil {
			return status, err
		}
		return renderJSON(w, r, map[string]int{"pages": len(names)})
	})
}

// comicPageHandler: GET /api/comic/page/{index}/{path} -> the page's image bytes.
func comicPageHandler(fileCache FileCache) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if !d.user.Perm.Download {
			return http.StatusForbidden, nil
		}
		idx, convErr := strconv.Atoi(mux.Vars(r)["index"])
		if convErr != nil || idx < 0 {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		file, status, err := comicFileInfo(r, d)
		if err != nil {
			return status, err
		}
		names, status, err := comicPages(r.Context(), fileCache, file.RealPath(), file.ModTime, d.server.MaxZipFileEntries)
		if err != nil {
			return status, err
		}
		if idx >= len(names) {
			return http.StatusNotFound, fmt.Errorf("comic page %d of %d out of range", idx, len(names))
		}
		entry := names[idx]

		page, status, err := comicPageBytes(r.Context(), fileCache, file.RealPath(), file.ModTime, entry, maxComicPageBytes)
		if err != nil {
			return status, err
		}
		w.Header().Set("Cache-Control", "private")
		http.ServeContent(w, r, path.Base(entry), file.ModTime, bytes.NewReader(page))
		return 0, nil
	})
}

// comicFileInfo resolves + validates the requested comic archive.
func comicFileInfo(r *http.Request, d *data) (*files.FileInfo, int, error) {
	file, err := files.NewFileInfo(&files.FileOptions{
		Fs:         d.user.Fs,
		Path:       "/" + mux.Vars(r)["path"],
		Modify:     d.user.Perm.Modify,
		Expand:     false,
		ReadHeader: d.server.TypeDetectionByHeader,
		Checker:    d,
	})
	if err != nil {
		return nil, errToStatus(err), err
	}
	// Cheap pre-filter on the outer archive size (the real per-page bound is
	// applied while reading each page).
	if file.Size > d.server.MaxZipFileSize {
		return nil, http.StatusBadRequest, fberrors.ErrZipFileIsTooLarge
	}
	return file, 0, nil
}

// ── extraction + caching ────────────────────────────────────────────────────

func comicKeyBase(realPath string, mtime time.Time) string {
	sum := sha256.Sum256([]byte(realPath))
	return fmt.Sprintf("comic:%s:%x", hex.EncodeToString(sum[:8]), mtime.Unix())
}

// comicPages returns the natural-sorted image entry names (the "pages"),
// building + caching a manifest on first access. Idempotent, so the page
// handler works even if /list was never called.
func comicPages(ctx context.Context, cache FileCache, realPath string, mtime time.Time, maxEntries int) ([]string, int, error) {
	manifestKey := comicKeyBase(realPath, mtime) + ":names"
	if raw, ok, _ := cache.Load(ctx, manifestKey); ok {
		var names []string
		if json.Unmarshal(raw, &names) == nil {
			return names, 0, nil
		}
	}

	// Password-protected comics aren't supported — surface a clean "not
	// supported" error up front (at /list) so the reader shows one friendly
	// message instead of a string of broken page loads. A `.cbz` (zip) carries
	// an explicit per-entry encryption flag we can read without decrypting;
	// zipIsEncrypted returns false for non-zip (`.cbr`) inputs, which the
	// post-listing probe below covers instead.
	if enc, _ := zipIsEncrypted(realPath); enc {
		return nil, http.StatusBadRequest, fberrors.ErrEncryptedArchiveUnsupported
	}

	fsys, err := archives.FileSystem(ctx, realPath, nil)
	if err != nil {
		return nil, comicErrStatus(err), comicErr(err)
	}

	var names []string
	walkErr := fs.WalkDir(fsys, ".", func(p string, de fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if de.IsDir() || !isComicImageEntry(p) {
			return nil
		}
		names = append(names, p)
		if len(names) > maxEntries {
			return fberrors.ErrZipFileIsTooLarge
		}
		return nil
	})
	if walkErr != nil {
		return nil, comicErrStatus(walkErr), comicErr(walkErr)
	}
	if len(names) == 0 {
		return nil, http.StatusUnsupportedMediaType, errors.New("comic archive contains no images")
	}

	sort.Slice(names, func(i, j int) bool { return naturalLess(names[i], names[j]) })

	// Catch content-encrypted archives (e.g. a `.cbr` whose entries list fine
	// but whose pages can't be decrypted): probe the first page's first bytes.
	// An encryption failure → friendly "not supported"; any other probe error
	// is left for the page handler to report when the page is actually fetched.
	if probeErr := comicProbe(fsys, names[0]); probeErr != nil && isEncryptionErr(probeErr) {
		return nil, http.StatusBadRequest, fberrors.ErrEncryptedArchiveUnsupported
	}

	if blob, mErr := json.Marshal(names); mErr == nil {
		_ = cache.Store(ctx, manifestKey, blob)
	}
	return names, 0, nil
}

// comicPageBytes returns one page's (entry's) bytes, caching them on first read.
func comicPageBytes(ctx context.Context, cache FileCache, realPath string, mtime time.Time, entry string, maxSize int64) ([]byte, int, error) {
	sum := sha256.Sum256([]byte(entry))
	pageKey := comicKeyBase(realPath, mtime) + ":p:" + hex.EncodeToString(sum[:8])
	if raw, ok, _ := cache.Load(ctx, pageKey); ok {
		return raw, 0, nil
	}

	fsys, err := archives.FileSystem(ctx, realPath, nil)
	if err != nil {
		return nil, comicErrStatus(err), comicErr(err)
	}
	f, err := fsys.Open(entry)
	if err != nil {
		return nil, comicErrStatus(err), comicErr(err)
	}
	defer f.Close()

	// Bounded read: read maxSize+1 so an over-cap entry is detectable.
	buf, err := io.ReadAll(io.LimitReader(f, maxSize+1))
	if err != nil {
		return nil, comicErrStatus(err), comicErr(err)
	}
	if int64(len(buf)) > maxSize {
		return nil, http.StatusBadRequest, fberrors.ErrUncompressSizeIsTooLarge
	}

	_ = cache.Store(ctx, pageKey, buf)
	return buf, 0, nil
}

// comicErr maps a password failure to the friendly error; otherwise returns
// the original (treated as an unsupported / corrupt archive).
func comicErr(err error) error {
	if isEncryptionErr(err) {
		return fberrors.ErrEncryptedArchiveUnsupported
	}
	return err
}

func comicErrStatus(err error) int {
	if errors.Is(err, fs.ErrNotExist) {
		return http.StatusNotFound
	}
	return http.StatusBadRequest
}

// comicProbe opens one entry and reads its first bytes, returning whatever
// error the read produces — enough to trip a content-encryption decode failure
// without reading the whole page. Used to detect password-protected comics that
// list fine but can't be decrypted.
func comicProbe(fsys fs.FS, name string) error {
	f, err := fsys.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(io.Discard, io.LimitReader(f, 1024))
	return err
}

// naturalLess compares two filenames with numeric-aware ("natural") ordering so
// that page2 < page10. Letters compare case-insensitively; exact ties fall back
// to a raw-byte compare for stability.
func naturalLess(a, b string) bool {
	la, lb := strings.ToLower(a), strings.ToLower(b)
	i, j := 0, 0
	for i < len(la) && j < len(lb) {
		if isASCIIDigit(la[i]) && isASCIIDigit(lb[j]) {
			si, sj := i, j
			for i < len(la) && isASCIIDigit(la[i]) {
				i++
			}
			for j < len(lb) && isASCIIDigit(lb[j]) {
				j++
			}
			na := strings.TrimLeft(la[si:i], "0")
			nb := strings.TrimLeft(lb[sj:j], "0")
			if len(na) != len(nb) {
				return len(na) < len(nb) // fewer significant digits = smaller number
			}
			if na != nb {
				return na < nb
			}
			continue // equal numeric value; keep comparing the rest
		}
		if la[i] != lb[j] {
			return la[i] < lb[j]
		}
		i++
		j++
	}
	if (len(la) - i) != (len(lb) - j) {
		return (len(la) - i) < (len(lb) - j) // shorter remainder sorts first
	}
	return a < b
}

func isASCIIDigit(b byte) bool { return b >= '0' && b <= '9' }
