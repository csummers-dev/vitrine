// Package webhooks delivers file-change notifications to admin-configured
// HTTP endpoints (v1.3 S8-2).
//
// Design (locked decisions):
//   - **Admin-global.** Endpoints are a single global set; any file event
//     server-wide is eligible. Payloads are plain JSON POSTs, signed with
//     HMAC-SHA256 when the endpoint has a secret (4.0 Phase 4.3, see
//     sign.go); unsigned endpoints keep working.
//   - **Presets.** A Jellyfin endpoint asks the server for a library scan,
//     at most once a minute, instead of POSTing payloads.
//   - **Own bolt DB file** (`<dbName>-webhooks.db`, sibling of the main
//     store) so endpoint config + last-delivery status live apart from
//     authoritative user data — same pattern as audit/ and tags/.
//   - Delivery is **backgrounded** (the events bus is synchronous, so the
//     subscriber must never block a file op on a network call) with
//     bounded concurrency + retry/backoff. See dispatcher.go.
package webhooks

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	bolt "go.etcd.io/bbolt"
)

var endpointBucket = []byte("webhook_endpoints")

// ErrNotFound is returned when an endpoint id doesn't exist.
var ErrNotFound = errors.New("webhooks: endpoint not found")

// Endpoint is one configured webhook target.
type Endpoint struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	// Events is the per-endpoint event-type filter. Empty means "all
	// file events".
	Events []string `json:"events"`

	// Kind is "" (generic POST) or "jellyfin" (library refresh).
	Kind string `json:"kind,omitempty"`
	// Paths limits the endpoint to changes in these folders (as the acting
	// user sees them); empty means everywhere.
	Paths []string `json:"paths,omitempty"`
	// AllowLocal lets the endpoint reach private and loopback addresses
	// (a Jellyfin server on the LAN). Link-local and metadata addresses
	// stay blocked.
	AllowLocal bool `json:"allowLocal,omitempty"`
	// Secret signs deliveries; APIKey authenticates to Jellyfin. Both are
	// write-only: Public() blanks them for API responses.
	Secret    string `json:"secret,omitempty"`
	APIKey    string `json:"apiKey,omitempty"`
	HasSecret bool   `json:"hasSecret,omitempty"`
	HasAPIKey bool   `json:"hasApiKey,omitempty"`

	// Last-delivery status, updated after each POST (incl. the Test
	// button) so the UI can show health at a glance.
	LastStatus string     `json:"lastStatus,omitempty"` // "" | "success" | "failed"
	LastCode   int        `json:"lastCode,omitempty"`
	LastError  string     `json:"lastError,omitempty"`
	LastAt     *time.Time `json:"lastAt,omitempty"`
}

// Public is the endpoint as the API returns it: secrets replaced by flags.
func (e Endpoint) Public() Endpoint {
	e.HasSecret = e.Secret != ""
	e.HasAPIKey = e.APIKey != ""
	e.Secret = ""
	e.APIKey = ""
	return e
}

// Store is the webhook-endpoint persistence handle.
type Store struct {
	db *bolt.DB
}

// New opens (or creates) the webhooks bolt DB at dbPath.
func New(dbPath string) (*Store, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("webhooks: open db: %w", err)
	}
	if err := db.Update(func(tx *bolt.Tx) error {
		_, e := tx.CreateBucketIfNotExists(endpointBucket)
		return e
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("webhooks: create bucket: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the underlying bolt DB.
func (s *Store) Close() error { return s.db.Close() }

// List returns all endpoints, ordered by numeric id.
func (s *Store) List() ([]Endpoint, error) {
	var out []Endpoint
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(endpointBucket)
		if b == nil {
			return nil
		}
		return b.ForEach(func(_, v []byte) error {
			var ep Endpoint
			if err := json.Unmarshal(v, &ep); err != nil {
				return err
			}
			out = append(out, ep)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool {
		ai, _ := strconv.Atoi(out[i].ID)
		bi, _ := strconv.Atoi(out[j].ID)
		return ai < bi
	})
	return out, nil
}

// Get returns the endpoint with id, or (nil, nil) if absent.
func (s *Store) Get(id string) (*Endpoint, error) {
	var ep Endpoint
	found := false
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(endpointBucket)
		if b == nil {
			return nil
		}
		v := b.Get([]byte(id))
		if v == nil {
			return nil
		}
		found = true
		return json.Unmarshal(v, &ep)
	})
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &ep, nil
}

// Create assigns a fresh id (bucket sequence) and stores ep.
func (s *Store) Create(ep *Endpoint) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(endpointBucket)
		seq, err := b.NextSequence()
		if err != nil {
			return err
		}
		ep.ID = strconv.FormatUint(seq, 10)
		val, err := json.Marshal(ep)
		if err != nil {
			return err
		}
		return b.Put([]byte(ep.ID), val)
	})
}

// Update overwrites an existing endpoint (id must already exist).
func (s *Store) Update(ep *Endpoint) error {
	existing, err := s.Get(ep.ID)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrNotFound
	}
	// Preserve last-delivery status across config edits.
	ep.LastStatus = existing.LastStatus
	ep.LastCode = existing.LastCode
	ep.LastError = existing.LastError
	ep.LastAt = existing.LastAt
	// Secrets are write-only: an edit that doesn't send one keeps it.
	ep.Secret = existing.Secret
	if ep.APIKey == "" {
		ep.APIKey = existing.APIKey
	}
	ep.HasSecret, ep.HasAPIKey = false, false
	return s.put(ep)
}

// SetSecret replaces (or, with "", removes) an endpoint's signing secret.
func (s *Store) SetSecret(id, secret string) error {
	ep, err := s.Get(id)
	if err != nil {
		return err
	}
	if ep == nil {
		return ErrNotFound
	}
	ep.Secret = secret
	return s.put(ep)
}

// Delete removes an endpoint by id (no-op if absent).
func (s *Store) Delete(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(endpointBucket)
		if b == nil {
			return nil
		}
		return b.Delete([]byte(id))
	})
}

// RecordDelivery stamps the outcome of a POST onto the endpoint. Failures
// are swallowed — a delivery-status write must never disrupt anything.
func (s *Store) RecordDelivery(id, status string, code int, errMsg string) {
	ep, err := s.Get(id)
	if err != nil || ep == nil {
		return
	}
	now := time.Now()
	ep.LastStatus = status
	ep.LastCode = code
	ep.LastError = errMsg
	ep.LastAt = &now
	_ = s.put(ep)
}

func (s *Store) put(ep *Endpoint) error {
	val, err := json.Marshal(ep)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(endpointBucket).Put([]byte(ep.ID), val)
	})
}
