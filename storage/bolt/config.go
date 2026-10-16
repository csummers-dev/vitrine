package bolt

import (
	"errors"

	"github.com/asdine/storm/v3"

	"github.com/csummers-dev/vitrine/v4/settings"
)

type settingsBackend struct {
	db *storm.DB
}

func (s settingsBackend) Get() (*settings.Settings, error) {
	set := &settings.Settings{}
	return set, get(s.db, "settings", set)
}

func (s settingsBackend) Save(set *settings.Settings) error {
	return save(s.db, "settings", set)
}

func (s settingsBackend) GetServer() (*settings.Server, error) {
	server := &settings.Server{}
	return server, get(s.db, "server", server)
}

func (s settingsBackend) SaveServer(server *settings.Server) error {
	return save(s.db, "server", server)
}

// upgradeNoticeKey holds the pending settings.UpgradeNotice (Phase 6, 5.7).
const upgradeNoticeKey = "upgradeNotice"

func (s settingsBackend) GetUpgradeNotice() (*settings.UpgradeNotice, error) {
	n := &settings.UpgradeNotice{}
	if err := get(s.db, upgradeNoticeKey, n); err != nil {
		return nil, err
	}
	return n, nil
}

func (s settingsBackend) SaveUpgradeNotice(n *settings.UpgradeNotice) error {
	return save(s.db, upgradeNoticeKey, n)
}

func (s settingsBackend) DeleteUpgradeNotice() error {
	err := s.db.Delete("config", upgradeNoticeKey)
	if errors.Is(err, storm.ErrNotFound) {
		return nil
	}
	return err
}
