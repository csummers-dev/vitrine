package fbhttp

import (
	"errors"
	"net/http"
	"time"

	"github.com/csummers-dev/vitrine/v3/foldersize"
)

// folderSizeResponse is the JSON body of GET /api/folder-size{path}: the folder's
// recursive total byte size and when that figure was actually measured (so the
// UI can show a freshness hint and re-fetch if it wants a newer number).
type folderSizeResponse struct {
	Size       int64     `json:"size"`
	ComputedAt time.Time `json:"computedAt"`
}

// folderSizeHandler serves the cached recursive size of a directory (2.4.0 Stage
// 4 / E). It's a GET so it's safe to poll; the heavy lifting (a tree walk) only
// happens on a cache miss or a stale entry — see the foldersize package. Files
// are rejected with 400 (their size is already in the listing); the per-volume
// .trash is never counted.
func folderSizeHandler(cache *foldersize.Cache) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if !d.Check(r.URL.Path) {
			return http.StatusForbidden, nil
		}
		size, computedAt, err := cache.Size(d.user.ID, d.user.Fs, r.URL.Path)
		if err != nil {
			if errors.Is(err, foldersize.ErrNotDir) {
				return http.StatusBadRequest, err
			}
			return errToStatus(err), err
		}
		return renderJSON(w, r, folderSizeResponse{Size: size, ComputedAt: computedAt})
	})
}
