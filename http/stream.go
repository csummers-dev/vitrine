package fbhttp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"sync"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
)

// Server-sent events (4.0 Phase 2.3): GET /api/events/stream keeps one
// connection per browser tab open and pushes `files.changed` whenever a
// folder the user can see changes, so open listings refresh themselves.
//
// The browser's EventSource can't send the X-Auth header, so the stream
// authenticates with the `auth` query parameter or cookie, the same way
// media requests do (see extractor).

const (
	streamHeartbeat = 25 * time.Second
	// streamBuffer is how many undelivered messages a slow client may queue
	// before new ones are dropped (it refreshes on the next one anyway).
	streamBuffer = 64
)

// streamMessage is one SSE message for a user.
type streamMessage struct {
	event string
	dir   string
	names []string
}

type streamClient struct {
	userID uint
	ch     chan streamMessage
}

// streamHub routes events-bus changes to the open streams of each user.
type streamHub struct {
	mu      sync.Mutex
	clients map[uint]map[*streamClient]struct{}
	closed  chan struct{}
	once    sync.Once
	unsub   func()
}

func newStreamHub(subscribe func(func(events.Event)) func()) *streamHub {
	h := &streamHub{
		clients: map[uint]map[*streamClient]struct{}{},
		closed:  make(chan struct{}),
	}
	h.unsub = subscribe(h.onEvent)
	return h
}

// streams is the process-wide hub, set by NewHandler, so cmd can end every
// stream on shutdown (ShutdownStreams). Long-lived streams would otherwise
// keep http.Server.Shutdown waiting until its deadline.
var (
	streamsMu sync.Mutex
	streams   *streamHub
)

// ShutdownStreams ends every open event stream. Register it with
// http.Server.RegisterOnShutdown.
func ShutdownStreams() {
	streamsMu.Lock()
	h := streams
	streamsMu.Unlock()
	if h != nil {
		h.Close()
	}
}

// Close ends every stream and stops listening to the events bus.
func (h *streamHub) Close() {
	h.once.Do(func() {
		if h.unsub != nil {
			h.unsub()
		}
		close(h.closed)
	})
}

func (h *streamHub) add(c *streamClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.clients[c.userID]
	if set == nil {
		set = map[*streamClient]struct{}{}
		h.clients[c.userID] = set
	}
	set[c] = struct{}{}
}

func (h *streamHub) remove(c *streamClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.clients[c.userID]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.userID)
		}
	}
}

// count reports how many streams a user has open (for tests).
func (h *streamHub) count(userID uint) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients[userID])
}

func (h *streamHub) send(userID uint, m streamMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients[userID] {
		select {
		case c.ch <- m:
		default: // client is behind; drop rather than block the publisher
		}
	}
}

// onEvent maps file events to `files.changed` messages. The watcher's
// FilesChanged covers every change on disk; vitrine's own file events are
// mapped too, so other tabs of the acting user refresh even with file
// watching turned off.
func (h *streamHub) onEvent(e events.Event) {
	switch v := e.(type) {
	case events.FilesChanged:
		h.send(v.UserID, streamMessage{event: "files.changed", dir: v.Dir, names: v.Names})
	case events.FileCreated:
		h.sendPath(v.UserID, v.Path)
	case events.FileDeleted:
		h.sendPath(v.UserID, v.Path)
	case events.FileUploaded:
		h.sendPath(v.UserID, v.Path)
	case events.FileModified:
		h.sendPath(v.UserID, v.Path)
	case events.FileRenamed:
		h.sendPath(v.UserID, v.From)
		h.sendPath(v.UserID, v.To)
	case events.FileMoved:
		h.sendPath(v.UserID, v.From)
		h.sendPath(v.UserID, v.To)
	case events.FileCopied:
		h.sendPath(v.UserID, v.To)
	}
}

func (h *streamHub) sendPath(userID uint, p string) {
	p = path.Clean("/" + p)
	if p == "/" {
		return
	}
	h.send(userID, streamMessage{event: "files.changed", dir: path.Dir(p), names: []string{path.Base(p)}})
}

// visible filters a change down to what this user may see. It returns false
// when nothing visible is left.
func visible(m streamMessage, check func(string) bool) (streamMessage, bool) {
	if m.dir != "/" && !check(m.dir) {
		return m, false
	}
	if len(m.names) == 0 {
		return m, true
	}
	var keep []string
	for _, n := range m.names {
		if check(path.Join(m.dir, n)) {
			keep = append(keep, n)
		}
	}
	if len(keep) == 0 {
		return m, false
	}
	m.names = keep
	return m, true
}

func writeSSE(w http.ResponseWriter, m streamMessage) error {
	payload, err := json.Marshal(struct {
		Dir   string   `json:"dir"`
		Names []string `json:"names"`
	}{m.dir, m.names})
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", m.event, payload)
	return err
}

// eventsStreamHandler serves GET /api/events/stream.
func eventsStreamHandler(h *streamHub) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			return http.StatusNotImplemented, nil
		}
		hdr := w.Header()
		hdr.Set("Content-Type", "text/event-stream")
		hdr.Set("Cache-Control", "no-cache")
		hdr.Set("Connection", "keep-alive")
		// nginx and some other proxies buffer responses unless told not to.
		hdr.Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		// An initial comment opens the stream through buffering proxies.
		if _, err := fmt.Fprint(w, ": connected\n\n"); err != nil {
			return 0, nil
		}
		flusher.Flush()

		client := &streamClient{userID: d.user.ID, ch: make(chan streamMessage, streamBuffer)}
		h.add(client)
		defer h.remove(client)

		revokedAt := d.user.SessionsRevokedAt
		beat := time.NewTicker(streamHeartbeat)
		defer beat.Stop()
		for {
			select {
			case <-r.Context().Done():
				return 0, nil
			case <-h.closed:
				return 0, nil
			case m := <-client.ch:
				m, ok := visible(m, d.Check)
				if !ok {
					continue
				}
				if err := writeSSE(w, m); err != nil {
					return 0, nil
				}
				flusher.Flush()
			case <-beat.C:
				// "Sign out everywhere" (or a deleted user) ends the stream.
				u, err := d.store.Users.Get(d.server.Root, d.user.ID)
				if err != nil || u.SessionsRevokedAt != revokedAt {
					return 0, nil
				}
				if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
					return 0, nil
				}
				flusher.Flush()
			}
		}
	})
}
