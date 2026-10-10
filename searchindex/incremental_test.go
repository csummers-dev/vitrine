package searchindex

import (
	"testing"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/events"
)

func TestWatcherChangesApplyInPlace(t *testing.T) {
	ix := New()
	defer ix.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/movies/old.mkv", "x")
	seed(t, fs, "/movies/gone/a.txt", "x")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	s := ix.shardFor(1, false)
	s.mu.RLock()
	builtAt := s.builtAt
	s.mu.RUnlock()

	// On disk: a new file, a new folder with contents, a removed folder.
	seed(t, fs, "/movies/new.mkv", "y")
	seed(t, fs, "/movies/Season 1/e01.mkv", "z")
	if err := fs.RemoveAll("/movies/gone"); err != nil {
		t.Fatal(err)
	}
	events.Publish(events.FilesChanged{
		Base:  events.NewBase(1, ""),
		Dir:   "/movies",
		Names: []string{"new.mkv", "Season 1", "gone"},
	})

	waitFor(t, func() bool {
		got, _ := collect(t, ix, 1, fs, "/", "e01")
		return contains(got, "movies/Season 1/e01.mkv")
	})
	got, _ := collect(t, ix, 1, fs, "/", "mkv")
	for _, want := range []string{"movies/new.mkv", "movies/old.mkv", "movies/Season 1/e01.mkv"} {
		if !contains(got, want) {
			t.Errorf("search missing %q; got %v", want, got)
		}
	}
	if gone, _ := collect(t, ix, 1, fs, "/", "a.txt"); len(gone) != 0 {
		t.Errorf("removed folder's contents still indexed: %v", gone)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.builtAt.Equal(builtAt) {
		t.Error("a small named change should not trigger a full rebuild")
	}
}

func TestUnnamedWatcherChangeRebuilds(t *testing.T) {
	ix := New()
	defer ix.Close()
	ix.debounce = 0
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "x")
	if err := ix.Rebuild(2, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	seed(t, fs, "/b.txt", "y")
	events.Publish(events.FilesChanged{Base: events.NewBase(2, ""), Dir: "/"})
	waitFor(t, func() bool {
		got, _ := collect(t, ix, 2, fs, "/", "b.txt")
		return contains(got, "b.txt")
	})
}
