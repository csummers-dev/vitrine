// Package tags is the per-user tag store + file↔tag mapping that
// underpins v1.3's tagging UX (chips on listing rows, tag picker
// SlideOver, smart-folder queries).
//
// Per docs/architecture-v1.3.md, design decisions baked in here:
//
//   - **Per-user ownership.** Tags don't leak between users. Every
//     operation takes a userID; the on-disk layout nests buckets by
//     user (`tags/<userID>/<tagID>`, `file_tags/<userID>/<path>`). Tag
//     IDs are scoped within a user (per-user NextSequence), which is
//     fine because the API always carries auth context.
//
//   - **Separate bolt DB file** (`<dbName>-tags.db`, sibling of the
//     main + audit DBs). Same backup story as audit; same isolation
//     story as cache.
//
//   - **Path-follow happens here** via RenamePath / PurgePath; the
//     events-bus subscriber (S2-2) is just a thin wrapper that maps
//     FileRenamed/FileMoved/FileDeleted onto these methods. FileCopied
//     is intentionally NOT wired — tags don't follow copies (the
//     locked Stage 2 decision).
//
//   - **DeleteTag cascades** through every file_tags entry to drop the
//     deleted ID. Acceptable cost since tag deletion is rare and
//     keeping orphan IDs around would corrupt batch reads downstream.
//
// Concurrency: safe for concurrent calls from multiple goroutines.
// Read paths take an RLock so many concurrent listings don't serialize.
package tags

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
)

var (
	tagsBucket     = []byte("tags")
	fileTagsBucket = []byte("file_tags")
)

// ValidColors is the locked 8-color palette. Names are wire-stable —
// the frontend maps them to CSS variables (`--tag-color-<name>`); the
// server validates against this set to reject invalid persistence.
var ValidColors = []string{
	"lilac", "blue", "green", "amber",
	"red", "pink", "slate", "teal",
}

// DefaultColor is the fallback when a caller doesn't specify one.
const DefaultColor = "lilac"

var validColorSet = func() map[string]struct{} {
	m := make(map[string]struct{}, len(ValidColors))
	for _, c := range ValidColors {
		m[c] = struct{}{}
	}
	return m
}()

// Error sentinels — exported so HTTP handlers can map them to status
// codes (404 for NotFound, 400 for InvalidColor + DuplicateName, etc).
var (
	ErrInvalidColor  = errors.New("tags: invalid color")
	ErrInvalidName   = errors.New("tags: name must be non-empty")
	ErrTagNotFound   = errors.New("tags: tag not found")
	ErrDuplicateName = errors.New("tags: tag with this name already exists")
)

// Tag is one row in the per-user tags bucket.
type Tag struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
}

// Store is the tags persistence handle. Construct with New; close with
// Close. The zero value is not usable.
type Store struct {
	db *bolt.DB
	// RWMutex guards the in-process consistency of cascading operations
	// (DeleteTag → purge file_tags, RenamePath for directories). bbolt's
	// own transactions are serializable, but we hold an additional
	// RWMutex so a long-running directory rename doesn't interleave with
	// a concurrent DeleteTag and leave the index in a half-applied state.
	mu sync.RWMutex
}

// New opens (or creates) the tags bolt DB at dbPath and initializes
// the root buckets.
func New(dbPath string) (*Store, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("tags: open db: %w", err)
	}
	err = db.Update(func(tx *bolt.Tx) error {
		if _, e := tx.CreateBucketIfNotExists(tagsBucket); e != nil {
			return e
		}
		if _, e := tx.CreateBucketIfNotExists(fileTagsBucket); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("tags: init buckets: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the underlying bolt DB.
func (s *Store) Close() error { return s.db.Close() }

// ── Internal helpers ────────────────────────────────────────────────

func validateColor(c string) error {
	if _, ok := validColorSet[c]; !ok {
		return fmt.Errorf("%w: %q (valid: %s)", ErrInvalidColor, c, strings.Join(ValidColors, ", "))
	}
	return nil
}

func userKey(userID uint) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(userID))
	return b
}

func tagKey(tagID uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, tagID)
	return b
}

// userBucket returns the per-user sub-bucket under root. When create is
// true the sub-bucket is created on demand; otherwise nil is returned
// (the user simply has no entries yet).
func userBucket(tx *bolt.Tx, root []byte, userID uint, create bool) (*bolt.Bucket, error) {
	r := tx.Bucket(root)
	if r == nil {
		return nil, fmt.Errorf("tags: root bucket %q missing", root)
	}
	key := userKey(userID)
	sub := r.Bucket(key)
	if sub == nil && create {
		return r.CreateBucket(key)
	}
	return sub, nil
}

