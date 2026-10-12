// Package dupes finds duplicate files (4.0 Phase 5.2).
//
// A scan narrows candidates in three passes so most files are never read
// in full:
//
//  1. walk the folder and group files by size; a size held by one file
//     can't have a duplicate;
//  2. hash the first and last 64 KB of each remaining file (the whole file
//     when it's that small) and regroup;
//  3. fully hash only what still collides.
//
// Hashes are SHA-256 (hardware-accelerated on amd64 and arm64, and in the
// standard library). They're cached by path, size and modified time, so a
// re-scan of an unchanged library reads almost nothing.
//
// The package takes walk and open functions rather than a filesystem, so
// the HTTP layer can pass the user's scoped afero.Fs and tests can use a
// temp directory.
package dupes

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// EdgeBytes is how much of each end of a file the partial hash reads.
const EdgeBytes = 64 * 1024

// DefaultMinSize skips small files unless asked: they free little space
// and are often meant to be identical (icons, sidecars).
const DefaultMinSize = 1 << 20

// File is an open file to hash.
type File interface {
	io.Reader
	io.ReaderAt
	io.Closer
}

// Entry is a cached hash. It's valid while the file's size and modified
// time still match.
type Entry struct {
	Size    int64  `json:"size"`
	ModTime int64  `json:"mtime"` // Unix nanoseconds
	Partial string `json:"partial,omitempty"`
	Full    string `json:"full,omitempty"`
}

// Cache stores hashes between scans. Paths are scope-relative, so an
// implementation keys them by user as well.
type Cache interface {
	Lookup(paths []string) (map[string]Entry, error)
	Store(entries map[string]Entry) error
}

// Options tune a scan. Zero values pick the defaults.
type Options struct {
	// MinSize skips smaller files (default 1 MB; set 1 to include all).
	MinSize int64
	// IncludeHidden scans dot-files and dot-folders too.
	IncludeHidden bool
	// Exclude lists folders (scope-relative) to leave out.
	Exclude []string
	// Allowed reports whether a path may be read (the user's rules).
	Allowed func(p string) bool
	// SkipDir reports folders always left out (e.g. the recycle bin).
	SkipDir func(name string) bool
}

// Progress is a snapshot of a running scan.
type Progress struct {
	// Phase is "listing", "hashing" or "done".
	Phase string `json:"phase"`
	// FilesSeen counts files looked at while listing.
	FilesSeen int `json:"filesSeen"`
	// Candidates is how many files share a size with another.
	Candidates int `json:"candidates"`
	// Hashed counts candidates whose hashing is finished.
	Hashed int `json:"hashed"`
	// BytesRead is how much was actually read to hash.
	BytesRead int64 `json:"bytesRead"`
}

// Copy is one file in a duplicate group.
type Copy struct {
	Path     string    `json:"path"`
	Name     string    `json:"name"`
	Modified time.Time `json:"modified"`
}

// Group is a set of files with identical content.
type Group struct {
	Size  int64  `json:"size"`
	Hash  string `json:"hash"`
	Files []Copy `json:"files"`
}

// Reclaimable is the space freed by keeping one copy.
func (g Group) Reclaimable() int64 { return g.Size * int64(len(g.Files)-1) }

// Result is a finished scan.
type Result struct {
	Groups      []Group `json:"groups"`
	Reclaimable int64   `json:"reclaimable"`
	FilesSeen   int     `json:"filesSeen"`
}

// WalkFunc walks the tree under root, like filepath.Walk.
type WalkFunc func(root string, fn filepath.WalkFunc) error

// OpenFunc opens a file for reading.
type OpenFunc func(p string) (File, error)

type candidate struct {
	path string
	size int64
	mod  time.Time
	key  string // partial, then full hash
}

// Scanner runs one scan. Progress may be read from another goroutine.
type Scanner struct {
	Walk  WalkFunc
	Open  OpenFunc
	Cache Cache // optional

	mu       sync.Mutex
	progress Progress
}

// Progress returns a snapshot of the scan's progress.
func (s *Scanner) Progress() Progress {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.progress
}

