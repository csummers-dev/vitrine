// Package searchindex keeps an in-memory name+path index per user so search
// answers from memory instead of walking the filesystem on every keystroke
// (2.4.0 Stage 5 / H). The live FS walk (search.Search) remains the fallback
// while an index is still building, and the ground truth each index is built
// from.
//
// Design:
//   - Per-user (keyed by the event bus's Base.UserID, which is exactly the
//     namespace file events carry, so freshness wiring lines up). Two users who
//     share an underlying scope each keep their own index — fine for the
//     single-admin homelab this targets; the documented backstop is the manual
//     rebuild action.
//   - Lazily built on first search, in the background; until ready, the caller
//     falls back to the live walk (Search returns served=false).
//   - Kept fresh by the events bus: any file event schedules a DEBOUNCED full
//     rebuild of that user's index (coalescing a burst — e.g. a big copy's many
//     events — into one walk). A full rebuild is always exactly correct, which
//     is worth more than incremental-update cleverness; reads never walk, and
//     writes are far rarer than searches.
//   - `.trash` is skipped (never searchable); dotfile visibility is left to the
//     per-request rules Checker at query time, so index results match the live
//     walk exactly.
package searchindex

import (
	"context"
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/rules"
	"github.com/csummers-dev/vitrine/v4/search"
	"github.com/csummers-dev/vitrine/v4/trash"
)

const (
	// rebuildDebounce is how long after the last file event a user's index waits
	// before rebuilding, so a burst of changes triggers a single walk.
	rebuildDebounce = 1500 * time.Millisecond

	// defaultMaxEntries bounds an index's memory footprint (2.4.0 Stage 6). A
	// tree larger than this abandons the index and permanently falls back to the
	// live FS walk for that user — slower, but never an OOM, and no worse than
	// the pre-index behavior. A million entries is a high ceiling a normal media
	// library won't hit; it only guards a pathological tree.
	defaultMaxEntries = 1_000_000

	// DefaultMaxAge is how old an index may get before a search triggers a
	// background rebuild. Events keep the index fresh for changes made through
	// vitrine; this catches changes made outside it (downloaders, SMB copies,
	// the host shell), which publish no events.
	DefaultMaxAge = 10 * time.Minute
)

// incrementalMaxNames is the largest named change applied in place; bigger
// bursts get one debounced full rebuild instead.
const incrementalMaxNames = 100

// errIndexTooBig stops the build walk once the entry cap is exceeded.
var errIndexTooBig = errors.New("searchindex: tree exceeds the index cap")

type shard struct {
	mu        sync.RWMutex
	entries   map[string]bool // path (fs-rooted, leading "/") → isDir
	ready     bool
	builtAt   time.Time // when entries were last swapped in
	building  bool
	oversized bool        // tree exceeded the cap → permanent live-walk fallback
	fs        afero.Fs    // captured from the user's last search, for rebuilds
	timer     *time.Timer // debounce timer for an events-driven rebuild
}

// Index is the per-server search index. Construct with New; release the events
// subscription with Close.
type Index struct {
	mu          sync.Mutex
	byUser      map[uint]*shard
	now         func() time.Time
	debounce    time.Duration
	maxEntries  int
	maxAge      time.Duration // 0 = never rebuild because of age
	unsubscribe func()
}

// New builds an index wired to the events bus for debounced rebuilds.
func New() *Index {
	ix := &Index{
		byUser:     map[uint]*shard{},
		now:        time.Now,
		debounce:   rebuildDebounce,
		maxEntries: defaultMaxEntries,
		maxAge:     DefaultMaxAge,
	}
	ix.unsubscribe = events.Subscribe(ix.onEvent)
	return ix
}

// SetMaxAge sets how old an index may get before the next search rebuilds it
// in the background (stale results are still served meanwhile). Zero disables
// age-based rebuilds. Call before serving requests.
func (ix *Index) SetMaxAge(d time.Duration) {
	ix.mu.Lock()
	ix.maxAge = d
	ix.mu.Unlock()
}

// Close drops the events subscription. Safe to call once.
func (ix *Index) Close() {
	if ix.unsubscribe != nil {
		ix.unsubscribe()
		ix.unsubscribe = nil
	}
}

