package fileutils

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/spf13/afero"
)

// recProgress records progress callbacks. onByte (optional) fires after each
// AddBytes — the cancel tests use it to cancel mid-copy. These tests run the
// copy synchronously in the test goroutine, so plain fields are race-free.
type recProgress struct {
	bytes    int64
	starts   []string
	finishes int
	onByte   func()
}

func (r *recProgress) AddBytes(n int64) {
	r.bytes += n
	if r.onByte != nil {
		r.onByte()
	}
}
func (r *recProgress) StartFile(name, _ string) { r.starts = append(r.starts, name) }
func (r *recProgress) FinishFile()              { r.finishes++ }

func TestCopyWithProgressCountsBytesAndFile(t *testing.T) {
	fs := afero.NewMemMapFs()
	content := strings.Repeat("ab", 100*1024) // 200 KiB → multiple chunks
	seed(t, fs, "/src/a.txt", content)

	prog := &recProgress{}
	if err := CopyWithProgress(context.Background(), fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755, prog); err != nil {
		t.Fatalf("CopyWithProgress: %v", err)
	}

	if prog.bytes != int64(len(content)) {
		t.Errorf("bytes: got %d, want %d", prog.bytes, len(content))
	}
	if len(prog.starts) != 1 || prog.starts[0] != "a.txt" || prog.finishes != 1 {
		t.Errorf("file callbacks: starts=%v finishes=%d", prog.starts, prog.finishes)
	}
	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != content {
		t.Errorf("dest content mismatch (len %d, want %d)", len(got), len(content))
	}
}

func TestCopyWithProgressDirCountsEveryFile(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/src/d/a.txt", "AAA")     // 3
	seed(t, fs, "/src/d/sub/b.txt", "BB")  // 2
	seed(t, fs, "/src/d/sub/c.txt", "CCC") // 3

	prog := &recProgress{}
	if err := CopyWithProgress(context.Background(), fs, "/src/d", "/dst/d", 0o644, 0o755, prog); err != nil {
		t.Fatalf("CopyWithProgress dir: %v", err)
	}
	if prog.bytes != 8 {
		t.Errorf("dir bytes: got %d, want 8", prog.bytes)
	}
	if prog.finishes != 3 {
		t.Errorf("dir finishes: got %d, want 3", prog.finishes)
	}
}

func TestCountBytes(t *testing.T) {
	fs := afero.NewMemMapFs()
	seed(t, fs, "/src/d/a.txt", "AAA")    // 3
	seed(t, fs, "/src/d/sub/b.txt", "BB") // 2

	b, n, err := CountBytes(fs, "/src/d")
	if err != nil {
		t.Fatalf("CountBytes dir: %v", err)
	}
	if b != 5 || n != 2 {
		t.Errorf("dir: got %d bytes / %d files, want 5/2", b, n)
	}

	seed(t, fs, "/x.txt", "hello") // 5
	if b, n, err = CountBytes(fs, "/x.txt"); err != nil || b != 5 || n != 1 {
		t.Errorf("single file: got %d/%d (err %v), want 5/1", b, n, err)
	}
}

func TestCopyWithProgressCancelReturnsCanceledAndKeepsSource(t *testing.T) {
	fs := afero.NewMemMapFs()
	big := strings.Repeat("y", 256*1024) // spans several 32 KiB chunks
	seed(t, fs, "/src/big.bin", big)

	ctx, cancel := context.WithCancel(context.Background())
	prog := &recProgress{onByte: cancel} // cancel after the first chunk

	err := CopyWithProgress(ctx, fs, "/src/big.bin", "/dst/big.bin", 0o644, 0o755, prog)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled in chain, got %v", err)
	}
	// A copy never touches the source.
	if _, e := fs.Stat("/src/big.bin"); e != nil {
		t.Errorf("source disturbed by a canceled copy: %v", e)
	}
}

func TestMoveFileWithProgressCancelLeavesSourceIntact(t *testing.T) {
	fs := newXdev() // forces the cross-device copy+delete path
	big := strings.Repeat("x", 256*1024)
	seed(t, fs, "/src/big.bin", big)

	ctx, cancel := context.WithCancel(context.Background())
	prog := &recProgress{onByte: cancel} // cancel mid-copy

	err := MoveFileWithProgress(ctx, fs, "/src/big.bin", "/dst/big.bin", 0o644, 0o755, prog)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled in chain, got %v", err)
	}
	// Source preserved — a canceled move loses nothing.
	if _, e := fs.Stat("/src/big.bin"); e != nil {
		t.Errorf("source removed after a canceled move: %v", e)
	}
	// Partial destination cleaned up.
	if _, e := fs.Stat("/dst/big.bin"); !errors.Is(e, os.ErrNotExist) {
		t.Errorf("partial destination not cleaned up: %v", e)
	}
}

func TestMoveFileWithProgressSameVolumeStillRenames(t *testing.T) {
	fs := afero.NewMemMapFs() // Rename succeeds → instant path, no progress
	seed(t, fs, "/src/a.txt", "data")

	prog := &recProgress{}
	if err := MoveFileWithProgress(context.Background(), fs, "/src/a.txt", "/dst/a.txt", 0o644, 0o755, prog); err != nil {
		t.Fatalf("MoveFileWithProgress same-volume: %v", err)
	}
	if prog.bytes != 0 || prog.finishes != 0 {
		t.Errorf("instant rename should report no byte/file progress, got %d bytes / %d files", prog.bytes, prog.finishes)
	}
	if _, e := fs.Stat("/src/a.txt"); !errors.Is(e, os.ErrNotExist) {
		t.Errorf("source still present after rename: %v", e)
	}
	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != "data" {
		t.Errorf("dest = %q, want %q", got, "data")
	}
}
