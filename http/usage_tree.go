package fbhttp

import (
	"errors"
	"net/http"
	"path"
	"path/filepath"
	"strconv"
	"time"

	"github.com/shirou/gopsutil/v4/disk"
	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/files"
	"github.com/csummers-dev/vitrine/v4/trash"
	"github.com/csummers-dev/vitrine/v4/usagetree"
)

// usageTreeResponse is GET /api/usage/tree{path} (4.0 Phase 5.1): what uses
// space under a folder, for the Storage view's treemap and largest-files list.
type usageTreeResponse struct {
	*usagetree.Result
	ComputedAt time.Time `json:"computedAt"`
	// Disk is the volume holding the folder; omitted when unknown.
	Disk *DiskUsageResponse `json:"disk,omitempty"`
}

// buildUsageTree measures root in the user's filesystem, honoring their
// rules and leaving out the hidden recycle bin.
func buildUsageTree(afs afero.Fs, root string, depth int, allowed func(string) bool) (*usagetree.Result, error) {
	return usagetree.Build(
		func(r string, fn filepath.WalkFunc) error { return afero.Walk(afs, r, fn) },
		root,
		usagetree.Options{
			Depth:   depth,
			Allowed: allowed,
			SkipDir: func(name string) bool { return name == trash.Dirname },
			Kind:    searchKind,
		},
	)
}

// usageTreeHandler serves the size tree under a folder. depth (1–4,
// default 2) picks how many levels get their own blocks; refresh=1 skips
// the cache.
func usageTreeHandler(cache *usageTreeCache) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		root := path.Clean("/" + r.URL.Path)
		if !d.Check(root) {
			return http.StatusForbidden, nil
		}
		info, err := d.user.Fs.Stat(root)
		if err != nil {
			return errToStatus(err), err
		}
		if !info.IsDir() {
			return http.StatusBadRequest, errors.New("usage tree: not a folder")
		}
		depth, _ := strconv.Atoi(r.URL.Query().Get("depth"))
		depth = min(max(depth, 1), 4)
		if r.URL.Query().Get("depth") == "" {
			depth = 2
		}

		key := strconv.FormatUint(uint64(d.user.ID), 10) + "\x00" + root + "\x00" + strconv.Itoa(depth)
		res, at, err := cache.get(key, r.URL.Query().Get("refresh") == "1", func() (*usagetree.Result, error) {
			return buildUsageTree(d.user.Fs, root, depth, d.Check)
		})
		if err != nil {
			return http.StatusInternalServerError, err
		}

		out := usageTreeResponse{Result: res, ComputedAt: at}
		if fi, ferr := files.NewFileInfo(&files.FileOptions{
			Fs: d.user.Fs, Path: root, Checker: d,
		}); ferr == nil {
			if u, uerr := disk.UsageWithContext(r.Context(), fi.RealPath()); uerr == nil {
				out.Disk = &DiskUsageResponse{Total: u.Total, Used: u.Used}
			}
		}
		return renderJSON(w, r, out)
	})
}
