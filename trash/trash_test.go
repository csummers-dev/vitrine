package trash

import (
	"os"
	"path"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/afero"
)

// newStore returns a Store backed by a temp bolt DB plus a temp "server root"
// with a small tree, both cleaned up by t.TempDir. Uses the real OS fs so
// device ids and renames behave like production.
func newStore(t *testing.T) (*Store, afero.Fs, string) {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "trash.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	root := t.TempDir()
	fs := afero.NewOsFs()
	mk := func(p, content string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(filepath.Join(root, p)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, p), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mk("a.txt", "alpha")
	mk("Movies/film.mkv", "vid")
	mk("Movies/sub/deep.txt", "deep")
	return s, fs, root
}

func mustExist(t *testing.T, p string) {
	t.Helper()
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("expected %s to exist: %v", p, err)
	}
}

func mustNotExist(t *testing.T, p string) {
	t.Helper()
	if _, err := os.Stat(p); err == nil {
		t.Fatalf("expected %s to be gone", p)
	}
}

func TestMoveToTrashAndList(t *testing.T) {
	s, fs, root := newStore(t)

	e, err := s.MoveToTrash(fs, path.Join(root, "a.txt"), root, "cory")
	if err != nil {
		t.Fatalf("MoveToTrash: %v", err)
	}
	mustNotExist(t, path.Join(root, "a.txt"))
	mustExist(t, e.TrashPath)
	if e.Name != "a.txt" || e.IsDir || e.User != "cory" {
		t.Fatalf("entry fields wrong: %+v", e)
	}
	// Same device throughout a TempDir → trash lands at the volume top, which
	// is the root bound here.
	if path.Dir(path.Dir(e.TrashPath)) != path.Clean(root) {
		t.Fatalf("trash dir not at root: %s", e.TrashPath)
	}

	list, err := s.List(root)
	if err != nil || len(list) != 1 || list[0].ID != e.ID {
		t.Fatalf("List: %v %+v", err, list)
	}
	// A narrower scope that doesn't contain the original sees nothing.
	list, _ = s.List(path.Join(root, "Movies"))
	if len(list) != 0 {
		t.Fatalf("scope filter leaked: %+v", list)
	}
}

