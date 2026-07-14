// Package foldersize computes recursive directory sizes on demand and caches
// them, so the UI can show a folder's total size without re-walking the tree on
// every poll (2.4.0 Stage 4 / E).
//
// Caching strategy:
//   - Keyed by (userID, scope-relative path). The same path can map to different
//     real directories for differently-scoped users, and the events bus carries
//     (Base.UserID, path) in exactly this namespace — so invalidation lines up
//     with what the file handlers publish.
//   - An entry stores the size, the folder's mtime AT COMPUTE TIME, and a wall
//     clock stamp. On lookup the folder's CURRENT mtime is compared: a changed
//     mtime (a direct child added / removed / renamed) forces a recompute.
//   - A folder's mtime does NOT change when a DEEP descendant's content changes,
//     so the cache also subscribes to the events bus and, on any file event,
//     drops every ANCESTOR folder of the affected path for that user. This is the
//     primary freshness mechanism; the mtime check is a secondary guard for
//     out-of-band edits.
//   - A short TTL backstops anything the events miss (e.g. a change by a
//     different user who shares the same underlying scope).
//   - Concurrent computes for one key are de-duplicated with singleflight, so a
//     burst of requests for a big folder walks it once.
package foldersize

import (
	"errors"
	"io/fs"
	"path"
	"path/filepath"
	"strconv"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/spf13/afero"
	"golang.org/x/sync/singleflight"

	"github.com/csummers-dev/vitrine/v3/events"
	"github.com/csummers-dev/vitrine/v3/trash"
)

// ErrNotDir is returned by Size when the path exists but isn't a directory.
var ErrNotDir = errors.New("not a directory")

const (
	defaultMaxEntries = 4096
	defaultTTL        = 5 * time.Minute
)

type entry struct {
	size  int64
	mtime time.Time
	at    time.Time
}

// Cache is the per-server folder-size cache. Construct with New; release the
// events subscription with Close.
type Cache struct {
	lru         *lru.Cache[string, entry]
	sf          singleflight.Group
	ttl         time.Duration
	now         func() time.Time
	unsubscribe func()
}

// New builds a cache with default capacity + TTL and wires it to the events bus
// for ancestor invalidation.
func New() *Cache { return newWith(defaultMaxEntries, defaultTTL, time.Now) }

func newWith(maxEntries int, ttl time.Duration, now func() time.Time) *Cache {
	l, _ := lru.New[string, entry](maxEntries)
	c := &Cache{lru: l, ttl: ttl, now: now}
	c.unsubscribe = events.Subscribe(c.onEvent)
	return c
}

// Close drops the events subscription. Safe to call once; intended for tests +
// shutdown.
func (c *Cache) Close() {
	if c.unsubscribe != nil {
		c.unsubscribe()
		c.unsubscribe = nil
	}
}

func cacheKey(userID uint, p string) string {
	return strconv.FormatUint(uint64(userID), 10) + "\x00" + path.Clean("/"+p)
}

// Size returns the recursive total byte size of the directory at p in fs,
// computing + caching it on a miss or a stale entry. computedAt reports when the
// returned size was actually measured (so the UI can show "as of …").
func (c *Cache) Size(userID uint, afs afero.Fs, p string) (size int64, computedAt time.Time, err error) {
	clean := path.Clean("/" + p)
	info, err := afs.Stat(clean)
	if err != nil {
		return 0, time.Time{}, err
	}
	if !info.IsDir() {
		return 0, time.Time{}, ErrNotDir
	}
	curMtime := info.ModTime()
	k := cacheKey(userID, clean)

	if e, ok := c.lru.Get(k); ok {
		if e.mtime.Equal(curMtime) && c.now().Sub(e.at) < c.ttl {
			return e.size, e.at, nil
		}
	}

	v, err, _ := c.sf.Do(k, func() (any, error) {
		total, werr := dirSize(afs, clean)
		if werr != nil {
			return nil, werr
		}
		e := entry{size: total, mtime: curMtime, at: c.now()}
		c.lru.Add(k, e)
		return e, nil
	})
	if err != nil {
		return 0, time.Time{}, err
	}
	e := v.(entry)
	return e.size, e.at, nil
}

// dirSize sums the regular-file bytes under root, skipping the hidden per-volume
// recycle bin (.trash) so a reported size matches what the user can actually
// see, and best-effort skipping any entry it can't read rather than aborting the
// whole walk on one permission error.
func dirSize(afs afero.Fs, root string) (int64, error) {
	var total int64
	err := afero.Walk(afs, root, func(_ string, info fs.FileInfo, e error) error {
		if e != nil {
			if info != nil && info.IsDir() {
				return filepath.SkipDir
			}
			return nil //nolint:nilerr // best-effort: skip the unreadable entry
		}
		if info.IsDir() {
			if info.Name() == trash.Dirname {
				return filepath.SkipDir // never count the hidden recycle bin
			}
			return nil
		}
		if info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})
	return total, err
}

func (c *Cache) onEvent(e events.Event) {
	switch v := e.(type) {
	case events.FileCreated:
		c.invalidate(v.UserID, v.Path)
	case events.FileDeleted:
		c.invalidate(v.UserID, v.Path)
	case events.FileUploaded:
		c.invalidate(v.UserID, v.Path)
	case events.FileModified:
		c.invalidate(v.UserID, v.Path)
	case events.FileRenamed:
		c.invalidate(v.UserID, v.From)
		c.invalidate(v.UserID, v.To)
	case events.FileMoved:
		c.invalidate(v.UserID, v.From)
		c.invalidate(v.UserID, v.To)
	case events.FileCopied:
		// A copy leaves its source in place, so only the destination's ancestors
		// grew.
		c.invalidate(v.UserID, v.To)
	}
}

// invalidate drops the cached size of p and EVERY ancestor folder of p for the
// given user — a change to one file alters the total of every directory above it.
func (c *Cache) invalidate(userID uint, p string) {
	for _, anc := range ancestors(p) {
		c.lru.Remove(cacheKey(userID, anc))
	}
}

// ancestors returns p (cleaned) followed by each parent directory up to "/".
func ancestors(p string) []string {
	p = path.Clean("/" + p)
	out := []string{p}
	for p != "/" {
		p = path.Dir(p)
		out = append(out, p)
	}
	return out
}
