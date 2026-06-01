package fileutils

import (
	"errors"
	"fmt"
	"io/fs"

	"github.com/spf13/afero"
)

// CopyDir copies a directory from source to dest and all
// of its sub-directories. It doesn't stop if it finds an error
// during the copy. Returns an error if any.
func CopyDir(afs afero.Fs, source, dest string, fileMode, dirMode fs.FileMode) error {
	// Get properties of source.
	srcinfo, err := afs.Stat(source)
	if err != nil {
		return fmt.Errorf("stat dir %q: %w", source, err)
	}

	// Create the destination directory, preserving the source's
	// permission bits. Mask to .Perm() (the low permission bits) so the
	// os.ModeDir / type bits are never handed to MkdirAll — some
	// filesystems reject a mode that carries them.
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
		fsource := source + "/" + obj.Name()
		fdest := dest + "/" + obj.Name()

		if obj.IsDir() {
			// Create sub-directories, recursively.
			if err = CopyDir(afs, fsource, fdest, fileMode, dirMode); err != nil {
				errs = append(errs, err)
			}
		} else {
			// Perform the file copy.
			if err = CopyFile(afs, fsource, fdest, fileMode, dirMode); err != nil {
				errs = append(errs, err)
			}
		}
	}

	// errors.Join returns nil when errs is empty, and preserves each
	// wrapped child error (op + path + errno) for diagnosis.
	return errors.Join(errs...)
}
