//go:build !windows

package fileutils

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/afero"
)

func TestSameVolumeSameDir(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a")
	b := filepath.Join(dir, "b")
	if err := os.WriteFile(a, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(b, []byte("y"), 0o644); err != nil {
		t.Fatal(err)
	}

	same, err := SameVolume(afero.NewOsFs(), a, b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !same {
		t.Fatal("two files in the same tempdir should be on the same volume")
	}
}

func TestSameVolumeUnknownFsIsFalse(t *testing.T) {
	// A MemMapFs FileInfo carries no *syscall.Stat_t, so the device id is
	// unknowable → SameVolume must report false (the safe, ordinary-lane answer).
	fs := afero.NewMemMapFs()
	_ = afero.WriteFile(fs, "/a", []byte("x"), 0o644)
	_ = afero.WriteFile(fs, "/b", []byte("y"), 0o644)

	same, err := SameVolume(fs, "/a", "/b")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if same {
		t.Fatal("an in-memory fs has no st_dev → must be reported not-same (safe)")
	}
}

func TestSameVolumeMissingPathErrors(t *testing.T) {
	dir := t.TempDir()
	if _, err := SameVolume(afero.NewOsFs(), filepath.Join(dir, "nope"), dir); err == nil {
		t.Fatal("a missing source path should surface a stat error")
	}
}
