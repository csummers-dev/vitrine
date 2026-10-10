package fswatch

import (
	"path"
	"strings"
)

// UserScope is a user's scope as a root-relative path ("/" or "/alice").
type UserScope struct {
	ID    uint
	Scope string
}

// UserChange is a Change translated into one user's scope.
type UserChange struct {
	UserID uint
	Change
}

// CleanScope turns a stored user scope ("." , "alice", "/alice/") into the
// root-relative form used here ("/" or "/alice").
func CleanScope(scope string) string {
	return path.Clean("/" + strings.ReplaceAll(scope, "\\", "/"))
}

// ForUsers returns c as seen by every user whose scope contains c.Dir, with
// Dir made relative to that user's scope. A change to a scope's own entry in
// its parent (the scope folder renamed or removed) is not reported.
func ForUsers(c Change, users []UserScope) []UserChange {
	var out []UserChange
	for _, u := range users {
		scope := CleanScope(u.Scope)
		var dir string
		switch {
		case scope == "/":
			dir = c.Dir
		case c.Dir == scope:
			dir = "/"
		case strings.HasPrefix(c.Dir, scope+"/"):
			dir = strings.TrimPrefix(c.Dir, scope)
		default:
			continue
		}
		out = append(out, UserChange{UserID: u.ID, Change: Change{Dir: dir, Names: c.Names}})
	}
	return out
}
