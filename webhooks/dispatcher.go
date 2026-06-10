package webhooks

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/filebrowser/filebrowser/v2/events"
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
	store  *Store
	client *http.Client
	sem    chan struct{}
}

// NewDispatcher builds a dispatcher over store.
func NewDispatcher(store *Store) *Dispatcher {
	return &Dispatcher{
		store:  store,
		client: &http.Client{Timeout: 10 * time.Second},
		// Cap concurrent in-flight deliveries so a burst of events (or a
		// slow receiver) can't spawn unbounded goroutines / sockets.
		sem: make(chan struct{}, 4),
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
		body, err := json.Marshal(buildPayload(e))
		if err != nil {
			return
		}
		for _, ep := range eps {
			if !ep.Enabled || !matches(ep.Events, e.Type()) {
				continue
			}
			d.deliver(ep.ID, ep.URL, body)
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

// deliver POSTs body to url in the background, retrying transient failures
// (network errors / 5xx) with exponential backoff, then records the
// outcome on the endpoint.
func (d *Dispatcher) deliver(id, url string, body []byte) {
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
			code, err := d.post(url, body)
			lastCode = code
			lastErr = ""
			if err != nil {
				lastErr = err.Error()
			}

			switch {
			case err == nil && code >= 200 && code < 300:
				d.store.RecordDelivery(id, "success", code, "")
				return
			case err == nil && code >= 400 && code < 500:
				// Client error — a retry won't fix it; fail fast.
				d.store.RecordDelivery(id, "failed", code, "")
				return
			}
			// Network error or 5xx → retry with the next backoff.
		}
		d.store.RecordDelivery(id, "failed", lastCode, lastErr)
	}()
}

// Test POSTs a synthetic `webhook.test` payload to url immediately (the
// admin "Test" button), records the result on the endpoint when id is
// non-empty, and returns the status + error for the handler to surface.
func (d *Dispatcher) Test(id, url string) (int, error) {
	body, _ := json.Marshal(Payload{Event: "webhook.test", Timestamp: time.Now()})
	code, err := d.post(url, body)

	status := "success"
	msg := ""
	if err != nil {
		status, msg = "failed", err.Error()
	} else if code < 200 || code >= 300 {
		status = "failed"
	}
	if id != "" {
		d.store.RecordDelivery(id, status, code, msg)
	}
	return code, err
}

func (d *Dispatcher) post(url string, body []byte) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "filebrowser-webhooks")

	resp, err := d.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
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
