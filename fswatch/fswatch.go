// Package fswatch notices changes to the served file tree, whoever makes
// them — vitrine itself, a downloader, an SMB client or the host shell — and
// reports them as coalesced, per-directory Changes (4.0 Phase 2.1).
//
// Design:
//   - A Backend (fsnotify in production, a fake in tests) delivers raw
//     per-path events. Linux inotify is not recursive, so the Watcher adds a
//     watch for every directory at startup and for every directory created
//     later, and drops watches for directories that go away.
//   - Raw events are coalesced per directory: a directory's Change is emitted
//     once it has been quiet for Debounce, or MaxDelay after its first event
//     even if writes continue (a long download reports every MaxDelay rather
//     than never).
//   - If the OS watch limit is hit (inotify's max_user_watches) or no backend
//     can be created, the Watcher falls back to polling directory mtimes every
//     PollInterval. Polling also suits network mounts, where inotify never
//     sees changes made by other machines. Mode "poll" forces it.
//   - Directory mtimes change when a child is added, removed or renamed, not
//     when a file's contents change, so polling reports structure changes
//     only. Names are nil for polled changes ("something in Dir changed").
//
// The Watcher knows nothing about users; scope.go maps root-relative Changes
// onto each user's scope.
package fswatch

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Op is a bit set of raw filesystem operations.
type Op uint8

// Raw operations a Backend reports.
const (
	OpCreate Op = 1 << iota
	OpWrite
	OpRemove
	OpRename
	OpChmod
)

// RawEvent is one backend notification for an absolute path.
type RawEvent struct {
	Path string
	Op   Op
}

// Backend is the OS notification source. Implementations must be safe for
// Add/Remove to be called from the goroutine that reads Events.
type Backend interface {
	Add(dir string) error
	Remove(dir string) error
	Events() <-chan RawEvent
	Errors() <-chan error
	Close() error
}

// ErrWatchLimit is returned (wrapped) by Backend.Add when the OS refuses more
// watches, e.g. inotify's fs.inotify.max_user_watches.
var ErrWatchLimit = errors.New("fswatch: operating system watch limit reached")

// Mode selects how changes are detected.
type Mode string

// Modes accepted by the fileWatching setting.
const (
	ModeAuto Mode = "auto" // OS notifications, falling back to polling
	ModePoll Mode = "poll" // poll directory mtimes only
	ModeOff  Mode = "off"  // disabled
)

// ParseMode validates a fileWatching setting value ("" means auto).
func ParseMode(s string) (Mode, error) {
	switch Mode(strings.ToLower(strings.TrimSpace(s))) {
	case "", ModeAuto:
		return ModeAuto, nil
	case ModePoll:
		return ModePoll, nil
	case ModeOff:
		return ModeOff, nil
	}
	return "", fmt.Errorf("fswatch: unknown mode %q (want auto, poll or off)", s)
}

// Change reports that entries in Dir changed. Dir is root-relative with a
// leading "/" ("/" is the root). Names lists the affected entries, sorted;
// nil means unknown (refresh the whole directory).
type Change struct {
	Dir   string
	Names []string
}

// Options configure a Watcher. Root and OnChange are required.
type Options struct {
	Root     string
	Mode     Mode
	OnChange func(Change)

	// NewBackend creates the OS notification source. Nil means polling only.
	NewBackend func() (Backend, error)
	// Skip reports whether a root-relative path should be ignored. Nil skips
	// trash directories (DefaultSkip).
	Skip func(rel string) bool

	Debounce     time.Duration // quiet period before a directory reports (500ms)
	MaxDelay     time.Duration // longest a busy directory waits (10s)
	PollInterval time.Duration // polling period (60s)
	Logf         func(format string, args ...any)
}

// TrashDirname mirrors trash.Dirname; duplicated to keep this package free of
// project dependencies.
const TrashDirname = ".trash"

// DefaultSkip ignores the trash directories vitrine keeps inside the tree.
func DefaultSkip(rel string) bool {
	for _, part := range strings.Split(rel, "/") {
		if part == TrashDirname {
			return true
		}
	}
	return false
}

// Status describes what the Watcher is doing, for logs and the settings UI.
type Status struct {
	Mode     Mode // the mode actually in effect
	Watched  int  // directories with an OS watch
	Polling  bool
	LimitHit bool // fell back to polling because of the OS watch limit
}

