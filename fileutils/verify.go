package fileutils

import (
	"encoding/binary"
	"errors"
	"io"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/cespare/xxhash/v2"
	"github.com/spf13/afero"
)

// ErrVerifyMismatch is returned by Verify (and MoveFileVerified) when a freshly
// copied destination does not byte-for-byte match its source — the opt-in
// integrity check for transfers (2.4.0 Stage 4). The caller keeps the source and
// reports it; nothing is lost.
var ErrVerifyMismatch = errors.New("integrity check failed: the copy does not match the source")

// treeHash computes a deterministic xxhash64 over the regular-file CONTENT and
// relative STRUCTURE of the tree rooted at root. For a single file it's that
// file's content hash; for a directory it folds every regular file (in the
// lexical order afero.Walk yields) into one running digest, framing each by its
// root-relative path + size so a byte can't silently "shift" from one file into
// its neighbor. Symlinks, devices, and directories contribute no bytes (only the
// real data that a copy would reproduce is hashed), matching CountBytes.
func treeHash(afs afero.Fs, root string) (uint64, error) {
	h := xxhash.New()
	werr := afero.Walk(afs, root, func(p string, info fs.FileInfo, e error) error {
		if e != nil {
			return e
		}
		if info.IsDir() || !info.Mode().IsRegular() {
			return nil
		}
		// Frame each file by its path RELATIVE to root (so the same content at
		// the same sub-path hashes equal whether under src or dst) + its size.
		rel := filepath.ToSlash(strings.TrimPrefix(p, root))
		_, _ = io.WriteString(h, rel)
		var sz [8]byte
		binary.LittleEndian.PutUint64(sz[:], uint64(info.Size()))
		_, _ = h.Write(sz[:])

		f, err := afs.Open(p)
		if err != nil {
			return err
		}
		_, err = io.Copy(h, f)
		_ = f.Close()
		return err
	})
	return h.Sum64(), werr
}

// Verify returns nil when a and b have byte-identical content (recursively, for
// directories) and ErrVerifyMismatch when they differ. A read error on either
// side surfaces as that error (treated as a verification failure by callers, who
// keep the source). It re-reads both trees in full — that's the cost of an
// integrity check — so it's only invoked when verification is opted in.
func Verify(afs afero.Fs, a, b string) error {
	ha, err := treeHash(afs, a)
	if err != nil {
		return err
	}
	hb, err := treeHash(afs, b)
	if err != nil {
		return err
	}
	if ha != hb {
		return ErrVerifyMismatch
	}
	return nil
}
