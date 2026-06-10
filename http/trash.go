package fbhttp

import (
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/spf13/afero"

	"github.com/filebrowser/filebrowser/v2/events"
	"github.com/filebrowser/filebrowser/v2/trash"
)

// Trash HTTP API (2.4.0 Stage 2).
//
//	GET    /api/trash          → list entries in the user's scope (newest first)
//	POST   /api/trash/{id}     → restore the entry to its original path
//	DELETE /api/trash/{id}     → delete the entry forever
//	DELETE /api/trash          → empty the trash (everything in the user's scope)
//
// The trash store works on ABSOLUTE OS paths; these handlers translate to and
// from the user's scope so responses and events use the same user-relative
// paths as the rest of the API (which keeps the tag path-follow subscriber and
// the audit log coherent). The trash itself lives INSIDE the user scope —
// MoveToTrash's volume-top walk is bounded by it — so every absolute path here
// converts cleanly.

// trashOsFs is the filesystem the trash store operates on. Absolute paths, no
// scoping — the handlers do the scope checks before calling into the store.
var trashOsFs = afero.NewOsFs()

// trashScope returns the user's scope as an absolute OS path.
func trashScope(d *data) string {
	return path.Clean(d.user.FullPath("/"))
}

// trashRel converts an absolute path inside the user scope to the user-relative
// form used by the API/events ("/Movies/a.txt"). Falls back to the name-only
// form if the path is somehow outside the scope (defensive; shouldn't happen).
func trashRel(scopeAbs, abs string) string {
	rel := strings.TrimPrefix(abs, scopeAbs)
	if rel == abs {
		return "/" + path.Base(abs)
	}
	if !strings.HasPrefix(rel, "/") {
		rel = "/" + rel
	}
	return rel
}

// trashEntryView is the JSON shape the frontend consumes: user-relative paths,
// no absolute OS paths leaked.
type trashEntryView struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	OriginalPath string    `json:"originalPath"` // user-relative, e.g. "/Movies/a.txt"
	OriginalDir  string    `json:"originalDir"`  // user-relative parent, for display
	IsDir        bool      `json:"isDir"`
	Size         int64     `json:"size"`
	TrashedAt    time.Time `json:"trashedAt"`
	User         string    `json:"user"`
}

func trashViews(scopeAbs string, entries []trash.Entry) []trashEntryView {
	out := make([]trashEntryView, 0, len(entries))
	for _, e := range entries {
		rel := trashRel(scopeAbs, e.OriginalPath)
		out = append(out, trashEntryView{
			ID:           e.ID,
			Name:         e.Name,
			OriginalPath: rel,
			OriginalDir:  path.Dir(rel),
			IsDir:        e.IsDir,
			Size:         e.Size,
			TrashedAt:    e.TrashedAt,
			User:         e.User,
		})
	}
	return out
}

// trashListHandler returns the user's trash, newest first.
func trashListHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if d.trashStore == nil {
			return http.StatusServiceUnavailable, nil
		}
		scope := trashScope(d)
		entries, err := d.trashStore.List(scope)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, trashViews(scope, entries))
	})
}

// trashGetEntryInScope loads an entry and verifies it belongs to the caller's
// scope (an id from another user's scope reads as not-found, not forbidden —
// no existence oracle).
func trashGetEntryInScope(d *data, id string) (trash.Entry, int, error) {
	entries, err := d.trashStore.List(trashScope(d))
	if err != nil {
		return trash.Entry{}, http.StatusInternalServerError, err
	}
	for _, e := range entries {
		if e.ID == id {
			return e, 0, nil
		}
	}
	return trash.Entry{}, http.StatusNotFound, nil
}

// trashRestoreHandler moves an entry back to its original path (suffixed with
// "(N)" if the original name has been taken since).
func trashRestoreHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if d.trashStore == nil {
			return http.StatusServiceUnavailable, nil
		}
		// Restoring writes back into the tree — the same permission a create
		// needs. (Deleting required Perm.Delete; undo shouldn't require more.)
		if !d.user.Perm.Create {
			return http.StatusForbidden, nil
		}
		id := mux.Vars(r)["id"]
		if _, status, err := trashGetEntryInScope(d, id); status != 0 {
			return status, err
		}
		e, dest, err := d.trashStore.Restore(trashOsFs, id)
		if err != nil {
			return errToStatus(err), err
		}
		scope := trashScope(d)
		relFrom := trashRel(scope, e.TrashPath)
		relTo := trashRel(scope, dest)
		// The restore is a move out of the trash dir — published as FileMoved
		// so tags follow back, mirroring how the delete moved them in.
		events.Publish(events.FileMoved{Base: eventBase(r, d), From: relFrom, To: relTo})
		return renderJSON(w, r, map[string]string{"path": relTo})
	})
}

// trashDeleteHandler deletes one entry forever (DELETE /api/trash/{id}) or, with
// no id, empties the caller's whole trash (DELETE /api/trash).
func trashDeleteHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if d.trashStore == nil {
			return http.StatusServiceUnavailable, nil
		}
		if !d.user.Perm.Delete {
			return http.StatusForbidden, nil
		}
		scope := trashScope(d)
		base := eventBase(r, d)

		if id := mux.Vars(r)["id"]; id != "" {
			if _, status, err := trashGetEntryInScope(d, id); status != 0 {
				return status, err
			}
			e, err := d.trashStore.DeleteForever(trashOsFs, id)
			if err != nil {
				return errToStatus(err), err
			}
			events.Publish(events.FileDeleted{Base: base, Path: trashRel(scope, e.TrashPath), IsDir: e.IsDir})
			return renderJSON(w, r, map[string]bool{"ok": true})
		}

		// Empty: everything in scope. Per-entry errors are skipped so one bad
		// row can't wedge the rest; the next attempt retries leftovers.
		entries, err := d.trashStore.List(scope)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		removed := 0
		for _, e := range entries {
			if _, err := d.trashStore.DeleteForever(trashOsFs, e.ID); err == nil {
				events.Publish(events.FileDeleted{Base: base, Path: trashRel(scope, e.TrashPath), IsDir: e.IsDir})
				removed++
			}
		}
		return renderJSON(w, r, map[string]int{"removed": removed})
	})
}
