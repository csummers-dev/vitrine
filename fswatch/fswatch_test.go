package fswatch

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"
)

// fakeBackend records watches and lets a test inject raw events.
type fakeBackend struct {
	mu      sync.Mutex
	watched map[string]bool
	limit   int // Add fails with ErrWatchLimit beyond this many (0 = none)
	events  chan RawEvent
	errs    chan error
	closed  bool
}

func newFake(limit int) *fakeBackend {
	return &fakeBackend{
		watched: map[string]bool{},
		limit:   limit,
		events:  make(chan RawEvent, 64),
		errs:    make(chan error, 1),
	}
}

func (f *fakeBackend) Add(dir string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.limit > 0 && len(f.watched) >= f.limit {
		return errors.Join(ErrWatchLimit, errors.New("no space left on device"))
	}
	f.watched[dir] = true
	return nil
}

func (f *fakeBackend) Remove(dir string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.watched, dir)
	return nil
}

func (f *fakeBackend) Events() <-chan RawEvent { return f.events }
func (f *fakeBackend) Errors() <-chan error    { return f.errs }
func (f *fakeBackend) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}

func (f *fakeBackend) isWatched(dir string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.watched[dir]
}

// collector gathers Changes from OnChange.
type collector struct {
	mu  sync.Mutex
	got []Change
}

func (c *collector) add(ch Change) {
	c.mu.Lock()
	c.got = append(c.got, ch)
	c.mu.Unlock()
}

func (c *collector) snapshot() []Change {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]Change(nil), c.got...)
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met before deadline")
}

func mkdirs(t *testing.T, root string, dirs ...string) {
	t.Helper()
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
}

func start(t *testing.T, root string, b *fakeBackend, opts ...func(*Options)) (*Watcher, *collector) {
	t.Helper()
	c := &collector{}
	o := Options{
		Root:         root,
		OnChange:     c.add,
		NewBackend:   func() (Backend, error) { return b, nil },
		Debounce:     20 * time.Millisecond,
		MaxDelay:     200 * time.Millisecond,
		PollInterval: 30 * time.Millisecond,
	}
	for _, f := range opts {
		f(&o)
	}
	w, err := New(o)
	if err != nil {
		t.Fatal(err)
	}
	w.Start()
	t.Cleanup(w.Close)
	return w, c
}

func TestParseMode(t *testing.T) {
	for in, want := range map[string]Mode{"": ModeAuto, "AUTO": ModeAuto, " poll ": ModePoll, "off": ModeOff} {
		if got, err := ParseMode(in); err != nil || got != want {
			t.Errorf("ParseMode(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	if _, err := ParseMode("sometimes"); err == nil {
		t.Error("ParseMode accepted an unknown mode")
	}
}

func TestWatchesEveryFolderButTrash(t *testing.T) {
	root := t.TempDir()
	mkdirs(t, root, "Movies/2024", "Music", ".trash/x", "Music/.trash")
	b := newFake(0)
	w, _ := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 4 })
	for _, d := range []string{"", "Movies", "Movies/2024", "Music"} {
		if !b.isWatched(filepath.Join(root, d)) {
			t.Errorf("%q not watched", d)
		}
	}
	if b.isWatched(filepath.Join(root, ".trash")) || b.isWatched(filepath.Join(root, "Music/.trash")) {
		t.Error("trash folders must not be watched")
	}
	if s := w.Status(); s.Mode != ModeAuto || s.Polling {
		t.Errorf("status = %+v, want auto without polling", s)
	}
}

func TestCoalescesABurstPerFolder(t *testing.T) {
	root := t.TempDir()
	mkdirs(t, root, "Movies", "Music")
	b := newFake(0)
	w, c := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 3 })

	for i := 0; i < 1000; i++ {
		b.events <- RawEvent{Path: filepath.Join(root, "Movies", "a.mkv"), Op: OpWrite}
	}
	b.events <- RawEvent{Path: filepath.Join(root, "Movies", "b.mkv"), Op: OpCreate}
	b.events <- RawEvent{Path: filepath.Join(root, "Music", "x.flac"), Op: OpRemove}
	b.events <- RawEvent{Path: filepath.Join(root, "Music", "y.flac"), Op: OpChmod}

	waitFor(t, func() bool { return len(c.snapshot()) == 2 })
	time.Sleep(60 * time.Millisecond) // nothing more should arrive
	want := []Change{
		{Dir: "/Movies", Names: []string{"a.mkv", "b.mkv"}},
		{Dir: "/Music", Names: []string{"x.flac"}},
	}
	if got := c.snapshot(); !reflect.DeepEqual(got, want) {
		t.Errorf("changes = %+v, want %+v", got, want)
	}
}

func TestBusyFolderReportsAtMaxDelay(t *testing.T) {
	root := t.TempDir()
	b := newFake(0)
	w, c := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 1 })

	// Writes every 5ms never leave a 20ms quiet gap; MaxDelay (200ms) must
	// still report the folder.
	stop := time.After(500 * time.Millisecond)
	tick := time.NewTicker(5 * time.Millisecond)
	defer tick.Stop()
	for loop := true; loop; {
		select {
		case <-stop:
			loop = false
		case <-tick.C:
			b.events <- RawEvent{Path: filepath.Join(root, "dl.part"), Op: OpWrite}
		}
	}
	if n := len(c.snapshot()); n < 2 || n > 4 {
		t.Errorf("got %d reports over 500ms of continuous writes, want 2 to 4", n)
	}
}