func (s *Scanner) update(fn func(p *Progress)) {
	s.mu.Lock()
	fn(&s.progress)
	s.mu.Unlock()
}

// Scan finds duplicates under root. It stops early with ctx.Err() when
// the context is canceled. Unreadable files are skipped.
func (s *Scanner) Scan(ctx context.Context, root string, opts Options) (*Result, error) {
	if opts.MinSize <= 0 {
		opts.MinSize = DefaultMinSize
	}
	if opts.Allowed == nil {
		opts.Allowed = func(string) bool { return true }
	}
	if opts.SkipDir == nil {
		opts.SkipDir = func(string) bool { return false }
	}
	root = path.Clean("/" + root)
	exclude := make([]string, 0, len(opts.Exclude))
	for _, e := range opts.Exclude {
		if e = strings.TrimSpace(e); e != "" {
			exclude = append(exclude, path.Clean("/"+e))
		}
	}

	s.update(func(p *Progress) { *p = Progress{Phase: "listing"} })
	bySize := map[int64][]*candidate{}
	seen := 0
	err := s.Walk(root, func(p string, info fs.FileInfo, err error) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		p = filepath.ToSlash(p)
		if err != nil || info == nil {
			if info != nil && info.IsDir() && p != root {
				return filepath.SkipDir
			}
			return nil
		}
		hidden := strings.HasPrefix(info.Name(), ".") && p != root
		if info.IsDir() {
			if p == root {
				return nil
			}
			if (hidden && !opts.IncludeHidden) || opts.SkipDir(info.Name()) ||
				!opts.Allowed(p) || isExcluded(p, exclude) {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.Mode().IsRegular() || (hidden && !opts.IncludeHidden) || !opts.Allowed(p) {
			return nil
		}
		seen++
		if seen%500 == 0 {
			n := seen
			s.update(func(pr *Progress) { pr.FilesSeen = n })
		}
		if info.Size() < opts.MinSize {
			return nil
		}
		bySize[info.Size()] = append(bySize[info.Size()], &candidate{
			path: p, size: info.Size(), mod: info.ModTime(),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	var cands []*candidate
	for _, c := range bySize {
		if len(c) > 1 {
			cands = append(cands, c...)
		}
	}
	s.update(func(p *Progress) {
		p.Phase, p.FilesSeen, p.Candidates = "hashing", seen, len(cands)
	})

	cached := map[string]Entry{}
	if s.Cache != nil && len(cands) > 0 {
		paths := make([]string, len(cands))
		for i, c := range cands {
			paths[i] = c.path
		}
		if got, cerr := s.Cache.Lookup(paths); cerr == nil {
			cached = got
		}
	}
	fresh := map[string]Entry{}
	entryFor := func(c *candidate) Entry {
		if e, ok := fresh[c.path]; ok {
			return e
		}
		e := cached[c.path]
		if e.Size != c.size || e.ModTime != c.mod.UnixNano() {
			e = Entry{Size: c.size, ModTime: c.mod.UnixNano()}
		}
		return e
	}

	// Pass 2: edges.
	survivors := regroup(cands, func(c *candidate) (string, bool) {
		if ctx.Err() != nil {
			return "", false
		}
		e := entryFor(c)
		if e.Partial == "" {
			sum, n, herr := s.partialHash(c.path, c.size)
			if herr != nil {
				return "", false
			}
			e.Partial = sum
			if c.size <= 2*EdgeBytes {
				e.Full = sum // the whole file was read
			}
			fresh[c.path] = e
			s.update(func(p *Progress) { p.BytesRead += n })
		}
		return e.Partial, true
	})
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Count files settled by the edge pass as done.
	settled := len(cands) - len(survivors)
	s.update(func(p *Progress) { p.Hashed = settled })

	// Pass 3: full content.
	final := regroup(survivors, func(c *candidate) (string, bool) {
		if ctx.Err() != nil {
			return "", false
		}
		e := entryFor(c)
		if e.Full == "" {
			sum, n, herr := s.fullHash(ctx, c.path)
			if herr != nil {
				return "", false
			}
			e.Full = sum
			fresh[c.path] = e
			s.update(func(p *Progress) { p.BytesRead += n })
		}
		s.update(func(p *Progress) { p.Hashed++ })
		return e.Full, true
	})
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	if s.Cache != nil && len(fresh) > 0 {
		_ = s.Cache.Store(fresh) // a cache failure only costs speed next time
	}

	res := &Result{FilesSeen: seen}
	byKey := map[string][]*candidate{}
	for _, c := range final {
		k := c.key
		byKey[k] = append(byKey[k], c)
	}
	for _, list := range byKey {
		if len(list) < 2 {
			continue
		}
		g := Group{Size: list[0].size, Hash: list[0].key}
		for _, c := range list {
			g.Files = append(g.Files, Copy{Path: c.path, Name: path.Base(c.path), Modified: c.mod})
		}
		sort.Slice(g.Files, func(i, j int) bool { return g.Files[i].Path < g.Files[j].Path })
		res.Groups = append(res.Groups, g)
		res.Reclaimable += g.Reclaimable()
	}
	SortGroups(res.Groups)
	s.update(func(p *Progress) { p.Phase, p.Hashed = "done", len(cands) })
	return res, nil
}

// SortGroups orders groups by space freed, biggest first.
func SortGroups(groups []Group) {
	sort.Slice(groups, func(i, j int) bool {
		a, b := groups[i].Reclaimable(), groups[j].Reclaimable()
		if a != b {
			return a > b
		}
		return groups[i].Files[0].Path < groups[j].Files[0].Path
	})
}

// regroup keys each candidate (within its size) and keeps those that share
// a key with another. A candidate that can't be keyed drops out.
func regroup(cands []*candidate, key func(*candidate) (string, bool)) []*candidate {
	buckets := map[string][]*candidate{}
	for _, c := range cands {
		k, ok := key(c)
		if !ok {
			continue
		}
		c.key = k
		id := sizeKey(c.size) + k
		buckets[id] = append(buckets[id], c)
	}
	var out []*candidate
	for _, b := range buckets {
		if len(b) > 1 {
			out = append(out, b...)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].path < out[j].path })
	return out
}

func sizeKey(n int64) string {
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], uint64(n))
	return string(b[:])
}

func isExcluded(p string, exclude []string) bool {
	for _, e := range exclude {
		if e == "/" || p == e || strings.HasPrefix(p, e+"/") {
			return true
		}
	}
	return false
}

// partialHash hashes the size and the first and last EdgeBytes (the whole
// file when it's no bigger than both edges).
func (s *Scanner) partialHash(p string, size int64) (string, int64, error) {
	f, err := s.Open(p)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	_, _ = h.Write([]byte(sizeKey(size)))
	if size <= 2*EdgeBytes {
		n, err := io.Copy(h, f)
		if err != nil {
			return "", n, err
		}
		if n != size {
			return "", n, errors.New("dupes: file changed while reading")
		}
		return "p" + hex.EncodeToString(h.Sum(nil)), n, nil
	}
	buf := make([]byte, EdgeBytes)
	if _, err := f.ReadAt(buf, 0); err != nil {
		return "", 0, err
	}
	_, _ = h.Write(buf)
	if _, err := f.ReadAt(buf, size-EdgeBytes); err != nil {
		return "", EdgeBytes, err
	}
	_, _ = h.Write(buf)
	return "p" + hex.EncodeToString(h.Sum(nil)), 2 * EdgeBytes, nil
}

// fullHash hashes the whole file, checking ctx between chunks.
func (s *Scanner) fullHash(ctx context.Context, p string) (string, int64, error) {
	f, err := s.Open(p)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 1<<20)
	var total int64
	for {
		if err := ctx.Err(); err != nil {
			return "", total, err
		}
		n, rerr := f.Read(buf)
		if n > 0 {
			_, _ = h.Write(buf[:n])
			total += int64(n)
		}
		if errors.Is(rerr, io.EOF) {
			break
		}
		if rerr != nil {
			return "", total, rerr
		}
	}
	return hex.EncodeToString(h.Sum(nil)), total, nil
}
