package jobstore

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v3/jobs"
)

func TestSaveLoadDelete(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "jobs.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer s.Close()

	rec := jobs.Record{
		ID:        "j1",
		UserID:    3,
		Kind:      jobs.KindCopy,
		Items:     []jobs.Item{{From: "/a", To: "/x/a"}, {From: "/b", To: "/x/b"}},
		ItemsDone: []bool{true, false},
		Dest:      "/x",
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}
	if err := s.Save(rec); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := s.LoadAll()
	if err != nil || len(got) != 1 {
		t.Fatalf("LoadAll: %v, n=%d", err, len(got))
	}
	if got[0].ID != "j1" || got[0].UserID != 3 || len(got[0].Items) != 2 ||
		!got[0].ItemsDone[0] || got[0].ItemsDone[1] {
		t.Fatalf("round-trip mismatch: %+v", got[0])
	}

	// Overwrite (progress update) keeps a single record.
	rec.ItemsDone = []bool{true, true}
	if err := s.Save(rec); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.LoadAll(); len(got) != 1 || !got[0].ItemsDone[1] {
		t.Fatalf("overwrite failed: %+v", got)
	}

	if err := s.Delete("j1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got, _ := s.LoadAll(); len(got) != 0 {
		t.Fatalf("expected empty after delete, got %d", len(got))
	}
}
