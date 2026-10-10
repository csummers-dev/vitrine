package fbhttp

import (
	"mime"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// searchFilter holds the name/kind/size/age filters of
// `/api/search/recursive` (4.0 Phase 5.3 adds kind, size and age so saved
// searches can say "videos over 4 GB" or "photos from the last week").
// Tags are matched separately, in one batched lookup after the walk.
type searchFilter struct {
	q    string // lowercased basename substring
	ext  string // lowercased extension, no dot
	kind string // image | video | audio | pdf | text | archive
	// minSize/maxSize are inclusive byte bounds; -1 when unset.
	minSize int64
	maxSize int64
	// newer keeps entries modified at or after this time (zero = unset).
	newer time.Time
}

// parseSearchFilter reads q, ext, type, minSize, maxSize and newer (Unix
// seconds). Malformed numbers are ignored rather than rejected, the same
// as malformed tag ids: a typo narrows nothing instead of failing.
func parseSearchFilter(v url.Values) searchFilter {
	f := searchFilter{
		q:       strings.ToLower(strings.TrimSpace(v.Get("q"))),
		ext:     strings.ToLower(strings.TrimPrefix(strings.TrimSpace(v.Get("ext")), ".")),
		kind:    strings.ToLower(strings.TrimSpace(v.Get("type"))),
		minSize: -1,
		maxSize: -1,
	}
	if n, err := strconv.ParseInt(v.Get("minSize"), 10, 64); err == nil && n >= 0 {
		f.minSize = n
	}
	if n, err := strconv.ParseInt(v.Get("maxSize"), 10, 64); err == nil && n >= 0 {
		f.maxSize = n
	}
	if n, err := strconv.ParseInt(v.Get("newer"), 10, 64); err == nil && n > 0 {
		f.newer = time.Unix(n, 0)
	}
	return f
}

// filesOnly reports whether the filter only makes sense for files: folders
// have no extension, kind or meaningful size.
func (f searchFilter) filesOnly() bool {
	return f.ext != "" || f.kind != "" || f.minSize >= 0 || f.maxSize >= 0
}

func (f searchFilter) match(name string, isDir bool, size int64, mod time.Time) bool {
	if isDir && f.filesOnly() {
		return false
	}
	if f.ext != "" && strings.ToLower(strings.TrimPrefix(filepath.Ext(name), ".")) != f.ext {
		return false
	}
	if f.kind != "" && searchKind(name) != f.kind {
		return false
	}
	if f.minSize >= 0 && size < f.minSize {
		return false
	}
	if f.maxSize >= 0 && size > f.maxSize {
		return false
	}
	if !f.newer.IsZero() && mod.Before(f.newer) {
		return false
	}
	if f.q != "" && !strings.Contains(strings.ToLower(name), f.q) {
		return false
	}
	return true
}

// Extensions classified up front so the kinds don't depend on the host's
// MIME tables (which differ between distros and containers).
var searchKindByExt = map[string]string{}

func init() {
	for kind, exts := range map[string]string{
		"image":   "jpg jpeg png gif webp avif heic heif bmp tif tiff svg raw cr2 cr3 nef arw dng",
		"video":   "mp4 m4v mkv mov avi webm wmv flv mpg mpeg ts m2ts 3gp ogv",
		"audio":   "mp3 m4a m4b flac wav ogg oga opus aac wma aiff alac ape",
		"pdf":     "pdf",
		"text":    "txt md markdown csv tsv json yaml yml toml ini conf log xml html htm css js go py rb rs java c h cpp sh srt vtt",
		"archive": "zip 7z rar tar gz tgz bz2 tbz2 xz txz zst lz4 cbz cbr",
	} {
		for _, e := range strings.Fields(exts) {
			searchKindByExt[e] = kind
		}
	}
}

// searchKind classifies a file by extension: image, video, audio, pdf,
// text, archive, or "" when unknown.
func searchKind(name string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
	if ext == "" {
		return ""
	}
	if k, ok := searchKindByExt[ext]; ok {
		return k
	}
	typ := mime.TypeByExtension("." + ext)
	switch {
	case strings.HasPrefix(typ, "image/"):
		return "image"
	case strings.HasPrefix(typ, "video/"):
		return "video"
	case strings.HasPrefix(typ, "audio/"):
		return "audio"
	case strings.HasPrefix(typ, "text/"):
		return "text"
	}
	return ""
}

// listingType maps a search kind to the listing's file type, which drives
// icons and thumbnails in the client.
func listingType(name string, isDir bool) string {
	if isDir {
		return "dir"
	}
	switch k := searchKind(name); k {
	case "image", "video", "audio", "pdf", "text":
		return k
	}
	return "blob"
}