// encodeIDs / decodeIDs serialize a tag-ID list as a packed big-endian
// uint64 array — compact and O(1) to read into a Go slice. We dedupe +
// sort on encode so the on-disk shape is canonical (makes diffs in
// debug dumps readable, and means equality checks on the raw bytes
// work for "did the tag set change").
func encodeIDs(ids []uint64) []byte {
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	// Dedup in-place.
	out := ids[:0]
	var last uint64
	for i, id := range ids {
		if i == 0 || id != last {
			out = append(out, id)
		}
		last = id
	}
	buf := make([]byte, 8*len(out))
	for i, id := range out {
		binary.BigEndian.PutUint64(buf[i*8:(i+1)*8], id)
	}
	return buf
}

func decodeIDs(buf []byte) []uint64 {
	if len(buf)%8 != 0 {
		// Corrupt row — treat as empty rather than crashing. Caller can
		// log; we don't want a single bad entry to break the listing.
		return nil
	}
	out := make([]uint64, len(buf)/8)
	for i := range out {
		out[i] = binary.BigEndian.Uint64(buf[i*8 : (i+1)*8])
	}
	return out
}

// ── Tag CRUD ────────────────────────────────────────────────────────

// CreateTag adds a new tag for userID. name is trimmed and required;
// color falls back to DefaultColor when empty. Returns ErrDuplicateName
// if userID already has a tag with this name (case-insensitive).
func (s *Store) CreateTag(userID uint, name, color string) (*Tag, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidName
	}
	if color == "" {
		color = DefaultColor
	}
	if err := validateColor(color); err != nil {
		return nil, err
	}

	var created *Tag
	err := s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, tagsBucket, userID, true)
		if e != nil {
			return e
		}
		// Duplicate-name check: cursor-walk the user's tags. Linear in
		// tag count which is fine for the homelab scale (low hundreds).
		lower := strings.ToLower(name)
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var t Tag
			if json.Unmarshal(v, &t) == nil && strings.ToLower(t.Name) == lower {
				return ErrDuplicateName
			}
		}
		id, e := b.NextSequence()
		if e != nil {
			return e
		}
		t := Tag{
			ID:        id,
			Name:      name,
			Color:     color,
			CreatedAt: time.Now().UTC(),
		}
		buf, e := json.Marshal(t)
		if e != nil {
			return e
		}
		if e := b.Put(tagKey(id), buf); e != nil {
			return e
		}
		created = &t
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// ListTags returns every tag owned by userID, sorted by name (case-
// insensitive). Returns an empty slice — not nil — when the user has
// none, so JSON encoders emit `[]` instead of `null`.
func (s *Store) ListTags(userID uint) ([]*Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := []*Tag{}
	err := s.db.View(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil || b == nil {
			return e
		}
		return b.ForEach(func(_, v []byte) error {
			var t Tag
			if json.Unmarshal(v, &t) == nil {
				out = append(out, &t)
			}
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

// GetTag fetches a single tag by ID. Returns ErrTagNotFound if missing.
func (s *Store) GetTag(userID uint, tagID uint64) (*Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out *Tag
	err := s.db.View(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil || b == nil {
			return ErrTagNotFound
		}
		v := b.Get(tagKey(tagID))
		if v == nil {
			return ErrTagNotFound
		}
		var t Tag
		if e := json.Unmarshal(v, &t); e != nil {
			return e
		}
		out = &t
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// UpdateTag mutates the tag's name and/or color in place. Empty fields
// are treated as "leave alone" — pass the existing value to keep it.
// Returns the updated tag.
func (s *Store) UpdateTag(userID uint, tagID uint64, name, color string) (*Tag, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if color != "" {
		if err := validateColor(color); err != nil {
			return nil, err
		}
	}

	var out *Tag
	err := s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil || b == nil {
			return ErrTagNotFound
		}
		v := b.Get(tagKey(tagID))
		if v == nil {
			return ErrTagNotFound
		}
		var t Tag
		if e := json.Unmarshal(v, &t); e != nil {
			return e
		}
		// Name change must respect duplicate constraint.
		if name != "" && name != t.Name {
			lower := strings.ToLower(name)
			c := b.Cursor()
			for k, val := c.First(); k != nil; k, val = c.Next() {
				if binary.BigEndian.Uint64(k) == tagID {
					continue
				}
				var existing Tag
				if json.Unmarshal(val, &existing) == nil &&
					strings.ToLower(existing.Name) == lower {
					return ErrDuplicateName
				}
			}
			t.Name = name
		}
		if color != "" {
			t.Color = color
		}
		buf, e := json.Marshal(t)
		if e != nil {
			return e
		}
		if e := b.Put(tagKey(tagID), buf); e != nil {
			return e
		}
		out = &t
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteTag removes the tag AND purges every file_tags entry that
// references it. Idempotent — deleting a missing tag returns nil so
// repeated delete calls don't fail loudly.
func (s *Store) DeleteTag(userID uint, tagID uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		// Remove the tag itself.
		tb, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil {
			return e
		}
		if tb != nil {
			if e := tb.Delete(tagKey(tagID)); e != nil {
				return e
			}
		}
		// Cascade: walk this user's file_tags and drop tagID from every
		// list it appears in. Skip empty results — leaving a `[]` value
		// is wasted bytes vs. a Delete.
		ftb, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || ftb == nil {
			return nil
		}
		// Collect updates outside the cursor walk so we don't mutate
		// the bucket while iterating.
		type update struct {
			key []byte
			buf []byte
			del bool
		}
		var updates []update
		c := ftb.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			ids := decodeIDs(v)
			next := ids[:0]
			for _, id := range ids {
				if id != tagID {
					next = append(next, id)
				}
			}
			if len(next) == len(ids) {
				continue // tag not referenced; nothing to do
			}
			// Copy key — bolt invalidates it after the iteration.
			kc := append([]byte(nil), k...)
			if len(next) == 0 {
				updates = append(updates, update{key: kc, del: true})
			} else {
				updates = append(updates, update{key: kc, buf: encodeIDs(next)})
			}
		}
		for _, u := range updates {
			if u.del {
				if e := ftb.Delete(u.key); e != nil {
					return e
				}
			} else {
				if e := ftb.Put(u.key, u.buf); e != nil {
					return e
				}
			}
		}
		return nil
	})
}

// ── File ↔ tag mapping ──────────────────────────────────────────────

// AddTag attaches tagID to the given path. No-op if the path already
// has the tag (encodeIDs dedupes). Returns ErrTagNotFound if the tag
// doesn't exist — preventing dangling references in file_tags.
func (s *Store) AddTag(userID uint, path string, tagID uint64) error {
	if _, err := s.GetTag(userID, tagID); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, fileTagsBucket, userID, true)
		if e != nil {
			return e
		}
		ids := decodeIDs(b.Get([]byte(path)))
		ids = append(ids, tagID)
		return b.Put([]byte(path), encodeIDs(ids))
	})
}

// RemoveTag detaches tagID from the given path. No-op if the path
// doesn't have the tag.
func (s *Store) RemoveTag(userID uint, path string, tagID uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || b == nil {
			return nil
		}
		v := b.Get([]byte(path))
		if v == nil {
			return nil
		}
		ids := decodeIDs(v)
		next := ids[:0]
		for _, id := range ids {
			if id != tagID {
				next = append(next, id)
			}
		}
		if len(next) == 0 {
			return b.Delete([]byte(path))
		}
		return b.Put([]byte(path), encodeIDs(next))
	})
}

