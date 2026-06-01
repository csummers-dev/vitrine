package users

import (
	"encoding/json"
	"path/filepath"

	"github.com/spf13/afero"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/filebrowser/filebrowser/v2/rules"
)

// ViewMode describes a view mode.
type ViewMode string

const (
	ListViewMode   ViewMode = "list"
	MosaicViewMode ViewMode = "mosaic"
)

// User describes a user.
type User struct {
	ID                    uint          `storm:"id,increment" json:"id"`
	Username              string        `storm:"unique" json:"username"`
	Password              string        `json:"password"`
	Scope                 string        `json:"scope"`
	Locale                string        `json:"locale"`
	LockPassword          bool          `json:"lockPassword"`
	ViewMode              ViewMode      `json:"viewMode"`
	SingleClick           bool          `json:"singleClick"`
	RedirectAfterCopyMove bool          `json:"redirectAfterCopyMove"`
	Perm                  Permissions   `json:"perm"`
	Commands              []string      `json:"commands"`
	Sorting               files.Sorting `json:"sorting"`
	Fs                    afero.Fs      `json:"-" yaml:"-"`
	Rules                 []rules.Rule  `json:"rules"`
	HideDotfiles          bool          `json:"hideDotfiles"`
	DateFormat            bool          `json:"dateFormat"`
	AceEditorTheme        string        `json:"aceEditorTheme"`
	// SessionsRevokedAt is the "sign out everywhere" epoch (Unix seconds,
	// v1.3 S8-3). Any JWT whose IssuedAt predates it is rejected by the
	// auth middleware — without any per-session storage. Zero means
	// "never revoked".
	SessionsRevokedAt int64 `json:"sessionsRevokedAt"`
	// Preferences is an open, feature-prefixed key/value store for
	// per-user UI state that doesn't deserve its own column (recents,
	// favorites, tag picker state, per-folder view mode, accent color,
	// etc.). Values are raw JSON so the backend doesn't have to know
	// each entry's schema — the frontend feature that owns the key
	// owns the shape. New v1.3.0 features should namespace their keys
	// (e.g., "tags.recent", "view.mode.byFolder", "favorites").
	Preferences map[string]json.RawMessage `json:"preferences"`
}

// GetRules implements rules.Provider.
func (u *User) GetRules() []rules.Rule {
	return u.Rules
}

var checkableFields = []string{
	"Username",
	"Password",
	"Scope",
	"ViewMode",
	"Commands",
	"Sorting",
	"Rules",
}

// Clean cleans up a user and verifies if all its fields
// are alright to be saved.
func (u *User) Clean(baseScope string, fields ...string) error {
	if len(fields) == 0 {
		fields = checkableFields
	}

	for _, field := range fields {
		switch field {
		case "Username":
			if u.Username == "" {
				return fberrors.ErrEmptyUsername
			}
		case "Password":
			if u.Password == "" {
				return fberrors.ErrEmptyPassword
			}
		case "ViewMode":
			if u.ViewMode == "" {
				u.ViewMode = ListViewMode
			}
		case "Commands":
			if u.Commands == nil {
				u.Commands = []string{}
			}
		case "Sorting":
			if u.Sorting.By == "" {
				u.Sorting.By = "name"
			}
		case "Rules":
			if u.Rules == nil {
				u.Rules = []rules.Rule{}
			}
		}
	}

	if u.Fs == nil {
		scope := u.Scope
		scope = filepath.Join(baseScope, filepath.Join("/", scope))
		u.Fs = afero.NewBasePathFs(afero.NewOsFs(), scope)
	}

	// Existing rows persisted before the Preferences field was added
	// come back from storm with a nil map. Normalize to an empty map
	// so the JSON response always carries `"preferences": {}` instead
	// of `"preferences": null` — the frontend composable treats the
	// two equivalently but the explicit empty form keeps DevTools +
	// API consumers honest about the field existing.
	if u.Preferences == nil {
		u.Preferences = map[string]json.RawMessage{}
	}

	return nil
}

// FullPath gets the full path for a user's relative path.
func (u *User) FullPath(path string) string {
	return afero.FullBaseFsPath(u.Fs.(*afero.BasePathFs), path)
}