func TestNewFolderIsWatchedAndReportedWhole(t *testing.T) {
	root := t.TempDir()
	b := newFake(0)
	w, c := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 1 })

	mkdirs(t, root, "New/Inner")
	b.events <- RawEvent{Path: filepath.Join(root, "New"), Op: OpCreate}
	waitFor(t, func() bool { return len(c.snapshot()) == 2 })
	if !b.isWatched(filepath.Join(root, "New", "Inner")) {
		t.Error("a new folder's subfolders must be watched")
	}
	got := c.snapshot()
	want := []Change{{Dir: "/", Names: []string{"New"}}, {Dir: "/New"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("changes = %+v, want %+v", got, want)
	}
}

func TestRemovedFolderDropsItsWatches(t *testing.T) {
	root := t.TempDir()
	mkdirs(t, root, "Old/Sub")
	b := newFake(0)
	w, c := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 3 })

	b.events <- RawEvent{Path: filepath.Join(root, "Old"), Op: OpRename}
	waitFor(t, func() bool { return len(c.snapshot()) == 1 })
	if b.isWatched(filepath.Join(root, "Old")) || b.isWatched(filepath.Join(root, "Old", "Sub")) {
		t.Error("watches under a renamed folder must be dropped")
	}
	if w.Status().Watched != 1 {
		t.Errorf("watched = %d, want 1", w.Status().Watched)
	}
}

func TestIgnoresTrashAndOutsidePaths(t *testing.T) {
	root := t.TempDir()
	b := newFake(0)
	w, c := start(t, root, b)
	waitFor(t, func() bool { return w.Status().Watched == 1 })
	b.events <- RawEvent{Path: filepath.Join(root, ".trash", "abc"), Op: OpCreate}
	b.events <- RawEvent{Path: filepath.Join(filepath.Dir(root), "elsewhere"), Op: OpCreate}
	time.Sleep(80 * time.Millisecond)
	if got := c.snapshot(); len(got) != 0 {
		t.Errorf("changes = %+v, want none", got)
	}
}

func TestWatchLimitFallsBackToPolling(t *testing.T) {
	root := t.TempDir()
	mkdirs(t, root, "a", "b", "c")
	b := newFake(2)
	var logged []string
	var mu sync.Mutex
	w, c := start(t, root, b, func(o *Options) {
		o.Logf = func(f string, _ ...any) {
			mu.Lock()
			logged = append(logged, f)
			mu.Unlock()
		}
	})
	waitFor(t, func() bool { return w.Status().Polling })
	s := w.Status()
	if !s.LimitHit || s.Mode != ModePoll || s.Watched != 0 {
		t.Errorf("status = %+v, want polling after the watch limit", s)
	}
	mu.Lock()
	if len(logged) == 0 {
		t.Error("hitting the watch limit should be logged with the fix")
	}
	mu.Unlock()

	// Polling still notices a new folder.
	time.Sleep(50 * time.Millisecond) // let the baseline scan finish
	mkdirs(t, root, "b/new")
	waitFor(t, func() bool {
		for _, ch := range c.snapshot() {
			if ch.Dir == "/b" {
				return true
			}
		}
		return false
	})
}

func TestPollModeAndOffMode(t *testing.T) {
	root := t.TempDir()
	b := newFake(0)
	w, _ := start(t, root, b, func(o *Options) { o.Mode = ModePoll })
	waitFor(t, func() bool { return w.Status().Polling })
	if len(b.watched) != 0 {
		t.Error("poll mode must not create OS watches")
	}

	off, c := start(t, root, b, func(o *Options) { o.Mode = ModeOff })
	if off.Status().Mode != ModeOff {
		t.Errorf("mode = %q, want off", off.Status().Mode)
	}
	mkdirs(t, root, "x")
	time.Sleep(80 * time.Millisecond)
	if len(c.snapshot()) != 0 {
		t.Error("off mode must report nothing")
	}
}

func TestDiffScans(t *testing.T) {
	t0 := time.Unix(100, 0)
	t1 := time.Unix(200, 0)
	prev := map[string]time.Time{"/": t0, "/a": t0, "/a/old": t0, "/b": t0}
	next := map[string]time.Time{"/": t0, "/a": t0, "/b": t1, "/b/new": t1}
	got := diffScans(prev, next)
	want := []Change{{Dir: "/a"}, {Dir: "/b"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("diffScans = %+v, want %+v", got, want)
	}
}

func TestForUsers(t *testing.T) {
	users := []UserScope{{1, "."}, {2, "alice"}, {3, "/bob/"}, {4, "/alice/music"}}
	got := ForUsers(Change{Dir: "/alice/music", Names: []string{"a.flac"}}, users)
	want := []UserChange{
		{UserID: 1, Change: Change{Dir: "/alice/music", Names: []string{"a.flac"}}},
		{UserID: 2, Change: Change{Dir: "/music", Names: []string{"a.flac"}}},
		{UserID: 4, Change: Change{Dir: "/", Names: []string{"a.flac"}}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ForUsers = %+v, want %+v", got, want)
	}
	// A sibling with a shared prefix is not inside the scope.
	if got := ForUsers(Change{Dir: "/alice2"}, []UserScope{{2, "/alice"}}); len(got) != 0 {
		t.Errorf("ForUsers matched a prefix sibling: %+v", got)
	}
	// The scope folder's own entry in its parent is not the user's business.
	if got := ForUsers(Change{Dir: "/", Names: []string{"alice"}}, []UserScope{{2, "/alice"}}); len(got) != 0 {
		t.Errorf("ForUsers reported a change above the scope: %+v", got)
	}
}
