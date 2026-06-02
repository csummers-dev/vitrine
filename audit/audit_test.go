package audit

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/filebrowser/filebrowser/v2/events"
)

// newTestLog returns a freshly-initialized Log rooted in t.TempDir.
// Closed on cleanup so tests don't leak bolt handles.
func newTestLog(t *testing.T) *Log {
	t.Helper()
	l, err := New(filepath.Join(t.TempDir(), "audit.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { _ = l.Close() })
	return l
}

func TestRecordPersistsAllFields(t *testing.T) {
	l := newTestLog(t)

	ev := events.FileRenamed{
		Base: events.Base{
			At:     time.Date(2026, 5, 31, 12, 0, 0, 123, time.UTC),
			UserID: 42,
			IP:     "10.0.0.5",
		},
		From: "/old.txt",
		To:   "/new.txt",
	}
	if err := l.Record(ev); err != nil {
		t.Fatalf("Record: %v", err)
	}

	rows, err := l.Query(Filter{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows want 1", len(rows))
	}
	got := rows[0]
	if got.Action != "file.renamed" {
		t.Errorf("Action got %q", got.Action)
	}
	if got.UserID != 42 {
		t.Errorf("UserID got %d", got.UserID)
	}
	if got.IP != "10.0.0.5" {
		t.Errorf("IP got %q", got.IP)
	}
	if got.Path != "/new.txt" {
		t.Errorf("Path got %q want /new.txt (destination)", got.Path)
	}
	if !got.Timestamp.Equal(ev.At) {
		t.Errorf("Timestamp got %v want %v", got.Timestamp, ev.At)
	}
	// Payload should round-trip the original event with both From + To.
	var decoded map[string]any
	if err := json.Unmarshal(got.Payload, &decoded); err != nil {
		t.Fatalf("Payload unmarshal: %v", err)
	}
	if decoded["from"] != "/old.txt" || decoded["to"] != "/new.txt" {
		t.Errorf("Payload missing from/to: %v", decoded)
	}
}

func TestAttachWiresEventsBus(t *testing.T) {
	// Reset the events bus so this test's subscriber doesn't leak.
	t.Cleanup(func() { /* events package has its own test reset, not exported */ })
	l := newTestLog(t)

	unsub := l.Attach(events.Subscribe)
	defer unsub()

	events.Publish(events.FileCreated{
		Base:  events.NewBase(1, "127.0.0.1"),
		Path:  "/hello.txt",
		IsDir: false,
	})

	// Give the synchronous Publish a beat to finish — actually it's
	// fully synchronous, so the row is already there. No sleep needed.
	rows, err := l.Query(Filter{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows want 1", len(rows))
	}
	if rows[0].Action != "file.created" || rows[0].Path != "/hello.txt" {
		t.Errorf("row mismatch: %+v", rows[0])
	}
}

// TestAuditRecordsEveryEventType publishes one of every concrete event
// type through the bus and asserts the audit log records each with its
// wire-stable action string (v1.3 S9-1 regression guard). If a new event
// type is added to the events package without a buildEntry case, it'll
// still be recorded via Action+Payload — this test pins that every
// currently-declared type round-trips. Not parallel: it attaches to the
// global bus, so it must not race other Attach-based tests.
func TestAuditRecordsEveryEventType(t *testing.T) {
	l := newTestLog(t)
	unsub := l.Attach(events.Subscribe)
	defer unsub()

	base := events.NewBase(1, "127.0.0.1")
	all := []events.Event{
		events.FileCreated{Base: base, Path: "/a"},
		events.FileRenamed{Base: base, From: "/a", To: "/b"},
		events.FileMoved{Base: base, From: "/b", To: "/c/b"},
		events.FileCopied{Base: base, From: "/c/b", To: "/d"},
		events.FileDeleted{Base: base, Path: "/d"},
		events.FileUploaded{Base: base, Path: "/up.bin", Size: 5},
		events.ShareGranted{Base: base, Path: "/a", ShareID: "s1"},
		events.ShareRevoked{Base: base, Path: "/a", ShareID: "s1"},
		events.UserLoggedIn{Base: base, Username: "admin"},
		events.UserLoggedOut{Base: base, Username: "admin"},
		events.SettingsChanged{Base: base, Scope: "user"},
	}
	for _, e := range all {
		events.Publish(e)
	}

	rows, err := l.Query(Filter{})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}

	got := map[string]bool{}
	for _, r := range rows {
		got[r.Action] = true
	}
	for _, e := range all {
		if !got[e.Type()] {
			t.Errorf("audit log missing event %q", e.Type())
		}
	}
	if len(rows) != len(all) {
		t.Errorf("recorded %d rows, want %d", len(rows), len(all))
	}
}

func TestAttachTwicePanics(t *testing.T) {
	l := newTestLog(t)
	unsub := l.Attach(events.Subscribe)
	defer unsub()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("second Attach should panic — would double-record every event")
		}
	}()
	l.Attach(events.Subscribe)
}

func TestQueryFilterByUserID(t *testing.T) {
	l := newTestLog(t)
	must := func(e error) {
		t.Helper()
		if e != nil {
			t.Fatal(e)
		}
	}
	must(l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/a"}))
	must(l.Record(events.FileCreated{Base: events.NewBase(2, ""), Path: "/b"}))
	must(l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/c"}))

	rows, err := l.Query(Filter{UserID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d want 2", len(rows))
	}
	for _, r := range rows {
		if r.UserID != 1 {
			t.Errorf("row leaked: %+v", r)
		}
	}
}

func TestQueryFilterByAction(t *testing.T) {
	l := newTestLog(t)
	_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/a"})
	_ = l.Record(events.FileDeleted{Base: events.NewBase(1, ""), Path: "/a"})
	_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/b"})

	rows, err := l.Query(Filter{Action: "file.deleted"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Action != "file.deleted" {
		t.Fatalf("bad filter result: %+v", rows)
	}
}

func TestQueryFilterByTimeRange(t *testing.T) {
	l := newTestLog(t)
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	mk := func(offset time.Duration, path string) events.FileCreated {
		return events.FileCreated{
			Base: events.Base{At: t0.Add(offset), UserID: 1},
			Path: path,
		}
	}
	_ = l.Record(mk(0, "/0"))
	_ = l.Record(mk(time.Hour, "/1"))
	_ = l.Record(mk(2*time.Hour, "/2"))
	_ = l.Record(mk(3*time.Hour, "/3"))

	// Want only the middle two — [t0+1h, t0+3h).
	rows, err := l.Query(Filter{Since: t0.Add(time.Hour), Until: t0.Add(3 * time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d want 2: %+v", len(rows), rows)
	}
	if rows[0].Path != "/1" || rows[1].Path != "/2" {
		t.Errorf("range slice wrong: %+v", rows)
	}
}

func TestQueryFilterByPathPrefix(t *testing.T) {
	l := newTestLog(t)
	_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/Documents/a.txt"})
	_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/Documents/b.txt"})
	_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/Other/c.txt"})

	rows, err := l.Query(Filter{PathPrefix: "/Documents/"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d want 2", len(rows))
	}
}

func TestQueryLimitOffset(t *testing.T) {
	l := newTestLog(t)
	for i := 0; i < 10; i++ {
		// Force distinct timestamps so ordering is deterministic.
		ev := events.FileCreated{
			Base: events.Base{
				At:     time.Now().Add(time.Duration(i) * time.Microsecond),
				UserID: 1,
			},
			Path: "/p",
		}
		if err := l.Record(ev); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := l.Query(Filter{Limit: 3, Offset: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("got %d want 3", len(rows))
	}
}

func TestEntriesAreReturnedChronologically(t *testing.T) {
	l := newTestLog(t)
	// Insert with explicit ordering — query should return same order.
	t0 := time.Now()
	for i := 0; i < 5; i++ {
		_ = l.Record(events.FileCreated{
			Base: events.Base{At: t0.Add(time.Duration(i) * time.Microsecond), UserID: 1},
			Path: "/p",
		})
	}
	rows, err := l.Query(Filter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 5 {
		t.Fatalf("got %d want 5", len(rows))
	}
	for i := 1; i < len(rows); i++ {
		if rows[i].Timestamp.Before(rows[i-1].Timestamp) {
			t.Errorf("row %d out of order: %v before %v", i, rows[i].Timestamp, rows[i-1].Timestamp)
		}
	}
}

func TestSequenceDisambiguatesSameNano(t *testing.T) {
	l := newTestLog(t)
	// Force-stamp two events at the literally identical nanosecond.
	ts := time.Date(2026, 5, 31, 12, 0, 0, 999, time.UTC)
	for i := 0; i < 3; i++ {
		_ = l.Record(events.FileCreated{
			Base: events.Base{At: ts, UserID: uint(i + 1)},
			Path: "/p",
		})
	}
	rows, err := l.Query(Filter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("got %d want 3 — same-nano events colliding on key", len(rows))
	}
	// Sequences should be 0, 1, 2 in insertion order.
	for i, r := range rows {
		if r.Seq != uint32(i) {
			t.Errorf("row %d Seq got %d want %d", i, r.Seq, i)
		}
	}
}

func TestCountReturnsBucketSize(t *testing.T) {
	l := newTestLog(t)
	for i := 0; i < 4; i++ {
		_ = l.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/p"})
	}
	n, err := l.Count()
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 {
		t.Errorf("Count got %d want 4", n)
	}
}

func TestPersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.db")

	l1, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	_ = l1.Record(events.FileCreated{Base: events.NewBase(1, ""), Path: "/survives"})
	_ = l1.Close()

	l2, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l2.Close() })

	rows, err := l2.Query(Filter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Path != "/survives" {
		t.Fatalf("post-reopen rows wrong: %+v", rows)
	}
}
