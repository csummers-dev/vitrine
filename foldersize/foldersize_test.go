package foldersize

import (
	"testing"
	"time"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v3/events"
)

func seed(t *testing.T, afs afero.Fs, name, content string) {
	t.Helper()
	if err := afero.WriteFile(afs, name, []byte(content), 0o644); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
}

func TestSizeSumsTreeAndExcludesTrash(t *testing.T) {
	c := New()
	defer c.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "12345")          // 5
	seed(t, fs, "/sub/b.txt", "678")        // 3
	seed(t, fs, "/.trash/junk", "01234567") // 8 — must NOT be counted

	got, at, err := c.Size(1, fs, "/")
	if err != nil {
		t.Fatalf("Size: %v", err)
	}
	if got != 8 {
		t.Errorf("size = %d, want 8 (trash excluded)", got)
	}
	if at.IsZero() {
		t.Error("computedAt should be set")
	}
}

func TestSizeRejectsNonDir(t *testing.T) {
	c := New()
	defer c.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/file.txt", "x")
	if _, _, err := c.Size(1, fs, "/file.txt"); err != ErrNotDir {
		t.Errorf("want ErrNotDir for a file, got %v", err)
	}
}

func TestSizeCachesHit(t *testing.T) {
	c := New()
	defer c.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/d/a.txt", "12345") // 5

	if _, _, err := c.Size(1, fs, "/d"); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.lru.Get(cacheKey(1, "/d")); !ok {
		t.Fatal("expected /d cached after first Size")
	}
}

func TestEventInvalidatesAncestorsForUserOnly(t *testing.T) {
	c := New()
	defer c.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/movies/a.txt", "12345")

	// Prime the cache for user 7 (the dir and its ancestor root) and user 8.
	if _, _, err := c.Size(7, fs, "/movies"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.Size(7, fs, "/"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.Size(8, fs, "/movies"); err != nil {
		t.Fatal(err)
	}

	// A deep content change for user 7 must drop user 7's /movies AND / entries…
	events.Publish(events.FileModified{Base: events.NewBase(7, ""), Path: "/movies/a.txt"})

	if _, ok := c.lru.Get(cacheKey(7, "/movies")); ok {
		t.Error("/movies should be invalidated for user 7")
	}
	if _, ok := c.lru.Get(cacheKey(7, "/")); ok {
		t.Error("ancestor / should be invalidated for user 7")
	}
	// …but leave a different user's identically-pathed entry intact.
	if _, ok := c.lru.Get(cacheKey(8, "/movies")); !ok {
		t.Error("user 8's /movies must NOT be invalidated by user 7's event")
	}
}

func TestStaleMtimeRecomputes(t *testing.T) {
	now := time.Now()
	c := newWith(16, time.Hour, func() time.Time { return now })
	defer c.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/d/a.txt", "12345") // 5

	first, _, err := c.Size(2, fs, "/d")
	if err != nil || first != 5 {
		t.Fatalf("first size = %d, err %v", first, err)
	}

	// Forge a cached entry with a DIFFERENT mtime than the dir's current one, so
	// the mtime guard forces a recompute even though TTL hasn't elapsed.
	k := cacheKey(2, "/d")
	e, _ := c.lru.Get(k)
	e.mtime = e.mtime.Add(-time.Hour)
	e.size = 999 // a stale value the recompute must replace
	c.lru.Add(k, e)

	got, _, err := c.Size(2, fs, "/d")
	if err != nil {
		t.Fatal(err)
	}
	if got != 5 {
		t.Errorf("stale mtime should recompute to 5, got %d", got)
	}
}
