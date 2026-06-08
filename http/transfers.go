package fbhttp

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"path"

	"github.com/gorilla/mux"
	"github.com/spf13/afero"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/events"
	"github.com/filebrowser/filebrowser/v2/fileutils"
	"github.com/filebrowser/filebrowser/v2/jobs"
)

// transferPayload is the per-job execution context the worker reads back off the
// job. It captures everything a copy/move needs that varies per request — the
// user's scoped filesystem, the mode bits, and the audit event base — so the
// single shared executor can run any user's transfer.
type transferPayload struct {
	fs       afero.Fs
	fileMode fs.FileMode
	dirMode  fs.FileMode
	base     events.Base
}

// transferManager owns the background transfer (move/copy) job registry and the
// executor that runs each job with progress + cancellation. One per server; its
// registry runs jobs through a single sequential worker.
type transferManager struct {
	reg *jobs.Registry
}

func newTransferManager() *transferManager {
	tm := &transferManager{}
	tm.reg = jobs.New(tm.execute)
	return tm
}

// execute is the jobs.Executor. It copies/moves each item with byte-level
// progress, honoring cancellation. On any item error (including cancel) it rolls
// back that item's partial destination, leaves the source untouched, and stops
// the batch. Each successful item publishes the matching audit event — parity
// with the synchronous PATCH handler.
//
// Note: unlike the PATCH handler this does NOT proactively evict the moved
// file's thumbnail cache entries. Those are keyed by path, so a moved file just
// regenerates fresh thumbnails at its new path; the stale entries are reclaimed
// by the cache's LRU. Skipping it keeps the executor free of cache/file deps.
func (tm *transferManager) execute(ctx context.Context, j *jobs.Job) error {
	pl, ok := j.Payload().(*transferPayload)
	if !ok || pl == nil {
		return errors.New("transfer: missing execution context")
	}

	// Pre-walk so the percentage has a real denominator from the first poll.
	var totalBytes int64
	var totalFiles int
	for _, it := range j.Items() {
		b, n, err := fileutils.CountBytes(pl.fs, it.From)
		if err != nil {
			continue // an unreadable source surfaces below when we try to copy it
		}
		totalBytes += b
		totalFiles += n
	}
	j.SetTotals(totalBytes, totalFiles)

	isCopy := j.Kind() == jobs.KindCopy
	for _, it := range j.Items() {
		if err := ctx.Err(); err != nil {
			return err
		}
		j.StartFile(path.Base(it.From), it.To)

		var err error
		if isCopy {
			err = fileutils.CopyWithProgress(ctx, pl.fs, it.From, it.To, pl.fileMode, pl.dirMode, j)
		} else {
			err = fileutils.MoveFileWithProgress(ctx, pl.fs, it.From, it.To, pl.fileMode, pl.dirMode, j)
		}
		if err != nil {
			// Roll back this item's partial destination. The source is never
			// touched until a copy fully succeeds (MoveFileWithProgress), so a
			// canceled or failed transfer loses nothing.
			_ = pl.fs.RemoveAll(it.To)
			return err
		}

		switch {
		case isCopy:
			events.Publish(events.FileCopied{Base: pl.base, From: it.From, To: it.To})
		case looksLikeMove(it.From, it.To):
			events.Publish(events.FileMoved{Base: pl.base, From: it.From, To: it.To})
		default:
			events.Publish(events.FileRenamed{Base: pl.base, From: it.From, To: it.To})
		}
	}

	// Pin counters to totals so an instant (same-volume) rename — which copies
	// nothing — still reads 100% / N-of-N.
	j.MarkComplete()
	return nil
}

type transferItemRequest struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Overwrite bool   `json:"overwrite"`
	Rename    bool   `json:"rename"`
}

type transferRequest struct {
	Kind  string                `json:"kind"` // "move" | "copy"
	Items []transferItemRequest `json:"items"`
}

// jobsPostHandler starts a background transfer and returns the new job's initial
// snapshot. Conflict resolution mirrors the PATCH handler (the frontend has
// already resolved conflicts, so per-item overwrite/rename flags arrive set).
func (tm *transferManager) jobsPostHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		var req transferRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return http.StatusBadRequest, err
		}

		var kind jobs.Kind
		switch req.Kind {
		case "move":
			kind = jobs.KindMove
			if !d.user.Perm.Rename {
				return http.StatusForbidden, nil
			}
		case "copy":
			kind = jobs.KindCopy
			if !d.user.Perm.Create {
				return http.StatusForbidden, nil
			}
		default:
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		if len(req.Items) == 0 {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}

		items := make([]jobs.Item, 0, len(req.Items))
		for _, ri := range req.Items {
			src := path.Clean("/" + ri.From)
			dst := path.Clean("/" + ri.To)
			if src == "/" || dst == "/" {
				return http.StatusForbidden, nil
			}
			if !d.Check(src) || !d.Check(dst) {
				return http.StatusForbidden, nil
			}
			if err := checkParent(src, dst); err != nil {
				return http.StatusBadRequest, err
			}
			if !ri.Overwrite && !ri.Rename {
				if _, err := d.user.Fs.Stat(dst); err == nil {
					return http.StatusConflict, nil
				}
			}
			if ri.Rename {
				dst = addVersionSuffix(dst, d.user.Fs)
			}
			if ri.Overwrite && !d.user.Perm.Modify {
				return http.StatusForbidden, nil
			}
			items = append(items, jobs.Item{From: src, To: dst, Overwrite: ri.Overwrite, Rename: ri.Rename})
		}

		pl := &transferPayload{
			fs:       d.user.Fs,
			fileMode: d.settings.FileMode,
			dirMode:  d.settings.DirMode,
			base:     eventBase(r, d),
		}

		// Route same-volume moves onto the fast lane so an instant rename doesn't
		// wait behind a long cross-volume copy on the main worker. A move qualifies
		// only when EVERY item's source shares a volume with its destination's
		// parent dir; SameVolume is conservative (any stat error or unknown fs
		// disqualifies it), so anything uncertain falls back to the ordinary queued
		// path. Copies always take the main lane — they always write bytes.
		fast := kind == jobs.KindMove
		if fast {
			for _, it := range items {
				same, err := fileutils.SameVolume(d.user.Fs, it.From, path.Dir(it.To))
				if err != nil || !same {
					fast = false
					break
				}
			}
		}

		var view jobs.JobView
		if fast {
			_, view = tm.reg.EnqueueFast(d.user.ID, kind, items, pl)
		} else {
			view = tm.reg.Enqueue(d.user.ID, kind, items, pl).Snapshot()
		}
		return renderJSON(w, r, view)
	})
}

// jobsListHandler returns the caller's active + recently-finished transfers, so
// the UI can rehydrate the progress dock after a reload.
func (tm *transferManager) jobsListHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		return renderJSON(w, r, tm.reg.List(d.user.ID))
	})
}

// jobsGetHandler returns one transfer's snapshot (the poll target).
func (tm *transferManager) jobsGetHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		view, ok := tm.reg.Get(mux.Vars(r)["id"], d.user.ID)
		if !ok {
			return http.StatusNotFound, nil
		}
		return renderJSON(w, r, view)
	})
}

// jobsDeleteHandler cancels an active transfer or dismisses a finished one.
func (tm *transferManager) jobsDeleteHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		id := mux.Vars(r)["id"]
		if tm.reg.Cancel(id, d.user.ID) || tm.reg.Dismiss(id, d.user.ID) {
			return renderJSON(w, r, map[string]bool{"ok": true})
		}
		return http.StatusNotFound, nil
	})
}
