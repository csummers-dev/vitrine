package fileutils

import (
	"context"
	"io/fs"
	"os"
	"path"

	"github.com/spf13/afero"
)

// Progress receives copy progress for a transfer. Methods are called from the
// goroutine performing the copy. A nil Progress is normalized to a no-op at the
// public entry points, so internal helpers can assume it's non-nil.
//
// The interface is intentionally structural: *jobs.Job satisfies it, so the job
// layer passes a job straight in without fileutils importing jobs.
type Progress interface {
	// AddBytes reports n freshly-written bytes.
	AddBytes(n int64)
	// StartFile marks the file now being copied (base name + destination).
	StartFile(name, to string)
	// FinishFile marks the current file as fully copied.
	FinishFile()
}

type nopProgress struct{}

func (nopProgress) AddBytes(int64)           {}
func (nopProgress) StartFile(string, string) {}
func (nopProgress) FinishFile()              {}

// Copy copies a file or folder from one place to another.
func Copy(afs afero.Fs, src, dst string, fileMode, dirMode fs.FileMode) error {
	return CopyWithProgress(context.Background(), afs, src, dst, fileMode, dirMode, nil)
}

// CopyWithProgress is Copy with cancellation + progress reporting. ctx is
// checked between chunks and files so a large copy aborts promptly on cancel;
// p (may be nil) receives byte + per-file progress.
func CopyWithProgress(ctx context.Context, afs afero.Fs, src, dst string, fileMode, dirMode fs.FileMode, p Progress) error {
	if p == nil {
		p = nopProgress{}
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	if src = path.Clean("/" + src); src == "" {
		return os.ErrNotExist
	}
	if dst = path.Clean("/" + dst); dst == "" {
		return os.ErrNotExist
	}
	if src == "/" || dst == "/" {
		// Prohibit copying from or to the virtual root directory.
		return os.ErrInvalid
	}
	if dst == src {
		return os.ErrInvalid
	}

	info, err := afs.Stat(src)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDir(ctx, afs, src, dst, fileMode, dirMode, p)
	}
	return copyFile(ctx, afs, src, dst, fileMode, dirMode, p)
}

// CountBytes walks src and returns the total size + count of regular files —
// the denominator for a transfer's progress percentage. Directories, symlinks,
// and devices are skipped (only real bytes-to-copy are counted).
func CountBytes(afs afero.Fs, src string) (bytes int64, files int, err error) {
	werr := afero.Walk(afs, src, func(_ string, info fs.FileInfo, e error) error {
		if e != nil {
			return e
		}
		if info.IsDir() || !info.Mode().IsRegular() {
			return nil
		}
		bytes += info.Size()
		files++
		return nil
	})
	return bytes, files, werr
}
