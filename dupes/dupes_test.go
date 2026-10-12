package dupes

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// tree is a temp directory scanned through the same walk/open hooks the
// HTTP layer uses, with scope-relative paths ("/a/b.mkv").
type tree struct {
	t     *testing.T
	root  string
	opens int
	mu    sync.Mutex
}

func newTree(t *testing.T) *tree { return &tree{t: t, root: t.TempDir()} }

func (tr *tree) put(rel string, data []byte) {
	tr.t.Helper()
	p := filepath.Join(tr.root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		tr.t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o600); err != nil {
		tr.t.Fatal(err)
	}
}

func (tr *tree) scanner(c Cache) *Scanner {
	return &Scanner{
		Walk: func(root string, fn filepath.WalkFunc) error {
			return filepath.Walk(filepath.Join(tr.root, root), func(p string, info os.FileInfo, err error) error {
				rel := "/" + strings.TrimPrefix(filepath.ToSlash(strings.TrimPrefix(p, tr.root)), "/")
				return fn(rel, info, err)
			})
		},
		Open: func(p string) (File, error) {
			tr.mu.Lock()
			tr.opens++
			tr.mu.Unlock()
			return os.Open(filepath.Join(tr.root, filepath.FromSlash(p)))
		},
		Cache: c,
	}
}

type memCache struct{ m map[string]Entry }

func (c *memCache) Lookup(paths []string) (map[string]Entry, error) {
	out := map[string]Entry{}
	for _, p := range paths {
		if e, ok := c.m[p]; ok {
			out[p] = e
		}
	}
	return out, nil
}

func (c *memCache) Store(entries map[string]Entry) error {
	for p, e := range entries {
		c.m[p] = e
	}
	return nil
}

func blob(n int, seed byte) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(i*31) ^ seed
	}
	return b
}

func paths(g Group) string {
	var out []string
	for _, f := range g.Files {
		out = append(out, f.Path)
	}
	return strings.Join(out, ",")
}

