package webhooks

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/filebrowser/filebrowser/v2/events"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "webhooks.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestStoreCRUD(t *testing.T) {
	t.Parallel()
	s := newTestStore(t)

	if eps, err := s.List(); err != nil || len(eps) != 0 {
		t.Fatalf("empty List = %v, %v", eps, err)
	}

	ep := &Endpoint{URL: "http://example.test/hook", Enabled: true, Events: []string{"file.created"}}
	if err := s.Create(ep); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if ep.ID == "" {
		t.Fatal("Create did not assign an ID")
	}

	got, err := s.Get(ep.ID)
	if err != nil || got == nil {
		t.Fatalf("Get: %v, %v", got, err)
	}
	if got.URL != ep.URL || !got.Enabled {
		t.Fatalf("Get round-trip mismatch: %+v", got)
	}

	// Update keeps last-delivery status (set it first).
	s.RecordDelivery(ep.ID, "success", 200, "")
	upd := &Endpoint{ID: ep.ID, URL: "http://example.test/hook2", Enabled: false}
	if err := s.Update(upd); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, _ = s.Get(ep.ID)
	if got.URL != "http://example.test/hook2" || got.Enabled {
		t.Fatalf("Update didn't persist: %+v", got)
	}
	if got.LastStatus != "success" || got.LastCode != 200 {
		t.Fatalf("Update dropped last-delivery status: %+v", got)
	}

	// Update of a missing id → ErrNotFound.
	if err := s.Update(&Endpoint{ID: "999", URL: "http://x.test"}); err != ErrNotFound {
		t.Fatalf("Update(missing) = %v, want ErrNotFound", err)
	}

	if err := s.Delete(ep.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got, _ := s.Get(ep.ID); got != nil {
		t.Fatalf("Get after Delete = %+v, want nil", got)
	}
}

// TestDispatcherDelivery exercises the full path: attach to the events
// bus, publish a file event, and assert the endpoint receives a correctly
// shaped POST in the background.
func TestDispatcherDelivery(t *testing.T) {
	received := make(chan Payload, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var p Payload
		_ = json.NewDecoder(r.Body).Decode(&p)
		received <- p
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := newTestStore(t)
	if err := s.Create(&Endpoint{URL: srv.URL, Enabled: true}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	d := NewDispatcher(s)
	unsub := d.Attach(events.Subscribe)
	defer unsub()

	events.Publish(events.FileUploaded{
		Base: events.NewBase(7, "1.2.3.4"),
		Path: "/Movies/clip.mp4",
		Size: 123,
	})

	select {
	case p := <-received:
		if p.Event != "file.uploaded" {
			t.Fatalf("event = %q, want file.uploaded", p.Event)
		}
		if p.Path != "/Movies/clip.mp4" || p.UserID != 7 {
			t.Fatalf("payload mismatch: %+v", p)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("webhook was not delivered within 3s")
	}

	// A non-file event (e.g. login) must NOT be delivered.
	events.Publish(events.UserLoggedIn{Base: events.NewBase(7, ""), Username: "admin"})
	select {
	case p := <-received:
		t.Fatalf("unexpected delivery for non-file event: %+v", p)
	case <-time.After(300 * time.Millisecond):
		// good — nothing delivered
	}
}
