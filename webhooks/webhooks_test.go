package webhooks

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
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
	// The SSRF guard (SEC-002) blocks loopback; relax it so the httptest server
	// is reachable. The guard logic itself is covered by TestIsBlockedIP.
	ssrfGuardDisabled = true
	defer func() { ssrfGuardDisabled = false }()

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

func TestEndpointSecretsAreWriteOnly(t *testing.T) {
	t.Parallel()
	s := newTestStore(t)
	ep := &Endpoint{URL: "http://jf.test", Kind: KindJellyfin, APIKey: "key1", Enabled: true}
	if err := s.Create(ep); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSecret(ep.ID, "whsec_x"); err != nil {
		t.Fatal(err)
	}
	// An edit without secrets keeps both.
	if err := s.Update(&Endpoint{ID: ep.ID, URL: "http://jf2.test", Kind: KindJellyfin}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(ep.ID)
	if got.APIKey != "key1" || got.Secret != "whsec_x" || got.URL != "http://jf2.test" {
		t.Fatalf("after update: %+v", got)
	}
	pub := got.Public()
	if pub.APIKey != "" || pub.Secret != "" || !pub.HasAPIKey || !pub.HasSecret {
		t.Fatalf("Public() = %+v", pub)
	}
	if err := s.SetSecret("999", "x"); err != ErrNotFound {
		t.Fatalf("SetSecret(missing) = %v", err)
	}
}

func TestDispatcherSignsAndFiltersByPath(t *testing.T) {
	ssrfGuardDisabled = true
	defer func() { ssrfGuardDisabled = false }()

	type delivery struct {
		sig  string
		body []byte
	}
	got := make(chan delivery, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got <- delivery{r.Header.Get(SignatureHeader), b}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	s := newTestStore(t)
	ep := &Endpoint{URL: srv.URL, Enabled: true, Paths: []string{"/Movies"}}
	if err := s.Create(ep); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSecret(ep.ID, "whsec_sig"); err != nil {
		t.Fatal(err)
	}
	bus := &testBus{}
	d := NewDispatcher(s)
	d.Attach(bus.subscribe)

	bus.publish(events.FileCreated{Base: events.NewBase(1, ""), Path: "/Music/a.mp3"}) // filtered out
	bus.publish(events.FileCreated{Base: events.NewBase(1, ""), Path: "/Movies/a.mkv"})

	select {
	case dl := <-got:
		if !Verify("whsec_sig", dl.sig, dl.body, time.Now(), time.Minute) {
			t.Fatalf("signature %q doesn't verify", dl.sig)
		}
		var p Payload
		_ = json.Unmarshal(dl.body, &p)
		if p.Path != "/Movies/a.mkv" {
			t.Fatalf("delivered %q; the /Music change should have been filtered", p.Path)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no delivery")
	}
	select {
	case dl := <-got:
		t.Fatalf("unexpected second delivery: %s", dl.body)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestDispatcherJellyfinDebounces(t *testing.T) {
	ssrfGuardDisabled = true
	defer func() { ssrfGuardDisabled = false }()

	var mu sync.Mutex
	var refreshes []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		refreshes = append(refreshes, r.Method+" "+r.URL.Path+" "+r.Header.Get("X-Emby-Token"))
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	s := newTestStore(t)
	if err := s.Create(&Endpoint{URL: srv.URL, Enabled: true, Kind: KindJellyfin, APIKey: "jfkey"}); err != nil {
		t.Fatal(err)
	}
	bus := &testBus{}
	d := NewDispatcher(s)
	d.jellyfinDelay = 100 * time.Millisecond
	defer d.Stop()
	d.Attach(bus.subscribe)

	for i := 0; i < 5; i++ {
		bus.publish(events.FileUploaded{Base: events.NewBase(1, ""), Path: "/Movies/x.mkv"})
	}
	time.Sleep(400 * time.Millisecond)
	mu.Lock()
	n := len(refreshes)
	first := ""
	if n > 0 {
		first = refreshes[0]
	}
	mu.Unlock()
	if n != 1 || first != "POST /Library/Refresh jfkey" {
		t.Fatalf("refreshes = %v, want one POST /Library/Refresh", refreshes)
	}

	// A later burst schedules another scan.
	bus.publish(events.FileDeleted{Base: events.NewBase(1, ""), Path: "/Movies/x.mkv"})
	time.Sleep(300 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if len(refreshes) != 2 {
		t.Fatalf("refreshes = %v, want 2", refreshes)
	}
}

// testBus is a private events bus so parallel tests don't see each other.
type testBus struct {
	mu       sync.Mutex
	handlers []func(events.Event)
}

func (b *testBus) subscribe(h func(events.Event)) func() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers = append(b.handlers, h)
	return func() {}
}

func (b *testBus) publish(e events.Event) {
	b.mu.Lock()
	hs := append([]func(events.Event){}, b.handlers...)
	b.mu.Unlock()
	for _, h := range hs {
		h(e)
	}
}
