// Package cache is a disk-backed key/value store with LRU eviction
// bounded by a size cap.
//
// It exists for v1.3.0 features that generate derived artifacts which
// are expensive to recompute but cheap to throw away — primarily
// server-side video thumbnails (Stage 6), with content-search indexes
// and future preview-format renders as likely later consumers.
//
// Architecture per docs/architecture-v1.3.md:
//   - Disk layout: <dir>/<2-char-hash-prefix>/<full-hash> for the value;
//     keeps any single directory from exploding into millions of files.
//   - Index: a small bbolt DB at <dir>/index.db mapping key → {size,
//     lastAccess}. Used by the eviction goroutine to pick LRU entries
//     without scanning every file on disk.
//   - Eviction: background goroutine ticks every EvictionInterval. When
//     total tracked size exceeds MaxSize, deletes least-recently-used
//     entries until back under cap.
//
// The package is intentionally decoupled from the main app's storm-
// wrapped BoltDB so cache pruning never touches authoritative data.
//
// Concurrency: safe for concurrent Get / Put / Delete from multiple
// goroutines. Eviction takes an internal write lock that briefly
// serializes against Puts.
package cache

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
)

// indexBucket is the bbolt bucket holding key → metaEntry.
var indexBucket = []byte("idx")

// EvictionInterval is how often the background goroutine checks
// whether eviction is needed. Public so tests can override.
var EvictionInterval = 5 * time.Minute

// Cache is a disk-backed LRU. Construct with New; close with Close.
type Cache struct {
	dir     string
	maxSize int64
	db      *bolt.DB

	// Background eviction lifecycle.
	stop chan struct{}
	done chan struct{}

	// Serializes Put + eviction so a Put isn't writing to a path the
	// evictor is in the middle of deleting. Reads (Get) take RLock so
	// many concurrent Gets are fine.
	mu sync.RWMutex
}

// metaEntry is the per-key index row. Stored little-endian so the
// fixed-size layout is easy to read back without a full JSON codec.
//
//	bytes 0–7:   size (uint64)
//	bytes 8–15:  lastAccess as unix-nano (int64)
type metaEntry struct {
	size       int64
	lastAccess time.Time
}

func encodeMeta(m metaEntry) []byte {
	buf := make([]byte, 16)
	binary.LittleEndian.PutUint64(buf[0:8], uint64(m.size))
	binary.LittleEndian.PutUint64(buf[8:16], uint64(m.lastAccess.UnixNano()))
	return buf
}

func decodeMeta(buf []byte) (metaEntry, error) {
	if len(buf) < 16 {
		return metaEntry{}, fmt.Errorf("cache: malformed meta entry, want 16 bytes got %d", len(buf))
	}
	return metaEntry{
		size:       int64(binary.LittleEndian.Uint64(buf[0:8])),
		lastAccess: time.Unix(0, int64(binary.LittleEndian.Uint64(buf[8:16]))),
	}, nil
}

// New opens (or creates) a Cache at dir with the given max size in
// bytes. The eviction goroutine starts immediately.
//
// A maxSize of 0 disables eviction entirely (cache grows forever);
// useful for tests but not what you want in production.
func New(dir string, maxSize int64) (*Cache, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("cache: mkdir %s: %w", dir, err)
	}

	db, err := bolt.Open(filepath.Join(dir, "index.db"), 0o600, &bolt.Options{
		Timeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("cache: open index: %w", err)
	}

	if err := db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(indexBucket)
		return err
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("cache: init bucket: %w", err)
	}

	c := &Cache{
		dir:     dir,
		maxSize: maxSize,
		db:      db,
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}

	go c.evictionLoop()
	return c, nil
}

// Get returns the value for key + true, or (nil, false) if missing.
// Also bumps the entry's lastAccess so it stays LRU-current.
func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	path := c.pathFor(key)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}

	// Touch the lastAccess timestamp. Best-effort — if the index update
	// fails we still return the data; eviction will eventually catch up.
	_ = c.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(indexBucket)
		raw := b.Get([]byte(key))
		if raw == nil {
			// On-disk file with no index row: re-index it. Possible if
			// the index got corrupted or a Put crashed mid-flight.
			return b.Put([]byte(key), encodeMeta(metaEntry{
				size:       int64(len(data)),
				lastAccess: time.Now(),
			}))
		}
		m, err := decodeMeta(raw)
		if err != nil {
			return nil
		}
		m.lastAccess = time.Now()
		return b.Put([]byte(key), encodeMeta(m))
	})

	return data, true
}

// Put writes content under key. Overwrites any existing entry.
// Eviction is NOT triggered synchronously — the background loop
// catches it on its next tick. Callers can tolerate brief overshoot
// of MaxSize between ticks; this avoids latency cliffs on every Put.
func (c *Cache) Put(key string, content []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	path := c.pathFor(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("cache: mkdir bucket: %w", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("cache: write %s: %w", key, err)
	}

	return c.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(indexBucket).Put([]byte(key), encodeMeta(metaEntry{
			size:       int64(len(content)),
			lastAccess: time.Now(),
		}))
	})
}

