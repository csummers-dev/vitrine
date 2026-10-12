package dupes

import (
	"path/filepath"
	"testing"

	"github.com/csummers-dev/vitrine/v4/events"
)

func TestHashStore(t *testing.T) {
	s, err := OpenHashStore(filepath.Join(t.TempDir(), "h.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	alice, bob := s.ForUser(1), s.ForUser(2)
	e := Entry{Size: 10, ModTime: 5, Partial: "p", Full: "f"}
	if err := alice.Store(map[string]Entry{
		"/Music/a.flac": e, "/Music/Live/b.flac": e, "/Musical/c.flac": e,
	}); err != nil {
		t.Fatal(err)
	}
	_ = bob.Store(map[string]Entry{"/Music/a.flac": e})

	got, _ := alice.Lookup([]string{"/Music/a.flac", "/nope"})
	if len(got) != 1 || got["/Music/a.flac"] != e {
		t.Fatalf("lookup = %+v", got)
	}

	// Deleting a folder forgets everything under it, for that user only,
	// and not siblings that merely share a name prefix.
	var deliver func(events.Event)
	unsub := s.Attach(func(fn func(events.Event)) func() { deliver = fn; return func() {} })
	defer unsub()
	deliver(events.FileDeleted{Base: events.Base{UserID: 1}, Path: "/Music"})

	got, _ = alice.Lookup([]string{"/Music/a.flac", "/Music/Live/b.flac", "/Musical/c.flac"})
	if len(got) != 1 || got["/Musical/c.flac"] != e {
		t.Errorf("after delete = %+v", got)
	}
	if got, _ := bob.Lookup([]string{"/Music/a.flac"}); len(got) != 1 {
		t.Error("another user's entry was dropped")
	}

	deliver(events.FilesChanged{Base: events.Base{UserID: 1}, Dir: "/", Names: []string{"Musical"}})
	if got, _ := alice.Lookup([]string{"/Musical/c.flac"}); len(got) != 0 {
		t.Error("outside change not forgotten")
	}
}