func (ix *Index) shardFor(userID uint, create bool) *shard {
	ix.mu.Lock()
	defer ix.mu.Unlock()
	s := ix.byUser[userID]
	if s == nil && create {
		s = &shard{}
		ix.byUser[userID] = s
	}
	return s
}

// Search answers query for userID over scope, calling found(relPath, isDir) for
// each hit. It returns served=true when the index served the request, or
// served=false when the index isn't ready yet — in which case it kicks off a
// background build and the caller should fall back to the live walk
// (search.Search). fs is captured so events can rebuild later.
func (ix *Index) Search(
	ctx context.Context, userID uint, fs afero.Fs, scope, query string,
	checker rules.Checker, found func(relPath string, isDir bool) error,
) (served bool, err error) {
	s := ix.shardFor(userID, true)
	maxAge := ix.getMaxAge()

	s.mu.Lock()
	s.fs = fs
	ready := s.ready
	building := s.building
	oversized := s.oversized
	// Only kick off a build for a cold shard that isn't already building and
	// hasn't been ruled too big — an oversized tree stays on the live walk.
	if !ready && !building && !oversized {
		s.building = true
	}
	// A ready but stale index answers this search as-is and refreshes in the
	// background, so out-of-band changes show up on a later search.
	stale := ready && !building && maxAge > 0 && ix.now().Sub(s.builtAt) > maxAge
	if stale {
		s.building = true
	}
	s.mu.Unlock()

	if stale {
		go ix.build(userID, fs)
	}

	if !ready {
		if !building && !oversized {
			go ix.build(userID, fs)
		}
		return false, nil // caller falls back to the live walk
	}

	matcher := search.NewMatcher(query)
	cleanScope := path.Join("/", filepath.ToSlash(filepath.Clean(scope)))

	s.mu.RLock()
	defer s.mu.RUnlock()
	for p, isDir := range s.entries {
		if ctx.Err() != nil {
			return true, ctx.Err()
		}
		rel, ok := underScope(p, cleanScope)
		if !ok {
			continue
		}
		if !checker.Check(p) {
			continue
		}
		if !matcher.Match(p, path.Base(p)) {
			continue
		}
		if e := found(rel, isDir); e != nil {
			return true, e
		}
	}
	return true, nil
}

// Rebuild forces an immediate, synchronous rebuild of userID's index from fs —
// the manual "rebuild search index" action. Safe to call before any search.
func (ix *Index) Rebuild(userID uint, fs afero.Fs) error {
	s := ix.shardFor(userID, true)
	s.mu.Lock()
	s.fs = fs
	s.mu.Unlock()
	return ix.buildSync(userID, fs)
}

// build is the async first-build path (sets/clears the building flag).
func (ix *Index) build(userID uint, fs afero.Fs) {
	_ = ix.buildSync(userID, fs)
	s := ix.shardFor(userID, true)
	s.mu.Lock()
	s.building = false
	s.mu.Unlock()
}

// buildSync walks fs into a fresh map and atomically swaps it in, so searches
// during a rebuild keep seeing the previous complete index (never a half-filled
// one).
func (ix *Index) buildSync(userID uint, fs afero.Fs) error {
	next := map[string]bool{}
	walkErr := afero.Walk(fs, "/", func(p string, f os.FileInfo, _ error) error {
		if f == nil {
			return nil
		}
		cp := path.Join("/", filepath.ToSlash(filepath.Clean(p)))
		if f.IsDir() && f.Name() == trash.Dirname {
			return filepath.SkipDir
		}
		if cp == "/" {
			return nil
		}
		next[cp] = f.IsDir()
		if len(next) > ix.maxEntries {
			return errIndexTooBig // bail; this tree won't be indexed
		}
		return nil
	})

	s := ix.shardFor(userID, true)
	s.mu.Lock()
	defer s.mu.Unlock()
	if errors.Is(walkErr, errIndexTooBig) {
		// Abandon the index for this user — search stays on the live walk.
		s.entries = nil
		s.ready = false
		s.oversized = true
		return nil
	}
	s.entries = next
	s.ready = true
	s.builtAt = ix.now()
	return walkErr
}

