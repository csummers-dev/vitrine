package audiotags

import (
	"io"
	"os"
	"path/filepath"
)

// atomicReplace builds the new file by calling write() with a sibling temp
// path, then renames that temp over origPath. The original is untouched unless
// the final rename succeeds, so an error or crash mid-write never corrupts it.
// The original's permission bits are preserved.
func atomicReplace(origPath string, write func(tmpPath string) error) error {
	dir := filepath.Dir(origPath)
	tmp, err := os.CreateTemp(dir, ".audiotags-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()

	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(tmpPath)
		}
	}()

	if err := write(tmpPath); err != nil {
		return err
	}

	// Preserve the original's permission bits — and, on Unix, its owner/group
	// (best-effort; needs privilege) — on the replacement.
	if fi, statErr := os.Stat(origPath); statErr == nil {
		_ = os.Chmod(tmpPath, fi.Mode().Perm())
		preserveOwner(tmpPath, fi)
	}

	if err := os.Rename(tmpPath, origPath); err != nil {
		return err
	}
	committed = true
	return nil
}

// copyFile copies src to dst (truncating dst). Used by the MP3 path, which
// edits a copy in place via id3v2 before the atomic rename.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}
