package fileutils

import (
	"context"
	"errors"
	"os"
	"strings"
	"syscall"
	"testing"

	"github.com/spf13/afero"
)

func TestVerifyIdenticalFile(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "hello world")
	seed(t, fs, "/b.txt", "hello world")
	if err := Verify(fs, "/a.txt", "/b.txt"); err != nil {
		t.Fatalf("identical files should verify, got %v", err)
	}
}

func TestVerifyMismatchFile(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "hello world")
	seed(t, fs, "/b.txt", "hello worlx") // one byte differs
	if err := Verify(fs, "/a.txt", "/b.txt"); !errors.Is(err, ErrVerifyMismatch) {
		t.Fatalf("differing files should mismatch, got %v", err)
	}
}

func TestVerifyDifferentSizeMismatch(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "hello")
	seed(t, fs, "/b.txt", "hello!") // longer
	if err := Verify(fs, "/a.txt", "/b.txt"); !errors.Is(err, ErrVerifyMismatch) {
		t.Fatalf("size difference should mismatch, got %v", err)
	}
}

func TestVerifyIdenticalTree(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/src/a.txt", "alpha")
	seed(t, fs, "/src/sub/b.txt", "beta")
	seed(t, fs, "/dst/a.txt", "alpha")
	seed(t, fs, "/dst/sub/b.txt", "beta")
	if err := Verify(fs, "/src", "/dst"); err != nil {
		t.Fatalf("identical trees should verify, got %v", err)
	}

	// Tamper one leaf — the whole-tree digest must now differ.
	seed(t, fs, "/dst/sub/b.txt", "beto")
	if err := Verify(fs, "/src", "/dst"); !errors.Is(err, ErrVerifyMismatch) {
		t.Fatalf("a tampered leaf should mismatch, got %v", err)
	}
}

func TestMoveFileVerifiedCrossDeviceOK(t *testing.T) {
	fs := newXdev() // Rename → EXDEV, so the copy+verify+delete path runs
	seed(t, fs, "/src/a.txt", "payload")

	if err := MoveFileVerified(context.Background(), fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755, nil); err != nil {
		t.Fatalf("verified move should succeed: %v", err)
	}
	if _, err := fs.Stat("/src/a.txt"); err == nil {
		t.Error("source should be gone after a successful verified move")
	}
	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != "payload" {
		t.Errorf("dst = %q, want %q", got, "payload")
	}
}

// corruptReadFs forces EXDEV on Rename (so the copy path runs) AND flips the
// first byte read back from any path under `prefix` — simulating a destination
// that was written correctly but reads back corrupted (a bad disk / bitflip).
// It lets us assert MoveFileVerified keeps the source when verification fails.
type corruptReadFs struct {
	afero.Fs
	prefix string
}

func (x corruptReadFs) Rename(o, n string) error {
	return &os.LinkError{Op: "rename", Old: o, New: n, Err: syscall.EXDEV}
}

func (x corruptReadFs) Open(name string) (afero.File, error) {
	f, err := x.Fs.Open(name)
	if err != nil || !strings.HasPrefix(name, x.prefix) {
		return f, err
	}
	return &corruptFile{File: f}, nil
}

type corruptFile struct {
	afero.File
	flipped bool
}

func (c *corruptFile) Read(p []byte) (int, error) {
	n, err := c.File.Read(p)
	if n > 0 && !c.flipped {
		p[0] ^= 0xFF
		c.flipped = true
	}
	return n, err
}

func TestMoveFileVerifiedMismatchKeepsSource(t *testing.T) {
	fs := corruptReadFs{Fs: afero.NewMemMapFs(), prefix: "/dst"}
	seed(t, fs, "/src/a.txt", "important data")

	err := MoveFileVerified(context.Background(), fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755, nil)
	if !errors.Is(err, ErrVerifyMismatch) {
		t.Fatalf("want ErrVerifyMismatch, got %v", err)
	}
	// The whole point: a bad copy must NOT delete the source.
	if _, statErr := fs.Stat("/src/a.txt"); statErr != nil {
		t.Errorf("source must survive a failed verify: %v", statErr)
	}
	// And the bad destination is cleaned up.
	if _, statErr := fs.Stat("/dst/a.txt"); statErr == nil {
		t.Error("the mismatched destination should have been removed")
	}
}
