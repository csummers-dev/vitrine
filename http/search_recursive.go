package fbhttp

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v3/tags"
)

// searchRecursiveHandler implements `GET /api/search/recursive{path}`
// — the compound-filter search that backs both the command palette's
// structured queries and the smart-folder evaluator (Stage 2).
//
// Query params (all optional, AND semantics):
//
//	q=<term>     case-insensitive substring match on basename
//	ext=<ext>    case-insensitive extension match (no leading dot)
//	tag=<id>     file must have THIS tag (repeatable; multiple
//	             tag= params require the file to have EVERY tag —
//	             intersection, not union)
//
// Returns a flat JSON array of `RecursiveEntry`. Path is taken from
// `r.URL.Path` after the route's prefix strip — the search is rooted
// there, not at the user's scope root.
//
// Implementation: walks the tree once (afero.Walk) applying q + ext
// filters inline. If tag filters are present, candidates are then
// passed through a single BatchTagsForFiles call to avoid an N+1
// lookup. Tag-set membership uses subset semantics — the file's tag
// set must be a superset of the requested set.
//
// Returns 503 when the tags store isn't initialized AND tag filters
// were requested (operators running with audit on / tags off get a
// usable error instead of an opaque 500).
var searchRecursiveHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	rootPath := r.URL.Path
	if rootPath == "" {
		rootPath = "/"
	}

	// Confirm the root exists and is a directory — same shape as the
	// existing resourceGetRecursiveHandler so behavior is consistent
	// from the client's perspective.
	info, err := d.user.Fs.Stat(rootPath)
	if err != nil {
		return errToStatus(err), err
	}
	if !info.IsDir() {
		return http.StatusBadRequest, errors.New("search: root path is not a directory")
	}

	// Parse + normalize filters once, outside the walk loop.
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	ext := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("ext")), "."))

	// Tag filter is a uint64 set (repeatable param). Bad values are
	// silently skipped — a typo'd tag ID shouldn't 500 the whole
	// search; it just narrows to "no match" semantically.
	var tagIDs []uint64
	for _, raw := range r.URL.Query()["tag"] {
		id, parseErr := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
		if parseErr == nil && id > 0 {
			tagIDs = append(tagIDs, id)
		}
	}

	if len(tagIDs) > 0 && d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("search: tags store not initialized")
	}

	// First pass: walk the tree, apply q + ext + rule-checker filters.
	candidates := make([]RecursiveEntry, 0)
	err = afero.Walk(d.user.Fs, rootPath, func(fPath string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			// Skip unreadable entries — same as resourceGetRecursive.
			// A single permission-denied file shouldn't abort the
			// whole search.
			return nil
		}
		if fPath == rootPath {
			return nil
		}
		if !d.Check(fPath) {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Extension filter implicitly excludes directories (folders
		// don't have extensions in the user-facing sense). Tag-only
		// queries (no ext, no q) still let directories through — folders
		// are taggable too.
		if ext != "" {
			if fi.IsDir() {
				return nil
			}
			fileExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(fi.Name()), "."))
			if fileExt != ext {
				return nil
			}
		}

		if q != "" && !strings.Contains(strings.ToLower(fi.Name()), q) {
			return nil
		}

		candidates = append(candidates, RecursiveEntry{
			Path:    fPath,
			Name:    fi.Name(),
			Size:    fi.Size(),
			ModTime: fi.ModTime(),
			IsDir:   fi.IsDir(),
		})
		return nil
	})
	if err != nil {
		return http.StatusInternalServerError, err
	}

	// Second pass: tag intersection. Single batched lookup avoids the
	// per-file DB round-trip an inline TagsForFile would cost.
	if len(tagIDs) > 0 {
		paths := make([]string, len(candidates))
		for i, c := range candidates {
			paths[i] = c.Path
		}
		tagsByPath, tagErr := d.tagsStore.BatchTagsForFiles(d.user.ID, paths)
		if tagErr != nil {
			return http.StatusInternalServerError, tagErr
		}

		filtered := candidates[:0]
		for _, c := range candidates {
			if hasAllTagIDs(tagsByPath[c.Path], tagIDs) {
				filtered = append(filtered, c)
			}
		}
		candidates = filtered
	}

	return renderJSON(w, r, candidates)
})

// hasAllTagIDs returns true when every wanted ID appears in present.
// Linear scan since wanted is always small (typically 1–3).
func hasAllTagIDs(present []*tags.Tag, wanted []uint64) bool {
	for _, want := range wanted {
		found := false
		for _, t := range present {
			if t.ID == want {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