// Watcher watches one root. Create with New, then Start; Close stops it.
type Watcher struct {
	opts Options
	root string

	mu      sync.Mutex
	status  Status
	watched map[string]struct{} // absolute dirs with a backend watch
	pending map[string]*pendingDir

	done chan struct{}
	wg   sync.WaitGroup
	once sync.Once
}

type pendingDir struct {
	names map[string]struct{}
	first time.Time
	last  time.Time
	whole bool // a change with unknown names: report Names nil
}

// New validates options and builds a Watcher; it does not start watching.
func New(o Options) (*Watcher, error) {
	if o.Root == "" || o.OnChange == nil {
		return nil, errors.New("fswatch: Root and OnChange are required")
	}
	root, err := filepath.Abs(o.Root)
	if err != nil {
		return nil, err
	}
	if o.Mode == "" {
		o.Mode = ModeAuto
	}
	if o.Skip == nil {
		o.Skip = DefaultSkip
	}
	if o.Debounce <= 0 {
		o.Debounce = 500 * time.Millisecond
	}
	if o.MaxDelay <= 0 {
		o.MaxDelay = 10 * time.Second
	}
	if o.PollInterval <= 0 {
		o.PollInterval = 60 * time.Second
	}
	if o.Logf == nil {
		o.Logf = func(string, ...any) {}
	}
	return &Watcher{
		opts:    o,
		root:    root,
		watched: map[string]struct{}{},
		pending: map[string]*pendingDir{},
		done:    make(chan struct{}),
	}, nil
}

// Start begins watching in the background. Arming watches on a large tree
// takes a while; changes made meanwhile may be missed.
func (w *Watcher) Start() {
	if w.opts.Mode == ModeOff {
		w.setStatus(func(s *Status) { s.Mode = ModeOff })
		return
	}
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.run()
	}()
}

// Close stops watching and waits for the background goroutine. Idempotent.
func (w *Watcher) Close() {
	w.once.Do(func() { close(w.done) })
	w.wg.Wait()
}

// Status returns a snapshot of the Watcher's state.
func (w *Watcher) Status() Status {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.status
}

func (w *Watcher) setStatus(f func(*Status)) {
	w.mu.Lock()
	f(&w.status)
	w.mu.Unlock()
}

func (w *Watcher) run() {
	if w.opts.Mode == ModeAuto && w.opts.NewBackend != nil {
		b, err := w.opts.NewBackend()
		if err != nil {
			w.opts.Logf("fswatch: file notifications unavailable (%v); polling every %s instead", err, w.opts.PollInterval)
		} else if w.arm(b) {
			w.setStatus(func(s *Status) { s.Mode = ModeAuto })
			w.notifyLoop(b)
			return
		}
	}
	w.setStatus(func(s *Status) {
		s.Mode = ModePoll
		s.Polling = true
	})
	w.pollLoop()
}

// arm adds a watch for every directory. It returns false (and closes b) if
// the OS watch limit was hit, so the caller can fall back to polling.
func (w *Watcher) arm(b Backend) bool {
	err := w.addTree(b, w.root)
	if errors.Is(err, ErrWatchLimit) {
		_ = b.Close()
		w.mu.Lock()
		n := len(w.watched)
		w.watched = map[string]struct{}{}
		w.status.LimitHit = true
		w.status.Watched = 0
		w.mu.Unlock()
		w.opts.Logf("fswatch: hit the OS file-watch limit after %d folders; polling every %s instead. "+
			"Raise it on the host (e.g. sysctl fs.inotify.max_user_watches=524288) for instant updates.",
			n, w.opts.PollInterval)
		return false
	}
	if err != nil {
		w.opts.Logf("fswatch: %v", err)
	}
	return true
}

// addTree watches dir and every directory below it, skipping Skip'd paths.
func (w *Watcher) addTree(b Backend, dir string) error {
	return filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			// Unreadable subtree: skip it, keep going.
			if d != nil && d.IsDir() && p != dir {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		rel, ok := w.rel(p)
		if !ok {
			return filepath.SkipDir
		}
		if rel != "/" && w.opts.Skip(rel) {
			return filepath.SkipDir
		}
		if err := b.Add(p); err != nil {
			if errors.Is(err, ErrWatchLimit) {
				return err
			}
			w.opts.Logf("fswatch: watch %s: %v", rel, err)
			return nil
		}
		w.mu.Lock()
		w.watched[p] = struct{}{}
		w.status.Watched = len(w.watched)
		w.mu.Unlock()
		return nil
	})
}

