package fileutils

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/spf13/afero"
)

// xdevFs wraps an afero.Fs and forces Rename to fail with EXDEV, so
// MoveFile always exercises its cross-device copy+delete fallback — the
// path that real cross-bind-mount / cross-volume moves take (RC-15).
type xdevFs struct {
	afero.Fs
}

func (x xdevFs) Rename(oldname, newname string) error {
	return &os.LinkError{Op: "rename", Old: oldname, New: newname, Err: syscall.EXDEV}
}

func newXdev() xdevFs { return xdevFs{afero.NewMemMapFs()} }

func seed(t *testing.T, afs afero.Fs, name, content string) {
	t.Helper()
	if err := afs.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", name, err)
	}
	if err := afero.WriteFile(afs, name, []byte(content), 0o644); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
}

func TestMoveFileCrossDeviceFile(t *testing.T) {
	fs := newXdev()
	seed(t, fs, "/src/a.txt", "hello")

	if err := MoveFile(fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755); err != nil {
		t.Fatalf("MoveFile: %v", err)
	}

	if _, err := fs.Stat("/src/a.txt"); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("source still exists after move: %v", err)
	}
	got, err := afero.ReadFile(fs, "/dst/a.txt")
	if err != nil || string(got) != "hello" {
		t.Fatalf("dest content = %q, err %v; want %q", got, err, "hello")
	}
}

func TestMoveFileCrossDeviceDir(t *testing.T) {
	fs := newXdev()
	seed(t, fs, "/src/dir/a.txt", "A")
	seed(t, fs, "/src/dir/sub/b.txt", "B")

	if err := MoveFile(fs, "/src/dir", "/dst/dir", 0o644, 0o755); err != nil {
		t.Fatalf("MoveFile dir: %v", err)
	}

	if _, err := fs.Stat("/src/dir"); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("source dir still exists after move")
	}
	for name, want := range map[string]string{
		"/dst/dir/a.txt":     "A",
		"/dst/dir/sub/b.txt": "B",
	} {
		got, err := afero.ReadFile(fs, name)
		if err != nil || string(got) != want {
			t.Errorf("%s = %q (err %v); want %q", name, got, err, want)
		}
	}
}

// chmodFailFs models a destination filesystem that rejects chmod with
// EINVAL. The move must still complete — the bytes are what matter.
type chmodFailFs struct {
	xdevFs
}

func (c chmodFailFs) Chmod(name string, _ os.FileMode) error {
	return &os.PathError{Op: "chmod", Path: name, Err: syscall.EINVAL}
}

func TestMoveFileToleratesChmodUnsupported(t *testing.T) {
	fs := chmodFailFs{newXdev()}
	seed(t, fs, "/src/a.txt", "data")

	if err := MoveFile(fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755); err != nil {
		t.Fatalf("MoveFile should tolerate chmod EINVAL on dest: %v", err)
	}
	got, err := afero.ReadFile(fs, "/dst/a.txt")
	if err != nil || string(got) != "data" {
		t.Fatalf("dest = %q (err %v); want %q", got, err, "data")
	}
}

// copyFailFs forces OpenFile to fail for one specific destination file,
// simulating a mid-directory-copy failure. MoveFile must NOT leave a
// partial destination tree behind, and must keep the source intact so no
// data is lost.
type copyFailFs struct {
	xdevFs
	failName string
}

func (c copyFailFs) OpenFile(name string, flag int, perm os.FileMode) (afero.File, error) {
	if name == c.failName {
		return nil, &os.PathError{Op: "open", Path: name, Err: syscall.EINVAL}
	}
	return c.xdevFs.OpenFile(name, flag, perm)
}

func TestMoveFilePartialCopyIsCleanedUp(t *testing.T) {
	fs := copyFailFs{xdevFs: newXdev(), failName: "/dst/dir/b.txt"}
	seed(t, fs, "/src/dir/a.txt", "A")
	seed(t, fs, "/src/dir/b.txt", "B")

	if err := MoveFile(fs, "/src/dir", "/dst/dir", 0o644, 0o755); err == nil {
		t.Fatal("expected MoveFile to fail when a child copy fails")
	}

	// No partial destination left behind (the bug: Remove couldn't delete
	// a non-empty dir, stranding half-copied folders).
	if _, err := fs.Stat("/dst/dir"); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("partial destination not cleaned up: %v", err)
	}
	// Source preserved — a failed move loses nothing.
	if _, err := fs.Stat("/src/dir/a.txt"); err != nil {
		t.Errorf("source removed despite failed move: %v", err)
	}
}
