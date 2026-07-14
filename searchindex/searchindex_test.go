package searchindex

import (
	"context"
	"fmt"
	"sort"
	"testing"
	"time"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v3/events"
)

type allowAll struct{}

func (allowAll) Check(string) bool { return true }

func seed(t *testing.T, fs afero.Fs, name, content string) {
	t.Helper()
	if err := afero.WriteFile(fs, name, []byte(content), 0o644); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
}

// collect runs a search and returns the matched relative paths, sorted.
func collect(t *testing.T, ix *Index, uid uint, fs afero.Fs, scope, query string) (paths []string, served bool) {
	t.Helper()
	var got []string
	served, err := ix.Search(context.Background(), uid, fs, scope, query, allowAll{},
		func(rel string, _ bool) error { got = append(got, rel); return nil })
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	sort.Strings(got)
	return got, served
}

func TestSearchNotReadyFallsBack(t *testing.T) {
	ix := New()
	defer ix.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a.txt", "x")

	_, served := collect(t, ix, 1, fs, "/", "a")
	if served {
		t.Error("a cold index should report served=false so the caller falls back to the live walk")
	}
}

func TestRebuildThenSearch(t *testing.T) {
	ix := New()
	defer ix.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/docs/Annual Report.pdf", "x")
	seed(t, fs, "/docs/budget.xlsx", "y")
	seed(t, fs, "/notes/report-draft.md", "z")

	if err := ix.Rebuild(7, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}

	got, served := collect(t, ix, 7, fs, "/", "report")
	if !served {
		t.Fatal("a built index should serve the search")
	}
	want := []string{"docs/Annual Report.pdf", "notes/report-draft.md"}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestExcludesTrash(t *testing.T) {
	ix := New()
	defer ix.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/keep/secret.txt", "x")
	seed(t, fs, "/.trash/secret.txt", "y")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatal(err)
	}

	got, _ := collect(t, ix, 1, fs, "/", "secret")
	if len(got) != 1 || got[0] != "keep/secret.txt" {
		t.Errorf("trash must be excluded; got %v", got)
	}
}

func TestScopeFilter(t *testing.T) {
	ix := New()
	defer ix.Close()
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a/report.txt", "x")
	seed(t, fs, "/b/report.txt", "y")
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatal(err)
	}

	got, _ := collect(t, ix, 1, fs, "/a", "report")
	if len(got) != 1 || got[0] != "report.txt" {
		t.Errorf("scope /a should only match its own subtree; got %v", got)
	}
}

func TestOversizedTreeFallsBackToWalk(t *testing.T) {
	ix := New()
	defer ix.Close()
	ix.maxEntries = 3 // tiny cap for the test
	fs := afero.NewMemMapFs()
	for i := 0; i < 10; i++ {
		seed(t, fs, fmt.Sprintf("/f%d.txt", i), "x")
	}

	// A forced rebuild must abandon the index (tree > cap), not error.
	if err := ix.Rebuild(1, fs); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	// Search reports served=false → the caller uses the live walk, and it never
	// re-triggers a doomed background build.
	if _, served := collect(t, ix, 1, fs, "/", "f1"); served {
		t.Error("an oversized tree must fall back to the live walk (served=false)")
	}
	if _, served := collect(t, ix, 1, fs, "/", "f2"); served {
		t.Error("oversized state should persist across searches")
	}
}

func TestEventDebouncedRebuild(t *testing.T) {
	ix := New()
	defer ix.Close()
	ix.debounce = 10 * time.Millisecond // fast for the test
	fs := afero.NewMemMapFs()
	seed(t, fs, "/a/old.txt", "x")
	if err := ix.Rebuild(5, fs); err != nil {
		t.Fatal(err)
	}
	// Prime the shard's captured fs via a search (Rebuild also sets it, but make
	// the dependency explicit).
	collect(t, ix, 5, fs, "/", "old")

	// A new file appears + an event fires → the index should pick it up after
	// the debounce window.
	seed(t, fs, "/a/fresh.txt", "y")
	events.Publish(events.FileCreated{Base: events.NewBase(5, ""), Path: "/a/fresh.txt"})

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		got, _ := collect(t, ix, 5, fs, "/", "fresh")
		if len(got) == 1 && got[0] == "a/fresh.txt" {
			return // success
		}
		time.Sleep(15 * time.Millisecond)
	}
	t.Error("index did not pick up the new file after a debounced rebuild")
}