// TagsForFile returns the full Tag objects attached to path, sorted by
// name. Missing tag IDs (e.g., race with DeleteTag) are silently
// skipped — returning a partial list beats failing the whole call.
func (s *Store) TagsForFile(userID uint, path string) ([]*Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := []*Tag{}
	err := s.db.View(func(tx *bolt.Tx) error {
		ftb, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || ftb == nil {
			return nil
		}
		ids := decodeIDs(ftb.Get([]byte(path)))
		if len(ids) == 0 {
			return nil
		}
		tb, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil || tb == nil {
			return nil
		}
		for _, id := range ids {
			v := tb.Get(tagKey(id))
			if v == nil {
				continue
			}
			var t Tag
			if json.Unmarshal(v, &t) == nil {
				out = append(out, &t)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

// FilesForTag returns every path tagged with tagID, sorted
// lexicographically.
func (s *Store) FilesForTag(userID uint, tagID uint64) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := []string{}
	err := s.db.View(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || b == nil {
			return nil
		}
		return b.ForEach(func(k, v []byte) error {
			for _, id := range decodeIDs(v) {
				if id == tagID {
					out = append(out, string(k))
					return nil
				}
			}
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(out)
	return out, nil
}

// BatchTagsForFiles fetches tags for many paths in a single read txn,
// keyed by path. Built to avoid N+1 lookups when rendering a listing
// where every row needs its tag set. Paths with no tags are omitted
// from the map (callers check existence + fall back to empty).
func (s *Store) BatchTagsForFiles(userID uint, paths []string) (map[string][]*Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make(map[string][]*Tag)
	err := s.db.View(func(tx *bolt.Tx) error {
		ftb, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || ftb == nil {
			return nil
		}
		tb, e := userBucket(tx, tagsBucket, userID, false)
		if e != nil || tb == nil {
			return nil
		}
		// Cache tags by ID across the loop — reading the same tag once
		// per path it appears on would re-decode the JSON repeatedly.
		tagCache := make(map[uint64]*Tag)
		for _, p := range paths {
			ids := decodeIDs(ftb.Get([]byte(p)))
			if len(ids) == 0 {
				continue
			}
			var tags []*Tag
			for _, id := range ids {
				t, ok := tagCache[id]
				if !ok {
					v := tb.Get(tagKey(id))
					if v == nil {
						continue
					}
					t = &Tag{}
					if json.Unmarshal(v, t) != nil {
						continue
					}
					tagCache[id] = t
				}
				tags = append(tags, t)
			}
			if len(tags) > 0 {
				sort.Slice(tags, func(i, j int) bool {
					return strings.ToLower(tags[i].Name) < strings.ToLower(tags[j].Name)
				})
				out[p] = tags
			}
		}
		return nil
	})
	return out, err
}

// ── Path maintenance (events bus subscriber wires into these) ───────

// RenamePath rekeys file_tags entries from `from` to `to`. Handles two
// cases:
//
//   - Single-file rename: just rekey the one entry at `from`.
//   - Directory rename: rekey every descendant whose key starts with
//     `from + "/"`, preserving the suffix beyond `from`.
//
// A single-file rename where `from` doesn't have any tags is a no-op
// (which is fine — most files are untagged).
func (s *Store) RenamePath(userID uint, from, to string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || b == nil {
			return nil
		}

		// Single-file rekey first.
		if v := b.Get([]byte(from)); v != nil {
			// Copy the value because Delete invalidates it.
			buf := append([]byte(nil), v...)
			if e := b.Delete([]byte(from)); e != nil {
				return e
			}
			if e := b.Put([]byte(to), buf); e != nil {
				return e
			}
		}

		// Directory cascade: any key with `from/` prefix moves to `to/<rest>`.
		// Collect first so we don't mutate while iterating.
		prefix := from
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		newPrefix := to
		if !strings.HasSuffix(newPrefix, "/") {
			newPrefix += "/"
		}

		type rekey struct {
			oldKey []byte
			newKey []byte
			val    []byte
		}
		var rekeys []rekey
		c := b.Cursor()
		for k, v := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, v = c.Next() {
			suffix := string(k)[len(prefix):]
			rekeys = append(rekeys, rekey{
				oldKey: append([]byte(nil), k...),
				newKey: []byte(newPrefix + suffix),
				val:    append([]byte(nil), v...),
			})
		}
		for _, r := range rekeys {
			if e := b.Delete(r.oldKey); e != nil {
				return e
			}
			if e := b.Put(r.newKey, r.val); e != nil {
				return e
			}
		}
		return nil
	})
}

// PurgePath removes file_tags entries for path AND every descendant
// path (`path/`-prefixed). Called by the events subscriber on
// FileDeleted; directory delete fans out to all child entries.
func (s *Store) PurgePath(userID uint, path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		b, e := userBucket(tx, fileTagsBucket, userID, false)
		if e != nil || b == nil {
			return nil
		}

		// Remove the exact-match entry first.
		if e := b.Delete([]byte(path)); e != nil {
			return e
		}

		// Then collect every descendant key (path/...) and delete in a
		// second pass — see RenamePath for the same iterate-then-mutate
		// pattern rationale.
		prefix := path
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		var toDelete [][]byte
		c := b.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			toDelete = append(toDelete, append([]byte(nil), k...))
		}
		for _, k := range toDelete {
			if e := b.Delete(k); e != nil {
				return e
			}
		}
		return nil
	})
}
