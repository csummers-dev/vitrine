package bolt

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asdine/storm/v3"

	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/share"
	"github.com/csummers-dev/vitrine/v4/users"
)

func openDB(t *testing.T, path string) *storm.DB {
	t.Helper()
	db, err := storm.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// seed3x writes what a vitrine 3.x install holds: settings, a user and a
// share link, and no schema key.
func seed3x(t *testing.T, db *storm.DB) {
	t.Helper()
	if _, err := NewStorage(db); err != nil {
		t.Fatal(err)
	}
	if err := save(db, "settings", &settings.Settings{Key: []byte("k"), UploadConcurrencyMax: 64}); err != nil {
		t.Fatal(err)
	}
	if err := db.Save(&users.User{Username: "admin", Password: "x"}); err != nil {
		t.Fatal(err)
	}
	for _, l := range []*share.Link{
		{Hash: "ok", Path: "/a", UserID: 1},
		{Hash: "odd", Path: "/b", UserID: 1, Mode: "bogus", Downloads: -3},
	} {
		if err := db.Save(l); err != nil {
			t.Fatal(err)
		}
	}
}

func TestMigrateNewDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vitrine.db")
	db := openDB(t, path)
	res, err := Migrate(db, path, Migrations, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Backup != "" || res.To != SchemaVersion || len(res.Applied) != 0 {
		t.Errorf("new database: %+v", res)
	}
	if v, ok, _ := schemaVersion(db); !ok || v != SchemaVersion {
		t.Errorf("schema = %d, %v", v, ok)
	}
	// Nothing was upgraded, so admins get no notice.
	if _, err := (settingsBackend{db: db}).GetUpgradeNotice(); err == nil {
		t.Error("new database left an upgrade notice")
	}
}

func TestMigrateFrom3x(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vitrine.db")
	db := openDB(t, path)
	seed3x(t, db)

	var logged []string
	logf := func(f string, _ ...any) { logged = append(logged, f) }
	res, err := Migrate(db, path, Migrations, logf)
	if err != nil {
		t.Fatal(err)
	}
	if res.From != 3 || res.To != SchemaVersion || len(res.Applied) != 1 || len(logged) != 2 {
		t.Fatalf("result %+v, log %v", res, logged)
	}
	if res.Backup != path+".pre-4.0.bak" {
		t.Errorf("backup at %q", res.Backup)
	}

	// The backup is a 3.x database: settings, links, no schema key.
	bak := openDB(t, res.Backup)
	if v, _, _ := schemaVersion(bak); v != 3 {
		t.Errorf("backup schema = %d", v)
	}
	var old share.Link
	if err := bak.One("Hash", "odd", &old); err != nil || old.Mode != "bogus" {
		t.Errorf("backup link = %+v, %v", old, err)
	}

	// Values 4.0 checks were tidied.
	var l share.Link
	if err := db.One("Hash", "odd", &l); err != nil {
		t.Fatal(err)
	}
	if l.Mode != share.ModeDownload || l.Downloads != 0 {
		t.Errorf("link not tidied: %+v", l)
	}
	var set settings.Settings
	_ = get(db, "settings", &set)
	if set.UploadConcurrencyMax != 10 || string(set.Key) != "k" {
		t.Errorf("settings = %+v", set)
	}

	// Admins will be told once where the old database went (5.7).
	notice, err := (settingsBackend{db: db}).GetUpgradeNotice()
	if err != nil {
		t.Fatalf("upgrade notice: %v", err)
	}
	if notice.From != 3 || notice.To != SchemaVersion || notice.Backup != res.Backup || notice.At.IsZero() {
		t.Errorf("notice = %+v", notice)
	}

	// Running again changes nothing and takes no second backup.
	again, err := Migrate(db, path, Migrations, nil)
	if err != nil || again.Backup != "" || len(again.Applied) != 0 {
		t.Errorf("second run: %+v, %v", again, err)
	}
}

func TestMigrateRefusesNewerSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vitrine.db")
	db := openDB(t, path)
	if err := db.Set("config", schemaKey, SchemaVersion+1); err != nil {
		t.Fatal(err)
	}
	if _, err := Migrate(db, path, Migrations, nil); err == nil || !strings.Contains(err.Error(), "newer vitrine") {
		t.Errorf("err = %v", err)
	}
}

func TestMigrateFailureNamesBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vitrine.db")
	db := openDB(t, path)
	seed3x(t, db)
	// An earlier attempt's backup is kept; this run writes a dated one.
	if err := os.WriteFile(path+".pre-5.0.bak", []byte("earlier"), 0o600); err != nil {
		t.Fatal(err)
	}
	steps := append([]Migration{}, Migrations...)
	steps = append(steps, Migration{Version: 5, Name: "broken", Run: func(*storm.DB) error {
		return errors.New("disk on fire")
	}})

	res, err := Migrate(db, path, steps, nil)
	if err == nil || !strings.Contains(err.Error(), res.Backup) || !strings.Contains(err.Error(), "disk on fire") {
		t.Fatalf("err = %v (backup %q)", err, res.Backup)
	}
	if res.Backup == path+".pre-5.0.bak" || !strings.HasPrefix(res.Backup, path+".pre-5.0.") {
		t.Errorf("backup = %q", res.Backup)
	}
	if b, _ := os.ReadFile(path + ".pre-5.0.bak"); string(b) != "earlier" {
		t.Error("earlier backup overwritten")
	}
	// A failed upgrade records no notice; the error is the message.
	if _, err := (settingsBackend{db: db}).GetUpgradeNotice(); err == nil {
		t.Error("failed upgrade left a notice")
	}
	// The steps before the failure stuck; the failed one didn't.
	if v, _, _ := schemaVersion(db); v != 4 || res.To != 4 {
		t.Errorf("schema = %d, result %+v", v, res)
	}
}
