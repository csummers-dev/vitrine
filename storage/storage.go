package storage

import (
	"github.com/csummers-dev/vitrine/v4/auth"
	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/share"
	"github.com/csummers-dev/vitrine/v4/users"
)

// Storage is a storage powered by a Backend which makes the necessary
// verifications when fetching and saving data to ensure consistency.
type Storage struct {
	Users    users.Store
	Share    *share.Storage
	Auth     *auth.Storage
	Settings *settings.Storage
}