func TestRestore(t *testing.T) {
	s, fs, root := newStore(t)
	orig := path.Join(root, "Movies", "film.mkv")

	e, err := s.MoveToTrash(fs, orig, root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	_, dest, err := s.Restore(fs, e.ID)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if dest != orig {
		t.Fatalf("restored to %s, want %s", dest, orig)
	}
	mustExist(t, orig)
	if list, _ := s.List(root); len(list) != 0 {
		t.Fatalf("index entry not dropped: %+v", list)
	}
}

func TestRestoreKeepsBothOnCollision(t *testing.T) {
	s, fs, root := newStore(t)
	orig := path.Join(root, "a.txt")

	e, err := s.MoveToTrash(fs, orig, root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	// A NEW a.txt appears while the old one sits in the trash.
	if err := os.WriteFile(orig, []byte("newer"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, dest, err := s.Restore(fs, e.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dest != path.Join(root, "a(1).txt") {
		t.Fatalf("collision restore got %s", dest)
	}
	mustExist(t, dest)
	raw, _ := os.ReadFile(orig)
	if string(raw) != "newer" {
		t.Fatal("restore clobbered the newer file")
	}
}

func TestRestoreRecreatesMissingParent(t *testing.T) {
	s, fs, root := newStore(t)
	orig := path.Join(root, "Movies", "sub", "deep.txt")

	e, err := s.MoveToTrash(fs, orig, root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	// The whole parent chain is deleted while the file is in the trash.
	if err := os.RemoveAll(path.Join(root, "Movies")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Restore(fs, e.ID); err != nil {
		t.Fatalf("Restore with missing parent: %v", err)
	}
	mustExist(t, orig)
}

func TestDeleteForever(t *testing.T) {
	s, fs, root := newStore(t)
	e, err := s.MoveToTrash(fs, path.Join(root, "a.txt"), root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteForever(fs, e.ID); err != nil {
		t.Fatalf("DeleteForever: %v", err)
	}
	mustNotExist(t, e.TrashPath)
	if _, err := s.DeleteForever(fs, e.ID); err != ErrNotFound {
		t.Fatalf("second delete should be ErrNotFound, got %v", err)
	}
}

func TestTrashDirectoryWholeTree(t *testing.T) {
	s, fs, root := newStore(t)
	dir := path.Join(root, "Movies")

	e, err := s.MoveToTrash(fs, dir, root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	if !e.IsDir {
		t.Fatal("IsDir not recorded")
	}
	mustNotExist(t, dir)
	mustExist(t, path.Join(e.TrashPath, "film.mkv"))
	mustExist(t, path.Join(e.TrashPath, "sub", "deep.txt"))

	if _, _, err := s.Restore(fs, e.ID); err != nil {
		t.Fatal(err)
	}
	mustExist(t, path.Join(dir, "sub", "deep.txt"))
}

func TestPurgeOlderThan(t *testing.T) {
	s, fs, root := newStore(t)
	eOld, err := s.MoveToTrash(fs, path.Join(root, "a.txt"), root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	// Backdate the old entry by rewriting it.
	eOld.TrashedAt = time.Now().UTC().Add(-48 * time.Hour)
	if err := s.put(eOld); err != nil {
		t.Fatal(err)
	}
	eNew, err := s.MoveToTrash(fs, path.Join(root, "Movies", "film.mkv"), root, "cory")
	if err != nil {
		t.Fatal(err)
	}

	purged, err := s.PurgeOlderThan(fs, time.Now().UTC().Add(-24*time.Hour))
	if err != nil || purged != 1 {
		t.Fatalf("purged=%d err=%v", purged, err)
	}
	mustNotExist(t, eOld.TrashPath)
	mustExist(t, eNew.TrashPath)
	if list, _ := s.List(root); len(list) != 1 || list[0].ID != eNew.ID {
		t.Fatalf("index after purge: %+v", list)
	}
}

func TestIsTrashPath(t *testing.T) {
	cases := map[string]bool{
		"/srv/.trash":            true,
		"/srv/.trash/x__a.txt":   true,
		"/srv/Movies/.trash/y":   true,
		"/srv/Movies/film.mkv":   false,
		"/srv/.trashy/file":      false,
		"/srv/my.trash.notes":    false,
		"/.trash":                true,
		"/srv/sub/.trash/a/b/c…": true,
	}
	for p, want := range cases {
		if got := IsTrashPath(p); got != want {
			t.Errorf("IsTrashPath(%q) = %v, want %v", p, got, want)
		}
	}
}

func TestStaleEntryRestoreReportsAndDrops(t *testing.T) {
	s, fs, root := newStore(t)
	e, err := s.MoveToTrash(fs, path.Join(root, "a.txt"), root, "cory")
	if err != nil {
		t.Fatal(err)
	}
	// Payload vanishes behind the index's back (external cleanup).
	if err := os.RemoveAll(e.TrashPath); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Restore(fs, e.ID); err == nil {
		t.Fatal("expected error for missing payload")
	}
	if list, _ := s.List(root); len(list) != 0 {
		t.Fatal("stale entry should have been dropped")
	}
}

// The reported "403 on Delete forever": a trashed folder containing a
// read-only subdirectory (or one owned with restrictive modes by another
// service) makes RemoveAll fail with EACCES — DeleteForever must lift the
// directory bits inside the trash and push through.
func TestDeleteForeverReadOnlySubdir(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("running as root — EACCES cannot be provoked")
	}
	s, fs, root := newStore(t)

	locked := filepath.Join(root, "Movies", "locked")
	if err := os.MkdirAll(locked, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(locked, "x.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0o555); err != nil {
		t.Fatal(err)
	}
	// Restore the mode on cleanup so TempDir teardown can't trip either.
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })

	e, err := s.MoveToTrash(fs, filepath.Join(root, "Movies"), root, "cory")
	if err != nil {
		t.Fatalf("MoveToTrash: %v", err)
	}
	if _, err := s.DeleteForever(fs, e.ID); err != nil {
		t.Fatalf("DeleteForever with read-only subdir: %v", err)
	}
	mustNotExist(t, e.TrashPath)
}
