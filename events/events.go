// Package events is a tiny in-process publish/subscribe bus for
// app-wide notifications about user actions (file ops, share grants,
// auth events, settings changes).
//
// Per docs/architecture-v1.3.md, dispatch is synchronous: Publish runs
// every registered subscriber inline before returning. The subscriber
// set is expected to stay small (Stage 1: audit log; Stage 8: webhooks)
// so the simplicity is worth more than the async-pool flexibility.
// Each subscriber call is wrapped in defer/recover so a panic in one
// can't take down the publisher or skip the remaining subscribers.
//
// Concrete event types live in this package as plain structs. The
// Event interface keeps Publish polymorphic without forcing an "any"
// payload — subscribers do a type switch to handle the kinds they
// care about and ignore the rest.
//
// Typical usage:
//
//	// In a file handler after a successful rename:
//	events.Publish(events.FileRenamed{
//	    Base: events.NewBase(user.ID, request.RemoteAddr),
//	    From: src,
//	    To:   dst,
//	})
//
//	// In an audit subscriber (registered at startup):
//	unsubscribe := events.Subscribe(func(e events.Event) {
//	    switch ev := e.(type) {
//	    case events.FileRenamed:
//	        audit.Record(ev)
//	    }
//	})
package events

import (
	"log"
	"sync"
	"time"
)

// Event is implemented by every concrete event type in this package.
// Type() returns the wire-stable identifier persisted in the audit log
// and emitted to webhook payloads.
type Event interface {
	Type() string
	Timestamp() time.Time
}

// Base is embedded in every concrete event to carry the common fields:
// when it happened, who did it, and (when available) where they were
// coming from. Anchored to a constructor so we can never accidentally
// publish an event without a timestamp.
type Base struct {
	At     time.Time `json:"at"`
	UserID uint      `json:"userId"`
	IP     string    `json:"ip,omitempty"`
}

// NewBase stamps the current time on a fresh Base. IP is optional —
// pass "" if the caller doesn't have a request context (e.g., a cron
// job or internal task triggering an event).
func NewBase(userID uint, ip string) Base {
	return Base{At: time.Now(), UserID: userID, IP: ip}
}

// Timestamp lets every Base-embedding struct satisfy the Event interface
// without re-declaring the method.
func (b Base) Timestamp() time.Time { return b.At }

// ── Concrete event types ────────────────────────────────────────────
// Every event embeds Base. Action-specific fields hang off each struct.

// FileCreated fires when a new empty file or directory is created
// (not when uploaded — see FileUploaded for that).
type FileCreated struct {
	Base
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

func (FileCreated) Type() string { return "file.created" }

// FileRenamed fires when a file or directory is renamed in place.
// Move-across-folders fires FileMoved instead.
type FileRenamed struct {
	Base
	From string `json:"from"`
	To   string `json:"to"`
}

func (FileRenamed) Type() string { return "file.renamed" }

// FileMoved fires when a file or directory is moved to a different
// parent folder.
type FileMoved struct {
	Base
	From string `json:"from"`
	To   string `json:"to"`
}

func (FileMoved) Type() string { return "file.moved" }

// FileCopied fires when a file or directory is copied to a new path.
// The original survives at From.
type FileCopied struct {
	Base
	From string `json:"from"`
	To   string `json:"to"`
}

func (FileCopied) Type() string { return "file.copied" }

// FileDeleted fires when a file or directory is removed.
type FileDeleted struct {
	Base
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

func (FileDeleted) Type() string { return "file.deleted" }

// FileUploaded fires when a file is uploaded via the upload endpoint.
// Distinguished from FileCreated so audit consumers can tell the two
// apart — "create empty new file" vs "upload from external source"
// have very different security implications.
type FileUploaded struct {
	Base
	Path string `json:"path"`
	Size int64  `json:"size"`
}

func (FileUploaded) Type() string { return "file.uploaded" }

// ShareGranted fires when a new share link is minted.
type ShareGranted struct {
	Base
	Path    string `json:"path"`
	ShareID string `json:"shareId"`
	HasPwd  bool   `json:"hasPassword"`
}

func (ShareGranted) Type() string { return "share.granted" }

// ShareRevoked fires when an existing share link is deleted.
type ShareRevoked struct {
	Base
	Path    string `json:"path"`
	ShareID string `json:"shareId"`
}

func (ShareRevoked) Type() string { return "share.revoked" }

// UserLoggedIn fires after a successful login.
type UserLoggedIn struct {
	Base
	Username string `json:"username"`
}

func (UserLoggedIn) Type() string { return "user.loggedIn" }

// UserLoggedOut fires after an explicit logout. JWT expirations don't
// fire this event — they're invisible to the server.
type UserLoggedOut struct {
	Base
	Username string `json:"username"`
}

func (UserLoggedOut) Type() string { return "user.loggedOut" }

// SettingsChanged fires after any user-pref or global-settings update.
// The Scope field disambiguates ("user" / "global") + the Keys list
// names which fields actually changed (so subscribers can decide
// whether to care).
type SettingsChanged struct {
	Base
	Scope string   `json:"scope"`
	Keys  []string `json:"keys,omitempty"`
}

func (SettingsChanged) Type() string { return "settings.changed" }

// ── Subscriber registry ─────────────────────────────────────────────

var (
	subsMu sync.RWMutex
	subs   []func(Event)
)

// Subscribe registers handler to receive every published event until
// the returned unsubscribe function is called. Safe to call from
// startup code or tests; the handler list itself is mutex-guarded.
//
// Subscribers should be quick — Publish is synchronous, so a slow
// subscriber adds latency to the file operation that triggered it.
// For anything heavy (network calls, large writes), the subscriber
// should hand off to its own goroutine.
func Subscribe(handler func(Event)) (unsubscribe func()) {
	subsMu.Lock()
	defer subsMu.Unlock()
	// Use a pointer-equality trick: identify subscribers by their slot
	// index at registration time. Removal walks the slice and clears
	// the matching slot, then compacts. Compaction matters because the
	// audit + webhook subscribers register once at startup and unregister
	// only in tests — but tests need clean teardown.
	subs = append(subs, handler)
	idx := len(subs) - 1
	return func() {
		subsMu.Lock()
		defer subsMu.Unlock()
		if idx >= len(subs) {
			return
		}
		// Compact the slice. Order doesn't matter — subscribers are
		// invoked unordered anyway.
		subs[idx] = subs[len(subs)-1]
		subs = subs[:len(subs)-1]
	}
}

// Publish dispatches ev to every registered subscriber, synchronously,
// each call wrapped in a recover so a panic in one subscriber doesn't
// stop the rest or unwind the publisher's caller.
//
// Logs but does not return panics — the publisher (a file op) shouldn't
// fail just because the audit log subscriber blew up.
func Publish(ev Event) {
	subsMu.RLock()
	// Copy the slice so we can release the lock before invoking
	// handlers (which may try to Subscribe / Unsubscribe themselves and
	// would otherwise deadlock).
	snapshot := make([]func(Event), len(subs))
	copy(snapshot, subs)
	subsMu.RUnlock()

	for _, h := range snapshot {
		invoke(h, ev)
	}
}

func invoke(h func(Event), ev Event) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("events: subscriber panic on %s: %v", ev.Type(), r)
		}
	}()
	h(ev)
}

// reset clears all subscribers. Test-only — exposed via a build-tag-free
// helper that tests can grab via the unsubscribe pattern, but kept here
// for the rare "I want a clean bus for this test" case.
func reset() {
	subsMu.Lock()
	defer subsMu.Unlock()
	subs = subs[:0]
}
