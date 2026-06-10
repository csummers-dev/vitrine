//go:build !windows

package fileutils

import (
	"syscall"

	"github.com/spf13/afero"
)

// DeviceID returns the filesystem device id (st_dev) of path, with ok=false
// when it can't be determined (stat error, or a FileInfo without a
// *syscall.Stat_t — e.g. an in-memory test fs). Callers treat not-ok
// conservatively, the same philosophy as SameVolume below. Used by the trash
// package to find the top of the volume a deleted file lives on.
func DeviceID(afs afero.Fs, path string) (uint64, bool) {
	fi, err := afs.Stat(path)
	if err != nil {
		return 0, false
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, false
	}
	return uint64(st.Dev), true //nolint:unconvert // Dev is int32 on darwin, uint64 on linux
}

// SameVolume reports whether paths a and b live on the same filesystem volume —
// i.e. whether a rename(a→b) would stay an instant metadata operation rather
// than fall back to a cross-device copy. It compares the underlying device id
// (st_dev) of each path.
//
// It exists purely to ROUTE a move onto the fast worker lane (see jobs.Registry)
// and is deliberately conservative: any uncertainty — a stat error, or a
// filesystem whose FileInfo carries no *syscall.Stat_t (e.g. an in-memory test
// fs) — yields (false, …) so the caller takes the safe, ordinary queued path.
//
// This is a hint, not a guarantee: two separate bind mounts backed by the same
// underlying filesystem share a device id yet still reject a cross-mount rename
// with EXDEV. MoveFileWithProgress copes by falling back to a copy, so a rare
// misclassification only costs that one item a copy — the move is never wrong.
//
// Compare b as the destination's PARENT directory (the destination itself does
// not exist yet), and a as the existing source.
func SameVolume(afs afero.Fs, a, b string) (bool, error) {
	fa, err := afs.Stat(a)
	if err != nil {
		return false, err
	}
	fb, err := afs.Stat(b)
	if err != nil {
		return false, err
	}
	sa, ok1 := fa.Sys().(*syscall.Stat_t)
	sb, ok2 := fb.Sys().(*syscall.Stat_t)
	if !ok1 || !ok2 {
		return false, nil // can't tell → treat as different (safe)
	}
	return sa.Dev == sb.Dev, nil
}
