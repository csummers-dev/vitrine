package fbhttp

import (
	"net/http"
	"path"

	"github.com/tomasen/realip"

	"github.com/csummers-dev/vitrine/v3/events"
)

// eventBase stamps an events.Base with the request's user ID + client IP.
// Centralised so every Publish callsite does it the same way and so we
// have a single place to add fields later (e.g. session ID, tenant).
//
// Safe to call when d.user is nil — UserID becomes 0, which downstream
// consumers (audit log) treat as "system / unauthenticated".
func eventBase(r *http.Request, d *data) events.Base {
	var uid uint
	if d != nil && d.user != nil {
		uid = d.user.ID
	}
	return events.NewBase(uid, realip.FromRequest(r))
}

// looksLikeMove returns true when src and dst live in different parent
// directories — the rename HTTP action covers both rename-in-place and
// move-across-folders, so the dispatcher reads this to pick between
// FileRenamed and FileMoved.
func looksLikeMove(src, dst string) bool {
	return path.Dir(src) != path.Dir(dst)
}
