package fileutils

import (
	"context"
	"errors"
	"fmt"
	"io/fs"

	"github.com/spf13/afero"
)

// CopyDir copies a directory from source to dest and all of its
// sub-directories. It doesn't stop on a per-file error (collects + joins them);
// it DOES stop promptly on context cancellation. Returns an error if any.
func CopyDir(afs afero.Fs, source, dest string, fileMode, dirMode fs.FileMode) error {
	return copyDir(context.Background(), afs, source, dest, fileMode, dirMode, nopProgress{})
}

func copyDir(ctx context.Context, afs afero.Fs, source, dest string, fileMode, dirMode fs.FileMode, p Progress) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	// Get properties of source.
	srcinfo, err := afs.Stat(source)
	if err != nil {
		return fmt.Errorf("stat dir %q: %w", source, err)
	}

	// Create the destination directory, preserving the source's permission
	// bits. Mask to .Perm() (the low permission bits) so the os.ModeDir / type
	// bits are never handed to MkdirAll — some filesystems reject a mode that
	// carries them.
	if err = afs.MkdirAll(dest, srcinfo.Mode().Perm()); err != nil {
		return fmt.Errorf("mkdir %q: %w", dest, err)
	}

	dir, err := afs.Open(source)
	if err != nil {
		return fmt.Errorf("open dir %q: %w", source, err)
	}
	obs, err := dir.Readdir(-1)
	_ = dir.Close()
	if err != nil {
		return fmt.Errorf("read dir %q: %w", source, err)
	}

	var errs []error

	for _, obj := range obs {
		// Bail promptly on cancellation rather than attempting every remaining
		// child (the partial destination is cleaned up by the caller — e.g.
		// MoveFileWithProgress removes it and leaves the source intact).
		if cerr := ctx.Err(); cerr != nil {
			return cerr
		}

		fsource := source + "/" + obj.Name()
		fdest := dest + "/" + obj.Name()

		if obj.IsDir() {
			// Create sub-directories, recursively.
			err = copyDir(ctx, afs, fsource, fdest, fileMode, dirMode, p)
		} else {
			// Perform the file copy.
			err = copyFile(ctx, afs, fsource, fdest, fileMode, dirMode, p)
		}
		if err != nil {
			// A cancellation aborts the whole tree immediately; an ordinary
			// per-file error is collected so the copy makes maximum progress.
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			errs = append(errs, err)
		}
	}

	// errors.Join returns nil when errs is empty, and preserves each wrapped
	// child error (op + path + errno) for diagnosis.
	return errors.Join(errs...)
}