// Delete removes a single entry. Missing keys are not an error.
func (c *Cache) Delete(key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.deleteLocked(key)
}

// deleteLocked is the inner helper; caller must hold mu.
func (c *Cache) deleteLocked(key string) error {
	path := c.pathFor(key)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("cache: remove %s: %w", key, err)
	}
	return c.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(indexBucket).Delete([]byte(key))
	})
}

// Size returns the total bytes tracked in the index. A bounded estimate
// — it doesn't stat the disk, which would be slow for thousands of
// entries.
func (c *Cache) Size() int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var total int64
	_ = c.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(indexBucket).ForEach(func(_, v []byte) error {
			m, err := decodeMeta(v)
			if err != nil {
				return nil
			}
			total += m.size
			return nil
		})
	})
	return total
}

// Count returns the number of entries in the index.
func (c *Cache) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var n int
	_ = c.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(indexBucket).ForEach(func(_, _ []byte) error {
			n++
			return nil
		})
	})
	return n
}

// PurgeAll removes every cache entry. Admin-only escape hatch — wired
// to a Settings-page button in a later stage if needed.
func (c *Cache) PurgeAll() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.db.Update(func(tx *bolt.Tx) error {
		if err := tx.DeleteBucket(indexBucket); err != nil {
			return err
		}
		_, err := tx.CreateBucket(indexBucket)
		return err
	}); err != nil {
		return fmt.Errorf("cache: reset index: %w", err)
	}

	// Walk the cache dir and remove everything except the index file.
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return fmt.Errorf("cache: list dir: %w", err)
	}
	for _, e := range entries {
		if e.Name() == "index.db" {
			continue
		}
		if err := os.RemoveAll(filepath.Join(c.dir, e.Name())); err != nil {
			return fmt.Errorf("cache: remove %s: %w", e.Name(), err)
		}
	}
	return nil
}

// Close stops the eviction goroutine and closes the index DB.
// Safe to call multiple times.
func (c *Cache) Close() error {
	select {
	case <-c.stop:
		// Already closed.
	default:
		close(c.stop)
		<-c.done
	}
	return c.db.Close()
}

// pathFor returns the disk path for a key. Uses sha256 of the key so
// arbitrary key strings (paths, URLs) sanitize to safe filenames, and
// shards on the first 2 hex chars to keep any single dir small.
func (c *Cache) pathFor(key string) string {
	sum := sha256.Sum256([]byte(key))
	hex := hex.EncodeToString(sum[:])
	return filepath.Join(c.dir, hex[0:2], hex)
}

// evictionLoop is the background goroutine that enforces MaxSize. Runs
// until Close. Each tick: if Size() > maxSize, walk the index, sort by
// lastAccess ascending, delete oldest entries until back under cap.
//
// A 0 maxSize disables eviction (used by tests; not for production).
func (c *Cache) evictionLoop() {
	defer close(c.done)
	if c.maxSize <= 0 {
		<-c.stop
		return
	}
	t := time.NewTicker(EvictionInterval)
	defer t.Stop()
	for {
		select {
		case <-c.stop:
			return
		case <-t.C:
			c.evictOnce()
		}
	}
}

// EvictOnce runs a single eviction pass synchronously. Exposed for
// tests + the rare admin-trigger case. Production code shouldn't need
// to call this directly — the background loop handles it.
func (c *Cache) EvictOnce() {
	c.evictOnce()
}

func (c *Cache) evictOnce() {
	if c.maxSize <= 0 {
		return
	}

	// Snapshot index → slice we can sort. For a 2 GB cache with average
	// entry size of 100 KB, that's ~20k entries; sortable in
	// microseconds. If cache scales to millions of entries we'd switch
	// to a heap, but that's deferred until measured pain.
	type indexed struct {
		key   string
		size  int64
		atime time.Time
	}
	var entries []indexed
	var total int64

	c.mu.RLock()
	_ = c.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(indexBucket).ForEach(func(k, v []byte) error {
			m, err := decodeMeta(v)
			if err != nil {
				return nil
			}
			entries = append(entries, indexed{
				key:   string(k),
				size:  m.size,
				atime: m.lastAccess,
			})
			total += m.size
			return nil
		})
	})
	c.mu.RUnlock()

	if total <= c.maxSize {
		return
	}

	// Sort ascending by lastAccess — oldest first.
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0 && entries[j-1].atime.After(entries[j].atime); j-- {
			entries[j-1], entries[j] = entries[j], entries[j-1]
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	for _, e := range entries {
		if total <= c.maxSize {
			break
		}
		if err := c.deleteLocked(e.key); err == nil {
			total -= e.size
		}
	}
}
