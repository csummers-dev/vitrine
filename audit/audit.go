// Package audit is the durable, queryable log of user actions taken in
// the filebrowser instance.
//
// It's the consumer side of the events bus (see package events): at
// startup the host wires `audit.Log.Attach(eventsSubscribe)` and from
// then on every published Event is mapped to an Entry and persisted to a
// bolt DB.
//
// Per docs/architecture-v1.3.md (Stage 1 ship gate decisions):
//
//   - Only mutating events are recorded (file ops, share grant/revoke,
//     auth, settings changes). Reads/list/search are NOT audited —
//     keeping the log focused on "what changed who when" instead of
//     drowning it in routine browsing noise.
//
//   - The log lives in its own bolt DB file alongside the main store.
//     Decoupling means audit growth (or a corrupted index) can never
//     compromise authoritative user data.
//
//   - Entries are keyed by `<8-byte-big-endian-unix-nano><4-byte-seq>`
//     so a forward scan of the bucket yields entries in chronological
//     order — paging "newest 50" is just a reverse cursor walk.
//
// Stage 1 ships the storage + ingest. Stage 8 builds the admin UI on
// top via `Query`.
package audit

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/filebrowser/filebrowser/v2/events"
)

// entryBucket is the bbolt bucket holding all Entry rows, keyed by the
// 12-byte timestamp+seq composite for natural chronological order.
var entryBucket = []byte("audit_log")

// Entry is one persisted row in the audit log. Mapped 1:1 from a
// published events.Event; the Action field carries the event's
// wire-stable Type string so consumers can switch on it without
// importing the events package.
type Entry struct {
	// Seq is the monotonically-incrementing sequence within a single
	// nanosecond. Almost always 0; the suffix exists so two events
	// stamped at the same nanosecond don't collide in the bucket.
	Seq uint32 `json:"seq"`

	// Timestamp is when the event was published. Comes from the event's
	// embedded Base — preserving it through the log means we don't lose
	// the original event time if persistence is delayed.
	Timestamp time.Time `json:"timestamp"`

	// UserID identifies who performed the action. Zero for unauthenticated
	// or system-triggered events.
	UserID uint `json:"userId"`

	// Action is the event's wire-stable type string, e.g. "file.renamed".
	Action string `json:"action"`

	// Path is the primary path the event acted on. For two-path events
	// (rename / move / copy) this is the destination; the source path
	// lives in Payload under "from".
	Path string `json:"path,omitempty"`

	// IP is the remote address the request came from, when known.
	IP string `json:"ip,omitempty"`

	// Payload is the full original event marshalled to JSON. Lets
	// consumers recover event-specific fields (sizes, share IDs, etc.)
	// without needing a per-event column in this struct.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Filter narrows a Query call. All fields are optional; the zero value
// matches every entry. The filter applies AND semantics — a row must
// satisfy every set predicate to be returned.
type Filter struct {
	// UserID matches only entries with this user ID. Zero means "any".
	UserID uint

	// Action matches only entries with this exact action string. Empty
	// means "any".
	Action string

	// Since matches only entries at-or-after this timestamp. Zero means
	// "no lower bound".
	Since time.Time

	// Until matches only entries strictly before this timestamp. Zero
	// means "no upper bound".
	Until time.Time

	// PathPrefix matches only entries whose Path starts with this string.
	// Empty means "any".
	PathPrefix string

	// Limit caps the number of returned entries. Zero means "no cap".
	Limit int

	// Offset skips this many matching entries before collecting. Combined
	// with Limit for naive paging.
	Offset int
}

// Log is the audit log handle. Construct with New; close with Close.
type Log struct {
	db *bolt.DB

	// seq monotonically increments to disambiguate entries written in
	// the same nanosecond. Reset to 0 whenever the high-bits timestamp
	// rolls over (rare on modern hardware but cheap to handle).
	seqMu      sync.Mutex
	seq        uint32
	lastNanoTs int64

	// attached tracks whether Attach has been called so we can refuse
	// double-attach (which would persist every event twice).
	attached atomic.Bool
}

// New opens (or creates) the audit log bolt DB at dbPath.
func New(dbPath string) (*Log, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("audit: open db: %w", err)
	}
	err = db.Update(func(tx *bolt.Tx) error {
		_, e := tx.CreateBucketIfNotExists(entryBucket)
		return e
	})
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("audit: create bucket: %w", err)
	}
	return &Log{db: db}, nil
}

// Close releases the underlying bolt DB.
func (l *Log) Close() error {
	return l.db.Close()
}

// Attach registers a subscriber on the events bus. The provided subscribe
// func is typically `events.Subscribe`. Returns the unsubscribe handle
// that the caller should invoke at shutdown.
//
// Calling Attach twice on the same Log is a programmer error — both
// subscriptions would write each event, producing duplicates — and is
// rejected via panic.
func (l *Log) Attach(subscribe func(func(events.Event)) (unsubscribe func())) func() {
	if !l.attached.CompareAndSwap(false, true) {
		panic("audit: Log.Attach called twice on the same Log")
	}
	return subscribe(func(e events.Event) {
		// Best-effort: on persistence failure, log but don't propagate —
		// the file op that triggered the event must not fail just
		// because audit ingest hit an error. The events package wraps
		// each subscriber in recover() already.
		if err := l.Record(e); err != nil {
			// log without importing the project's logger here; stdlib
			// log.Printf goes to the same destination as other infra
			// startup messages.
			fmt.Printf("audit: record %s failed: %v\n", e.Type(), err)
		}
	})
}

