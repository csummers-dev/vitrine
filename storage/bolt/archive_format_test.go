package bolt

import (
	"path/filepath"
	"testing"

	"github.com/csummers-dev/vitrine/v4/settings"
)

// The archive-format prompt is off on a fresh install and after upgrading
// from settings saved before the option existed (4.0).
func TestAskArchiveFormatDefaultsOff(t *testing.T) {
	t.Run("fresh install", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "vitrine.db")
		db := openDB(t, path)
		if _, err := Migrate(db, path, Migrations, nil); err != nil {
			t.Fatal(err)
		}
		be := settingsBackend{db: db}
		if err := be.Save(&settings.Settings{Key: []byte("k")}); err != nil {
			t.Fatal(err)
		}
		set, err := be.Get()
		if err != nil {
			t.Fatal(err)
		}
		if set.AskArchiveFormat {
			t.Error("fresh install asks for the archive format")
		}
	})

	t.Run("upgrade from settings without the field", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "vitrine.db")
		db := openDB(t, path)
		seed3x(t, db)
		// What a 3.x install stored: the settings document has no
		// askArchiveFormat key at all.
		if err := save(db, "settings", map[string]any{
			"key":    []byte("k"),
			"signup": false,
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := Migrate(db, path, Migrations, nil); err != nil {
			t.Fatal(err)
		}
		set, err := (settingsBackend{db: db}).Get()
		if err != nil {
			t.Fatal(err)
		}
		if set.AskArchiveFormat {
			t.Error("upgraded install asks for the archive format")
		}
	})
}
