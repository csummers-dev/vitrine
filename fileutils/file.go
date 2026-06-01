package fileutils

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"syscall"

	"github.com/spf13/afero"
)

// ignorableMetaErr reports whether a metadata operation (chmod/chtimes)
// failed for a reason that shouldn't abort a copy: the destination
// filesystem simply doesn't support it. The file's CONTENTS are already
// written by that point, so failing the whole move over a permission-bit
// tweak would strand data. Seen on some network shares / FUSE / overlay
// mounts, which reject chmod with EINVAL / EPERM / ENOTSUP.
func ignorableMetaErr(err error) bool {
	return errors.Is(err, syscall.EINVAL) ||
		errors.Is(err, syscall.EPERM) ||
		errors.Is(err, syscall.ENOTSUP) ||
		errors.Is(err, syscall.ENOSYS) ||
		errors.Is(err, fs.ErrPermission)
}

// MoveFile moves file from src to dst.
// By default the rename filesystem system call is used. If src and dst point to different volumes
// the file copy is used as a fallback
func MoveFile(afs afero.Fs, src, dst string, fileMode, dirMode fs.FileMode) error {
	if afs.Rename(src, dst) == nil {
		return nil
	}
	// Rename failed — most commonly EXDEV when src and dst live on
	// different mounts. Separate Docker bind mounts count as different
	// mounts even when they're backed by the same underlying filesystem,
	// so cross-folder moves on a multi-volume setup always land here.
	// Fall back to a deep copy + delete.
	if err := Copy(afs, src, dst, fileMode, dirMode); err != nil {
		// Clean up whatever the copy managed to write. RemoveAll (not
		// Remove) so a partially-copied DIRECTORY isn't stranded at the
		// destination — Remove can't delete a non-empty dir, which used
		// to leave half-moved folders behind on any copy error. The
		// source is left untouched so nothing is lost.
		_ = afs.RemoveAll(dst)
		return fmt.Errorf("move %q -> %q: copy fallback failed: %w", src, dst, err)
	}
	if err := afs.RemoveAll(src); err != nil {
		return fmt.Errorf("move %q -> %q: copied ok but removing source failed: %w", src, dst, err)
	}
	return nil
}

// CopyFile copies a file from source to dest and returns
// an error if any. Errors are wrapped with the failing operation + path
// so a failed move surfaces exactly which file (and which syscall) broke.
func CopyFile(afs afero.Fs, source, dest string, fileMode, dirMode fs.FileMode) error {
	// Open the source file.
	src, err := afs.Open(source)
	if err != nil {
		return fmt.Errorf("open source %q: %w", source, err)
	}
	defer src.Close()

	// Makes the directory needed to create the dst
	// file.
	err = afs.MkdirAll(filepath.Dir(dest), dirMode)
	if err != nil {
		return fmt.Errorf("mkdir for %q: %w", dest, err)
	}

	// Create the destination file.
	dst, err := afs.OpenFile(dest, os.O_RDWR|os.O_CREATE|os.O_TRUNC, fileMode)
	if err != nil {
		return fmt.Errorf("create dest %q: %w", dest, err)
	}
	defer dst.Close()

	// Copy the contents of the file.
	_, err = io.Copy(dst, src)
	if err != nil {
		return fmt.Errorf("copy bytes to %q: %w", dest, err)
	}

	// Copy the mode — best-effort. The bytes are already written; if the
	// destination filesystem rejects the chmod (EINVAL/EPERM/ENOTSUP on
	// some network/FUSE mounts) the file keeps its create-time mode
	// rather than failing the whole move.
	info, err := afs.Stat(source)
	if err != nil {
		return fmt.Errorf("stat source %q: %w", source, err)
	}
	if err = afs.Chmod(dest, info.Mode()); err != nil && !ignorableMetaErr(err) {
		return fmt.Errorf("chmod dest %q: %w", dest, err)
	}

	return nil
}

// CommonPrefix returns common directory path of provided files
func CommonPrefix(sep byte, paths ...string) string {
	// Handle special cases.
	switch len(paths) {
	case 0:
		return ""
	case 1:
		return path.Clean(paths[0])
	}

	// Note, we treat string as []byte, not []rune as is often
	// done in Go. (And sep as byte, not rune). This is because
	// most/all supported OS' treat paths as string of non-zero
	// bytes. A filename may be displayed as a sequence of Unicode
	// runes (typically encoded as UTF-8) but paths are
	// not required to be valid UTF-8 or in any normalized form
	// (e.g. "é" (U+00C9) and "é" (U+0065,U+0301) are different
	// file names.
	c := []byte(path.Clean(paths[0]))

	// We add a trailing sep to handle the case where the
	// common prefix directory is included in the path list
	// (e.g. /home/user1, /home/user1/foo, /home/user1/bar).
	// path.Clean will have cleaned off trailing / separators with
	// the exception of the root directory, "/" (in which case we
	// make it "//", but this will get fixed up to "/" below).
	c = append(c, sep)

	// Ignore the first path since it's already in c
	for _, v := range paths[1:] {
		// Clean up each path before testing it
		v = path.Clean(v) + string(sep)

		// Find the first non-common byte and truncate c
		if len(v) < len(c) {
			c = c[:len(v)]
		}
		for i := 0; i < len(c); i++ {
			if v[i] != c[i] {
				c = c[:i]
				break
			}
		}
	}

	// Remove trailing non-separator characters and the final separator
	for i := len(c) - 1; i >= 0; i-- {
		if c[i] == sep {
			c = c[:i]
			break
		}
	}

	return string(c)
}