// unwatchTree drops watches for dir and everything below it.
func (w *Watcher) unwatchTree(b Backend, dir string) {
	w.mu.Lock()
	var gone []string
	for p := range w.watched {
		if p == dir || strings.HasPrefix(p, dir+string(filepath.Separator)) {
			gone = append(gone, p)
			delete(w.watched, p)
		}
	}
	w.status.Watched = len(w.watched)
	w.mu.Unlock()
	for _, p := range gone {
		_ = b.Remove(p) // inotify already dropped watches on deleted dirs
	}
}

func (w *Watcher) notifyLoop(b Backend) {
	defer b.Close()
	tick := time.NewTicker(w.flushEvery())
	defer tick.Stop()
	for {
		select {
		case <-w.done:
			w.flush(true)
			return
		case ev, ok := <-b.Events():
			if !ok {
				return
			}
			w.handle(b, ev)
		case err, ok := <-b.Errors():
			if !ok {
				return
			}
			w.opts.Logf("fswatch: %v", err)
		case <-tick.C:
			w.flush(false)
		}
	}
}

func (w *Watcher) flushEvery() time.Duration {
	d := w.opts.Debounce / 2
	if d < 5*time.Millisecond {
		d = 5 * time.Millisecond
	}
	return d
}

func (w *Watcher) handle(b Backend, ev RawEvent) {
	if ev.Op == OpChmod {
		return // permission/attribute changes don't alter a listing
	}
	rel, ok := w.rel(ev.Path)
	if !ok || rel == "/" || w.opts.Skip(rel) {
		return
	}
	if ev.Op&OpCreate != 0 {
		if fi, err := os.Stat(ev.Path); err == nil && fi.IsDir() {
			if err := w.addTree(b, ev.Path); errors.Is(err, ErrWatchLimit) {
				w.setStatus(func(s *Status) { s.LimitHit = true })
				w.opts.Logf("fswatch: OS file-watch limit reached; changes inside %s won't be seen until restart or a higher limit", rel)
			}
			// Entries created in the new folder before its watch existed
			// were missed: report the folder itself as wholly changed.
			w.mark(rel, "", true)
		}
	}
	if ev.Op&(OpRemove|OpRename) != 0 {
		w.mu.Lock()
		_, wasDir := w.watched[ev.Path]
		w.mu.Unlock()
		if wasDir {
			w.unwatchTree(b, ev.Path)
		}
	}
	w.mark(path.Dir(rel), path.Base(rel), false)
}

// mark records a pending change to name in dir (or the whole dir).
func (w *Watcher) mark(dir, name string, whole bool) {
	now := time.Now()
	w.mu.Lock()
	defer w.mu.Unlock()
	p := w.pending[dir]
	if p == nil {
		p = &pendingDir{names: map[string]struct{}{}, first: now}
		w.pending[dir] = p
	}
	p.last = now
	if whole {
		p.whole = true
	} else if name != "" {
		p.names[name] = struct{}{}
	}
}

// flush emits Changes for directories that are quiet or overdue (or all of
// them when force is set).
func (w *Watcher) flush(force bool) {
	now := time.Now()
	var out []Change
	w.mu.Lock()
	for dir, p := range w.pending {
		if !force && now.Sub(p.last) < w.opts.Debounce && now.Sub(p.first) < w.opts.MaxDelay {
			continue
		}
		c := Change{Dir: dir}
		if !p.whole {
			for n := range p.names {
				c.Names = append(c.Names, n)
			}
			sort.Strings(c.Names)
		}
		out = append(out, c)
		delete(w.pending, dir)
	}
	w.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Dir < out[j].Dir })
	for _, c := range out {
		w.opts.OnChange(c)
	}
}

// rel converts an absolute path to a root-relative "/a/b" path. ok is false
// for paths outside the root.
func (w *Watcher) rel(abs string) (string, bool) {
	r, err := filepath.Rel(w.root, abs)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", false
	}
	if r == "." {
		return "/", true
	}
	return "/" + filepath.ToSlash(r), true
}
