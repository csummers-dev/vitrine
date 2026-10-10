package fbhttp

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/settings"
)

// fakeBus is a private events bus so tests don't see each other's events.
type fakeBus struct{ handlers []func(events.Event) }

func (b *fakeBus) subscribe(h func(events.Event)) func() {
	b.handlers = append(b.handlers, h)
	return func() {}
}

func (b *fakeBus) publish(e events.Event) {
	for _, h := range b.handlers {
		h(e)
	}
}

func TestStreamHubRoutesChangesToTheRightUser(t *testing.T) {
	bus := &fakeBus{}
	h := newStreamHub(bus.subscribe)
	alice := &streamClient{userID: 1, ch: make(chan streamMessage, 8)}
	bob := &streamClient{userID: 2, ch: make(chan streamMessage, 8)}
	h.add(alice)
	h.add(bob)

	bus.publish(events.FilesChanged{Base: events.NewBase(1, ""), Dir: "/Movies", Names: []string{"a.mkv"}})
	bus.publish(events.FileRenamed{Base: events.NewBase(1, ""), From: "/a/x.txt", To: "/b/x.txt"})

	want := []streamMessage{
		{event: "files.changed", dir: "/Movies", names: []string{"a.mkv"}},
		{event: "files.changed", dir: "/a", names: []string{"x.txt"}},
		{event: "files.changed", dir: "/b", names: []string{"x.txt"}},
	}
	for i, w := range want {
		select {
		case got := <-alice.ch:
			if !reflect.DeepEqual(got, w) {
				t.Errorf("message %d = %+v, want %+v", i, got, w)
			}
		default:
			t.Fatalf("message %d missing", i)
		}
	}
	if len(bob.ch) != 0 {
		t.Error("another user's changes must not reach bob")
	}
}

func TestStreamHubDropsWhenAClientIsBehind(t *testing.T) {
	bus := &fakeBus{}
	h := newStreamHub(bus.subscribe)
	slow := &streamClient{userID: 1, ch: make(chan streamMessage, 1)}
	h.add(slow)
	done := make(chan struct{})
	go func() {
		for i := 0; i < 10; i++ {
			bus.publish(events.FilesChanged{Base: events.NewBase(1, ""), Dir: "/"})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("publishing blocked on a slow stream")
	}
	h.remove(slow)
	if h.count(1) != 0 {
		t.Error("client not removed")
	}
}

func TestVisibleHonoursRules(t *testing.T) {
	hideDot := func(p string) bool { return !strings.Contains(p, "/.") }
	m, ok := visible(streamMessage{dir: "/", names: []string{".env", "a.txt"}}, hideDot)
	if !ok || !reflect.DeepEqual(m.names, []string{"a.txt"}) {
		t.Errorf("visible = %+v, %v", m, ok)
	}
	if _, ok := visible(streamMessage{dir: "/", names: []string{".env"}}, hideDot); ok {
		t.Error("a change to only hidden entries must not be sent")
	}
	if _, ok := visible(streamMessage{dir: "/.secret"}, hideDot); ok {
		t.Error("a change inside a hidden folder must not be sent")
	}
	if _, ok := visible(streamMessage{dir: "/docs"}, hideDot); !ok {
		t.Error("an unnamed change to a visible folder should be sent")
	}
}

func TestEventsStreamHandler(t *testing.T) {
	st, _, bob := newAuthzStorage(t)
	bus := &fakeBus{}
	hub := newStreamHub(bus.subscribe)
	h := handle(eventsStreamHandler(hub), "", st, nil, nil, &settings.Server{})

	t.Run("requires a valid token", func(t *testing.T) {
		got := serveStatus(h, authGet(t, "/api/events/stream", "", nil))
		if got != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", got)
		}
	})

	t.Run("streams changes and accepts the auth query parameter", func(t *testing.T) {
		srv := httptest.NewServer(h)
		defer srv.Close()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
			srv.URL+"/api/events/stream?auth="+mintToken(t, bob, authzSigningKey), http.NoBody)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
			t.Fatalf("Content-Type = %q", ct)
		}
		if resp.Header.Get("X-Accel-Buffering") != "no" {
			t.Error("proxy buffering must be disabled")
		}

		lines := bufio.NewScanner(resp.Body)
		readUntil := func(prefix string) string {
			t.Helper()
			for lines.Scan() {
				if strings.HasPrefix(lines.Text(), prefix) {
					return lines.Text()
				}
			}
			t.Fatalf("stream ended before %q", prefix)
			return ""
		}
		readUntil(": connected")
		waitFor(t, func() bool { return hub.count(bob.ID) == 1 })

		bus.publish(events.FilesChanged{Base: events.NewBase(bob.ID, ""), Dir: "/", Names: []string{"hello.txt"}})
		if got := readUntil("event:"); got != "event: files.changed" {
			t.Errorf("event line = %q", got)
		}
		if got := readUntil("data:"); got != `data: {"dir":"/","names":["hello.txt"]}` {
			t.Errorf("data line = %q", got)
		}

		hub.Close() // server shutdown ends the stream
		for lines.Scan() {
		}
		waitFor(t, func() bool { return hub.count(bob.ID) == 0 })
	})
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