// Record persists ev as an Entry. Exposed publicly so tests can drive
// the log without an events bus, and so non-event call sites (e.g., a
// future explicit audit.Log.Record from a CLI command) can ingest
// directly.
func (l *Log) Record(e events.Event) error {
	entry := buildEntry(e)
	key, err := l.nextKey(entry.Timestamp)
	if err != nil {
		return err
	}
	entry.Seq = binary.BigEndian.Uint32(key[8:])

	val, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("audit: marshal entry: %w", err)
	}
	return l.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(entryBucket)
		if b == nil {
			return errors.New("audit: bucket missing")
		}
		return b.Put(key, val)
	})
}

// nextKey builds the 12-byte composite key for the entry being written
// right now. The sequence counter increments within the same nanosecond
// and resets when the nanosecond advances.
func (l *Log) nextKey(ts time.Time) ([]byte, error) {
	l.seqMu.Lock()
	defer l.seqMu.Unlock()

	nanos := ts.UnixNano()
	if nanos == l.lastNanoTs {
		l.seq++
	} else {
		l.seq = 0
		l.lastNanoTs = nanos
	}

	key := make([]byte, 12)
	binary.BigEndian.PutUint64(key[:8], uint64(nanos))
	binary.BigEndian.PutUint32(key[8:], l.seq)
	return key, nil
}

// Query returns entries matching f, oldest-first. Pass Filter{} to get
// every row. The Limit/Offset fields enable naive paging — for the
// Stage 8 admin UI we'll want to wrap this in cursor-style paging, but
// for now offset is fine since the log won't be enormous in v1.3.
func (l *Log) Query(f Filter) ([]Entry, error) {
	var out []Entry
	matched := 0

	err := l.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(entryBucket)
		if b == nil {
			return nil
		}
		c := b.Cursor()

		// Apply Since as a seek hint so we don't scan the entire bucket
		// when the caller only wants recent entries.
		var k, v []byte
		if !f.Since.IsZero() {
			seek := make([]byte, 12)
			binary.BigEndian.PutUint64(seek[:8], uint64(f.Since.UnixNano()))
			k, v = c.Seek(seek)
		} else {
			k, v = c.First()
		}

		for ; k != nil; k, v = c.Next() {
			// Until is exclusive — short-circuit once we pass it so we
			// don't decode the rest of the bucket.
			if !f.Until.IsZero() {
				kNanos := int64(binary.BigEndian.Uint64(k[:8]))
				if kNanos >= f.Until.UnixNano() {
					break
				}
			}

			var e Entry
			if err := json.Unmarshal(v, &e); err != nil {
				// A corrupt row shouldn't break the whole query; skip it.
				continue
			}
			if !filterMatches(e, f) {
				continue
			}
			matched++
			if matched <= f.Offset {
				continue
			}
			out = append(out, e)
			if f.Limit > 0 && len(out) >= f.Limit {
				break
			}
		}
		return nil
	})
	return out, err
}

// Count returns the total number of entries currently persisted. Mostly
// useful for tests + the Stage 8 admin "audit log: N entries" header.
func (l *Log) Count() (int, error) {
	var n int
	err := l.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(entryBucket)
		if b == nil {
			return nil
		}
		n = b.Stats().KeyN
		return nil
	})
	return n, err
}

// buildEntry maps a concrete event type onto an Entry, picking a sensible
// primary Path and stashing the full event in Payload for type-specific
// fields. New event types added in the events package need a case here —
// the default falls back to Action + Payload only.
func buildEntry(e events.Event) Entry {
	// Marshal the whole event first so Payload survives even when the
	// type switch below doesn't pull out specific fields.
	payload, _ := json.Marshal(e)

	base := Entry{
		Timestamp: e.Timestamp(),
		Action:    e.Type(),
		Payload:   payload,
	}

	switch v := e.(type) {
	case events.FileCreated:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.Path
	case events.FileRenamed:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.To
	case events.FileMoved:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.To
	case events.FileCopied:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.To
	case events.FileDeleted:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.Path
	case events.FileUploaded:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.Path
	case events.ShareGranted:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.Path
	case events.ShareRevoked:
		base.UserID = v.UserID
		base.IP = v.IP
		base.Path = v.Path
	case events.UserLoggedIn:
		base.UserID = v.UserID
		base.IP = v.IP
	case events.UserLoggedOut:
		base.UserID = v.UserID
		base.IP = v.IP
	case events.SettingsChanged:
		base.UserID = v.UserID
		base.IP = v.IP
	}
	return base
}

// filterMatches returns true if e satisfies every set predicate on f.
// Time bounds are handled in the caller (via Seek + the Until break) so
// we don't duplicate that check here.
func filterMatches(e Entry, f Filter) bool {
	if f.UserID != 0 && e.UserID != f.UserID {
		return false
	}
	if f.Action != "" && e.Action != f.Action {
		return false
	}
	if f.PathPrefix != "" && !strings.HasPrefix(e.Path, f.PathPrefix) {
		return false
	}
	return true
}
