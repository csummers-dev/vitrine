package searchindex

import (
	"testing"
	"time"

	"github.com/spf13/afero"
)

// fakeClock is a settable clock for age-based rebuild tests.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

// waitFor polls cond until it holds or the deadline passes.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met before deadline")
}

func contains(paths []string, want string) bool {
	for _, p := range paths {
		if p == want {
			return true
		}
	}
	return false
}

// A file written straight to disk (no event) becomes searchable once the index
// is older than maxAge: the stale search still answers, and triggers a refresh.
func TestStaleIndexRebuildsInBackground(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1_000_000, 0)}
	ix := New()
	defer ix.Close()
	ix.now = clock.now
	ix.SetMaxAge(10 * time.Minute)

	fs := afero.NewMemMapFs()
	seed(t, fs, "/movies/old.mkv", "x")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}

	// Out-of-band change: no event is published.
	seed(t, fs, "/movies/new.mkv", "y")

	clock.t = clock.t.Add(5 * time.Minute)
	got, served := collect(t, ix, 1, fs, "/", "new")
	if !served || len(got) != 0 {
		t.Fatalf("fresh index: served=%v got=%v; want served from the old index with no hit", served, got)
	}
	if ix.shardFor(1, false).building {
		t.Fatal("an index younger than maxAge must not rebuild")
	}

	clock.t = clock.t.Add(6 * time.Minute) // now 11 minutes old
	got, served = collect(t, ix, 1, fs, "/", "new")
	if !served {
		t.Fatal("a stale index should still serve the search")
	}
	if contains(got, "movies/new.mkv") {
		t.Fatal("the stale search itself should answer from the old index")
	}

	s := ix.shardFor(1, false)
	waitFor(t, func() bool {
		s.mu.RLock()
		defer s.mu.RUnlock()
		return !s.building && s.builtAt.Equal(clock.t)
	})

	got, _ = collect(t, ix, 1, fs, "/", "new")
	if !contains(got, "movies/new.mkv") {
		t.Fatalf("after the background rebuild got %v, want movies/new.mkv", got)
	}
}

// While a refresh is running, further stale searches don't start another.
func TestStaleRebuildStartsOnce(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1_000_000, 0)}
	ix := New()
	defer ix.Close()
	ix.now = clock.now
	ix.SetMaxAge(time.Minute)

	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "x")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	clock.t = clock.t.Add(2 * time.Minute)

	s := ix.shardFor(1, false)
	s.mu.Lock()
	s.building = true // simulate a refresh already in flight
	s.mu.Unlock()

	collect(t, ix, 1, fs, "/", "a")
	s.mu.RLock()
	builtAt := s.builtAt
	s.mu.RUnlock()
	time.Sleep(50 * time.Millisecond)
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.builtAt.Equal(builtAt) {
		t.Fatal("a search during an in-flight rebuild must not start a second one")
	}
}

// maxAge 0 disables age-based rebuilds entirely.
func TestMaxAgeZeroDisables(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1_000_000, 0)}
	ix := New()
	defer ix.Close()
	ix.now = clock.now
	ix.SetMaxAge(0)

	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "x")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	clock.t = clock.t.Add(1000 * time.Hour)
	collect(t, ix, 1, fs, "/", "a")
	if ix.shardFor(1, false).building {
		t.Fatal("maxAge 0 must never trigger a rebuild")
	}
}
