package webhooks

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
)

// fileEventTypes are the only events that trigger webhooks (locked: the
// file.* set). Keyed for O(1) membership checks.
var fileEventTypes = map[string]bool{
	"file.created":  true,
	"file.renamed":  true,
	"file.moved":    true,
	"file.copied":   true,
	"file.deleted":  true,
	"file.uploaded": true,
	"file.modified": true,
}

// FileEventTypes returns the event types webhooks can fire on (used by
// the HTTP layer to validate per-endpoint filters).
func FileEventTypes() []string {
	return []string{
		"file.created", "file.renamed", "file.moved",
		"file.copied", "file.deleted", "file.uploaded", "file.modified",
	}
}

// Payload is the JSON body POSTed to each endpoint. Mirrors the audit
// Entry shape: a wire-stable event type, when/who, the primary path, and
// the full original event under `data`.
type Payload struct {
	Event     string          `json:"event"`
	Timestamp time.Time       `json:"timestamp"`
	UserID    uint            `json:"userId"`
	Path      string          `json:"path,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
}

// Dispatcher subscribes to the events bus and delivers matching file
// events to configured endpoints — backgrounded, concurrency-bounded,
// with retry + backoff.
type Dispatcher struct {
	store       *Store
	client      *http.Client
	localClient *http.Client
	sem         chan struct{}
	now         func() time.Time

	// Jellyfin endpoints refresh at most once per jellyfinDelay.
	jellyfinDelay time.Duration
	jfMu          sync.Mutex
	jfPending     map[string]*time.Timer
}

// NewDispatcher builds a dispatcher over store. The HTTP client refuses to
// connect to internal/non-routable addresses (SEC-002 SSRF guard).
func NewDispatcher(store *Store) *Dispatcher {
	return &Dispatcher{
		store:       store,
		client:      newGuardedHTTPClient(10*time.Second, false),
		localClient: newGuardedHTTPClient(10*time.Second, true),
		// Cap concurrent in-flight deliveries so a burst of events (or a
		// slow receiver) can't spawn unbounded goroutines / sockets.
		sem:           make(chan struct{}, 4),
		now:           time.Now,
		jellyfinDelay: JellyfinRefreshDelay,
		jfPending:     map[string]*time.Timer{},
	}
}

// Attach subscribes to the bus. The handler runs INSIDE the synchronous
// Publish, so it does only cheap work (filter + marshal) and hands the
// actual HTTP POSTs to background goroutines. Returns the unsubscribe.
func (d *Dispatcher) Attach(subscribe func(func(events.Event)) func()) func() {
	return subscribe(func(e events.Event) {
		if !fileEventTypes[e.Type()] {
			return
		}
		eps, err := d.store.List()
		if err != nil || len(eps) == 0 {
			return
		}
		payload := buildPayload(e)
		body, err := json.Marshal(payload)
		if err != nil {
			return
		}
		paths := eventPaths(e)
		for _, ep := range eps {
			if !ep.Enabled || !matches(ep.Events, e.Type()) || !pathMatches(ep.Paths, paths...) {
				continue
			}
			if ep.Kind == KindJellyfin {
				d.scheduleJellyfin(ep.ID)
				continue
			}
			d.deliver(ep, body)
		}
	})
}

// matches reports whether an endpoint's filter accepts event type t.
// An empty filter means "all file events".
func matches(filter []string, t string) bool {
	if len(filter) == 0 {
		return true
	}
	for _, f := range filter {
		if f == t {
			return true
		}
	}
	return false
}

// deliver POSTs body to the endpoint in the background, retrying transient
// failures (network errors / 5xx) with exponential backoff, then records
// the outcome on the endpoint. Retries carry the same signature.
func (d *Dispatcher) deliver(ep Endpoint, body []byte) {
	headers := map[string]string{}
	if ep.Secret != "" {
		headers[SignatureHeader] = Sign(ep.Secret, d.now(), body)
	}
	go func() {
		d.sem <- struct{}{}
		defer func() { <-d.sem }()

		// 3 attempts: immediate, +5s, +30s.
		delays := []time.Duration{0, 5 * time.Second, 30 * time.Second}
		var lastCode int
		var lastErr string

		for _, delay := range delays {
			if delay > 0 {
				time.Sleep(delay)
			}
			code, err := d.post(ep, body, headers)
			lastCode = code
			lastErr = ""
			if err != nil {
				lastErr = err.Error()
			}

			switch {
			case err == nil && code >= 200 && code < 300:
				d.store.RecordDelivery(ep.ID, "success", code, "")
				return
			case err == nil && code >= 400 && code < 500:
				// Client error — a retry won't fix it; fail fast.
				d.store.RecordDelivery(ep.ID, "failed", code, "")
				return
			}
			// Network error or 5xx → retry with the next backoff.
		}
		d.store.RecordDelivery(ep.ID, "failed", lastCode, lastErr)
	}()
}

// scheduleJellyfin asks a Jellyfin endpoint for a library scan after
// jellyfinDelay, unless one is already scheduled.
func (d *Dispatcher) scheduleJellyfin(id string) {
	d.jfMu.Lock()
	defer d.jfMu.Unlock()
	if _, pending := d.jfPending[id]; pending {
		return
	}
	d.jfPending[id] = time.AfterFunc(d.jellyfinDelay, func() {
		d.jfMu.Lock()
		delete(d.jfPending, id)
		d.jfMu.Unlock()
		ep, err := d.store.Get(id)
		if err != nil || ep == nil || !ep.Enabled {
			return
		}
		code, err := d.jellyfin(*ep, false)
		d.record(ep.ID, code, err)
	})
}

// Stop cancels scheduled Jellyfin scans (tests, shutdown).
func (d *Dispatcher) Stop() {
	d.jfMu.Lock()
	defer d.jfMu.Unlock()
	for id, t := range d.jfPending {
		t.Stop()
		delete(d.jfPending, id)
	}
}

func (d *Dispatcher) record(id string, code int, err error) {
	switch {
	case err != nil:
		d.store.RecordDelivery(id, "failed", code, err.Error())
	case code < 200 || code >= 300:
		d.store.RecordDelivery(id, "failed", code, "")
	default:
		d.store.RecordDelivery(id, "success", code, "")
	}
}

func (d *Dispatcher) clientFor(ep Endpoint) *http.Client {
	if ep.AllowLocal {
		return d.localClient
	}
	return d.client
}

// jellyfin sends a library refresh (or, for test, a connection check).
func (d *Dispatcher) jellyfin(ep Endpoint, test bool) (int, error) {
	req, err := jellyfinRequest(ep.URL, ep.APIKey, test)
	if err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := d.clientFor(ep).Do(req.WithContext(ctx))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// Test checks an endpoint now (the admin "Test" button): a synthetic,
// signed `webhook.test` POST, or for Jellyfin a connection check that
// doesn't start a scan. The result is recorded on the endpoint.
func (d *Dispatcher) Test(ep Endpoint) (int, error) {
	var (
		code int
		err  error
	)
	if ep.Kind == KindJellyfin {
		code, err = d.jellyfin(ep, true)
	} else {
		body, _ := json.Marshal(Payload{Event: "webhook.test", Timestamp: d.now()})
		headers := map[string]string{}
		if ep.Secret != "" {
			headers[SignatureHeader] = Sign(ep.Secret, d.now(), body)
		}
		code, err = d.post(ep, body, headers)
	}
	if ep.ID != "" {
		d.record(ep.ID, code, err)
	}
	return code, err
}

func (d *Dispatcher) post(ep Endpoint, body []byte, headers map[string]string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.URL, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "filebrowser-webhooks")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := d.clientFor(ep).Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// eventPaths lists the paths an event touches, for endpoint path filters.
func eventPaths(e events.Event) []string {
	switch v := e.(type) {
	case events.FileCreated:
		return []string{v.Path}
	case events.FileRenamed:
		return []string{v.From, v.To}
	case events.FileMoved:
		return []string{v.From, v.To}
	case events.FileCopied:
		return []string{v.To}
	case events.FileDeleted:
		return []string{v.Path}
	case events.FileUploaded:
		return []string{v.Path}
	case events.FileModified:
		return []string{v.Path}
	}
	return nil
}

// buildPayload maps a concrete event onto the webhook Payload, picking a
// sensible primary path and stashing the full event under `data`.
func buildPayload(e events.Event) Payload {
	data, _ := json.Marshal(e)
	p := Payload{Event: e.Type(), Timestamp: e.Timestamp(), Data: data}

	switch v := e.(type) {
	case events.FileCreated:
		p.UserID, p.Path = v.UserID, v.Path
	case events.FileRenamed:
		p.UserID, p.Path = v.UserID, v.To
	case events.FileMoved:
		p.UserID, p.Path = v.UserID, v.To
	case events.FileCopied:
		p.UserID, p.Path = v.UserID, v.To
	case events.FileDeleted:
		p.UserID, p.Path = v.UserID, v.Path
	case events.FileUploaded:
		p.UserID, p.Path = v.UserID, v.Path
	case events.FileModified:
		p.UserID, p.Path = v.UserID, v.Path
	}
	return p
}