func TestScanFindsIdenticalContentUnderDifferentNames(t *testing.T) {
	tr := newTree(t)
	big := blob(300_000, 1)
	tr.put("Music/a.flac", big)
	tr.put("Backup/copy of a.flac", big)
	tr.put("Backup/old/a (2).flac", big)
	// Same size, same edges, different middle: only the full hash tells.
	middle := bytes.Clone(big)
	middle[150_000] ^= 0xff
	tr.put("Music/almost.flac", middle)
	// Same size, different content at the start.
	tr.put("Music/other.flac", blob(300_000, 9))
	small := blob(2000, 3)
	tr.put("Docs/x.txt", small)
	tr.put("Docs/y.txt", small)
	tr.put("Docs/tiny.txt", small[:10]) // under the minimum

	res, err := tr.scanner(nil).Scan(context.Background(), "/", Options{MinSize: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 2 {
		t.Fatalf("groups = %+v", res.Groups)
	}
	if got := paths(res.Groups[0]); got != "/Backup/copy of a.flac,/Backup/old/a (2).flac,/Music/a.flac" {
		t.Errorf("first group = %s", got)
	}
	if got := paths(res.Groups[1]); got != "/Docs/x.txt,/Docs/y.txt" {
		t.Errorf("second group = %s", got)
	}
	if res.Reclaimable != 2*300_000+2000 || res.FilesSeen != 8 {
		t.Errorf("reclaimable %d, seen %d", res.Reclaimable, res.FilesSeen)
	}
}

func TestScanOptions(t *testing.T) {
	tr := newTree(t)
	d := blob(5000, 7)
	tr.put("keep/a.bin", d)
	tr.put("keep/b.bin", d)
	tr.put(".hidden/c.bin", d)
	tr.put("keep/.d.bin", d)
	tr.put("skip/e.bin", d)
	tr.put("private/f.bin", d)
	tr.put(".trash/g.bin", d)

	opts := Options{
		MinSize: 1,
		Exclude: []string{" /skip "},
		Allowed: func(p string) bool { return !strings.HasPrefix(p, "/private") },
		SkipDir: func(name string) bool { return name == ".trash" },
	}
	s := tr.scanner(nil)
	res, err := s.Scan(context.Background(), "/", opts)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 1 || paths(res.Groups[0]) != "/keep/a.bin,/keep/b.bin" {
		t.Fatalf("groups = %+v", res.Groups)
	}
	opts.IncludeHidden = true
	res, _ = s.Scan(context.Background(), "/", opts)
	if got := paths(res.Groups[0]); got != "/.hidden/c.bin,/keep/.d.bin,/keep/a.bin,/keep/b.bin" {
		t.Errorf("with hidden = %s", got)
	}
	if p := s.Progress(); p.Phase != "done" || p.Hashed != p.Candidates {
		t.Errorf("progress = %+v", p)
	}
	// The default minimum (1 MB) leaves these small files alone.
	res, _ = s.Scan(context.Background(), "/", Options{})
	if len(res.Groups) != 0 {
		t.Errorf("default min size found %+v", res.Groups)
	}
}

func TestScanUsesTheCache(t *testing.T) {
	tr := newTree(t)
	big := blob(400_000, 5)
	tr.put("a.bin", big)
	tr.put("b.bin", big)
	cache := &memCache{m: map[string]Entry{}}
	s := tr.scanner(cache)
	if _, err := s.Scan(context.Background(), "/", Options{MinSize: 1}); err != nil {
		t.Fatal(err)
	}
	if tr.opens != 4 || cache.m["/a.bin"].Full == "" {
		t.Fatalf("first scan: %d opens, cache %+v", tr.opens, cache.m)
	}
	res, _ := s.Scan(context.Background(), "/", Options{MinSize: 1})
	if tr.opens != 4 || len(res.Groups) != 1 {
		t.Errorf("cached re-scan opened files: %d", tr.opens)
	}
	if s.Progress().BytesRead != 0 {
		t.Errorf("re-scan read %d bytes", s.Progress().BytesRead)
	}

	// A changed file (new mtime) is hashed again and no longer matches.
	changed := bytes.Clone(big)
	changed[200_000] ^= 1
	tr.put("b.bin", changed)
	later := time.Now().Add(time.Minute)
	_ = os.Chtimes(filepath.Join(tr.root, "b.bin"), later, later)
	res, _ = s.Scan(context.Background(), "/", Options{MinSize: 1})
	if len(res.Groups) != 0 {
		t.Errorf("stale cache entry trusted: %+v", res.Groups)
	}
}

func TestScanCancel(t *testing.T) {
	tr := newTree(t)
	tr.put("a.bin", blob(10, 1))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := tr.scanner(nil).Scan(ctx, "/", Options{MinSize: 1}); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v", err)
	}
}

// A 10,000-file synthetic tree: most sizes are unique, so very little is
// read. Logged for timing; fails only if it's pathologically slow.
func TestScanSyntheticTree(t *testing.T) {
	if testing.Short() {
		t.Skip("synthetic tree")
	}
	tr := newTree(t)
	for i := range 10_000 {
		size := 1000 + i // unique sizes...
		if i%100 == 0 {
			size = 50_000 // ...except 100 files that are identical
		}
		data := blob(size, byte(i))
		if size == 50_000 {
			data = blob(size, 0)
		}
		tr.put(fmt.Sprintf("d%02d/f%05d.bin", i%50, i), data)
	}
	s := tr.scanner(nil)
	start := time.Now()
	res, err := s.Scan(context.Background(), "/", Options{MinSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	took := time.Since(start)
	t.Logf("10,000 files scanned in %v, read %d bytes", took, s.Progress().BytesRead)
	if len(res.Groups) != 1 || len(res.Groups[0].Files) != 100 {
		t.Fatalf("groups = %d", len(res.Groups))
	}
	if s.Progress().BytesRead != 100*50_000 {
		t.Errorf("read %d bytes; only the 100 same-size files should be read", s.Progress().BytesRead)
	}
	if took > 30*time.Second {
		t.Errorf("too slow: %v", took)
	}
}