func (ix *Index) getMaxAge() time.Duration {
	ix.mu.Lock()
	defer ix.mu.Unlock()
	return ix.maxAge
}

func (ix *Index) onEvent(e events.Event) {
	// Watcher-reported changes that name their entries are applied in place,
	// so a busy library (a download landing every few seconds) doesn't
	// trigger a full re-walk each time. Unnamed or very large changes fall
	// through to the debounced full rebuild below.
	if fc, isFC := e.(events.FilesChanged); isFC && len(fc.Names) > 0 && len(fc.Names) <= incrementalMaxNames {
		go ix.applyIncremental(fc.UserID, fc.Dir, fc.Names)
		return
	}
	uid, ok := userOf(e)
	if !ok {
		return
	}
	s := ix.shardFor(uid, false)
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fs == nil || s.oversized || (!s.ready && !s.building) {
		// No captured fs (user never searched), the tree is too big to index, or
		// it isn't built yet — the next search builds fresh (or stays on the live
		// walk); nothing to debounce.
		return
	}
	fs := s.fs
	if s.timer != nil {
		s.timer.Reset(ix.debounce)
		return
	}
	s.timer = time.AfterFunc(ix.debounce, func() {
		_ = ix.buildSync(uid, fs)
	})
}

// underScope reports whether the fs-rooted path p lies within scope (excluding
// the scope directory itself), returning its scope-relative form on success.
func underScope(p, scope string) (rel string, ok bool) {
	if p == scope {
		return "", false
	}
	if scope == "/" {
		return strings.TrimPrefix(p, "/"), true
	}
	if strings.HasPrefix(p, scope+"/") {
		return strings.TrimPrefix(p, scope+"/"), true
	}
	return "", false
}

// userOf pulls the acting user id out of any file event the index cares about.
func userOf(e events.Event) (uint, bool) {
	switch v := e.(type) {
	case events.FileCreated:
		return v.UserID, true
	case events.FileDeleted:
		return v.UserID, true
	case events.FileUploaded:
		return v.UserID, true
	case events.FileModified:
		return v.UserID, true
	case events.FileRenamed:
		return v.UserID, true
	case events.FileMoved:
		return v.UserID, true
	case events.FileCopied:
		return v.UserID, true
	case events.FilesChanged:
		return v.UserID, true
	default:
		return 0, false
	}
}

// applyIncremental updates userID's ready index for entries named in dir:
// existing entries are (re)added, with a new folder's whole subtree, and
// missing ones are removed along with everything below them. Filesystem reads
// happen outside the shard lock.
func (ix *Index) applyIncremental(userID uint, dir string, names []string) {
	s := ix.shardFor(userID, false)
	if s == nil {
		return
	}
	s.mu.RLock()
	fs, ready, oversized := s.fs, s.ready, s.oversized
	s.mu.RUnlock()
	if fs == nil || !ready || oversized {
		return // not built yet (the next search builds fresh) or on the live walk
	}

	add := map[string]bool{}
	var remove []string
	for _, name := range names {
		p := path.Join("/", dir, name)
		if p == "/" || name == trash.Dirname {
			continue
		}
		info, err := fs.Stat(p)
		if err != nil {
			remove = append(remove, p)
			continue
		}
		add[p] = info.IsDir()
		if !info.IsDir() {
			continue
		}
		_ = afero.Walk(fs, p, func(sub string, f os.FileInfo, _ error) error {
			if f == nil || sub == p {
				return nil
			}
			if f.IsDir() && f.Name() == trash.Dirname {
				return filepath.SkipDir
			}
			add[path.Join("/", filepath.ToSlash(sub))] = f.IsDir()
			return nil
		})
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.ready || s.entries == nil {
		return
	}
	for _, p := range remove {
		delete(s.entries, p)
		prefix := p + "/"
		for k := range s.entries {
			if strings.HasPrefix(k, prefix) {
				delete(s.entries, k)
			}
		}
	}
	for p, isDir := range add {
		s.entries[p] = isDir
	}
	if len(s.entries) > ix.maxEntries {
		s.entries = nil
		s.ready = false
		s.oversized = true
	}
}
