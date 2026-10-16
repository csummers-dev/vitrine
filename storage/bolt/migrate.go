package bolt

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/asdine/storm/v3"
	bbolt "go.etcd.io/bbolt"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/share"
	"github.com/csummers-dev/vitrine/v4/twofactor"
)

// SchemaVersion is the database layout this build reads and writes.
// Databases from vitrine 3.x carry no schema key and count as 3.
//
// (The older "version" key in the config bucket is File Browser's own v1/v2
// marker and stays as it is.)
const SchemaVersion = 4

const schemaKey = "schemaVersion"

// Migration upgrades the database from Version-1 to Version.
type Migration struct {
	Version int
	Name    string
	Run     func(db *storm.DB) error
}

// Migrations are applied in order. Each must be safe to run again on a
// database it has already upgraded.
var Migrations = []Migration{
	{Version: 4, Name: "vitrine 4.0: share modes and counters, two-factor sign-in", Run: migrate40},
}

// MigrateResult says what Migrate did.
type MigrateResult struct {
	From, To int
	// Backup is the copy taken before the first change, "" when none was
	// needed (a new or already current database).
	Backup string
	// Applied names the migrations that ran.
	Applied []string
}

// Migrate brings the database at path (already open as db) up to
// SchemaVersion. Before changing an existing database it copies it to
// "<path>.pre-<version>.bak". A failed step leaves the schema at the last
// step that succeeded and returns an error naming the backup.
func Migrate(db *storm.DB, path string, migrations []Migration, logf func(string, ...any)) (MigrateResult, error) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	target := SchemaVersion
	if n := len(migrations); n > 0 && migrations[n-1].Version > target {
		target = migrations[n-1].Version
	}

	from, existing, err := schemaVersion(db)
	if err != nil {
		return MigrateResult{}, fmt.Errorf("read database schema: %w", err)
	}
	res := MigrateResult{From: from, To: from}

	switch {
	case !existing:
		// A new database starts at the current layout.
		res.To = target
		return res, db.Set("config", schemaKey, target)
	case from > target:
		return res, fmt.Errorf("this database was upgraded by a newer vitrine (schema %d; this version reads %d): run the newer version, or restore the backup taken before that upgrade", from, target)
	case from == target:
		return res, nil
	}

	backup, err := backupDatabase(db, path, target)
	if err != nil {
		return res, fmt.Errorf("back up the database before upgrading it: %w", err)
	}
	res.Backup = backup
	logf("Database: upgrading schema %d to %d; backup written to %s", from, target, backup)

	for _, m := range migrations {
		if m.Version <= res.To {
			continue
		}
		if err := m.Run(db); err != nil {
			return res, fmt.Errorf("database upgrade %q failed: %w; nothing after it was applied, and the database as it was before the upgrade is at %s", m.Name, err, backup)
		}
		if err := db.Set("config", schemaKey, m.Version); err != nil {
			return res, fmt.Errorf("record database schema %d: %w; the database as it was before the upgrade is at %s", m.Version, err, backup)
		}
		res.To = m.Version
		res.Applied = append(res.Applied, m.Name)
		logf("Database: applied %s", m.Name)
	}
	// Tell admins once, in the app, where the old database went (5.7). The
	// upgrade itself succeeded, so a failure here is only logged.
	notice := settings.UpgradeNotice{From: res.From, To: res.To, Backup: backup, At: time.Now().UTC()}
	if err := save(db, upgradeNoticeKey, &notice); err != nil {
		logf("Database: could not record the upgrade notice: %v", err)
	}
	return res, nil
}

// schemaVersion reads the stored schema. A database without the key is
// 3.x when it has settings, and new otherwise.
func schemaVersion(db *storm.DB) (version int, existing bool, err error) {
	err = db.Get("config", schemaKey, &version)
	if err == nil {
		return version, true, nil
	}
	if !errors.Is(err, storm.ErrNotFound) {
		return 0, false, err
	}
	var set settings.Settings
	switch err := get(db, "settings", &set); {
	case errors.Is(err, fberrors.ErrNotExist):
		return 0, false, nil
	case err != nil:
		return 0, false, err
	}
	return 3, true, nil
}

// backupDatabase copies the database, as one consistent snapshot, to
// "<path>.pre-<version>.bak", or a dated name if that file already exists
// (a backup from an earlier attempt is never overwritten).
func backupDatabase(db *storm.DB, path string, version int) (string, error) {
	name := fmt.Sprintf("%s.pre-%d.0.bak", path, version)
	if _, err := os.Stat(name); err == nil {
		name = strings.TrimSuffix(name, ".bak") + "." + time.Now().Format("20060102-150405") + ".bak"
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	err := db.Bolt.View(func(tx *bbolt.Tx) error {
		return tx.CopyFile(name, 0o600)
	})
	if err != nil {
		_ = os.Remove(name)
		return "", err
	}
	return name, nil
}

// migrate40 prepares a 3.x database for 4.0. New fields read as their zero
// values, which are the 4.0 defaults (download shares with no limits or
// counts; file requests, map tiles and required two-factor off), so this
// step only tidies values 4.0 checks and creates the two-factor bucket.
func migrate40(db *storm.DB) error {
	var links []*share.Link
	if err := db.All(&links); err != nil && !errors.Is(err, storm.ErrNotFound) {
		return fmt.Errorf("read share links: %w", err)
	}
	for _, l := range links {
		changed := false
		if l.Mode != share.ModeDownload && l.Mode != share.ModeUpload {
			l.Mode, changed = share.ModeDownload, true
		}
		for _, n := range []*int64{&l.Views, &l.Downloads, &l.MaxDownloads, &l.UploadedBytes, &l.Uploads} {
			if *n < 0 {
				*n, changed = 0, true
			}
		}
		if changed {
			if err := db.Save(l); err != nil {
				return fmt.Errorf("update share link %s: %w", l.Hash, err)
			}
		}
	}

	var set settings.Settings
	switch err := get(db, "settings", &set); {
	case errors.Is(err, fberrors.ErrNotExist):
	case err != nil:
		return fmt.Errorf("read settings: %w", err)
	case set.UploadConcurrencyMax > 10:
		set.UploadConcurrencyMax = 10
		if err := save(db, "settings", &set); err != nil {
			return fmt.Errorf("update settings: %w", err)
		}
	}

	return db.Init(&twofactor.Factor{})
}
