package dupes

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"path"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/csummers-dev/vitrine/v4/events"
)

var hashBucket = []byte("hashes")

// HashStore keeps file hashes between scans in a sibling bolt file
// (<db>-hashes.db), keyed by user and scope-relative path. Entries also
// carry size and modified time, so a stale one is simply not used; file
// events remove entries for paths that went away or changed.
type HashStore struct {
	db *bolt.DB
}

// OpenHashStore opens (or creates) the hash store at dbPath.
func OpenHashStore(dbPath string) (*HashStore, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("dupes: open hash store: %w", err)
	}
	if err := db.Update(func(tx *bolt.Tx) error {
		_, e := tx.CreateBucketIfNotExists(hashBucket)
		return e
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("dupes: init hash store: %w", err)
	}
	return &HashStore{db: db}, nil
}

// Close releases the bolt file.
func (s *HashStore) Close() error { return s.db.Close() }

func hashKey(userID uint, p string) []byte {
	k := make([]byte, 8, 8+len(p))
	binary.BigEndian.PutUint64(k, uint64(userID))
	return append(k, path.Clean("/"+p)...)
}

// ForUser returns the Cache a scan for userID uses.
func (s *HashStore) ForUser(userID uint) Cache { return userCache{s: s, userID: userID} }

type userCache struct {
	s      *HashStore
	userID uint
}

func (c userCache) Lookup(paths []string) (map[string]Entry, error) {
	out := make(map[string]Entry, len(paths))
	err := c.s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(hashBucket)
		for _, p := range paths {
			v := b.Get(hashKey(c.userID, p))
			if v == nil {
				continue
			}
			var e Entry
			if json.Unmarshal(v, &e) == nil {
				out[p] = e
			}
		}
		return nil
	})
	return out, err
}

func (c userCache) Store(entries map[string]Entry) error {
	return c.s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(hashBucket)
		for p, e := range entries {
			v, err := json.Marshal(e)
			if err != nil {
				return err
			}
			if err := b.Put(hashKey(c.userID, p), v); err != nil {
				return err
			}
		}
		return nil
	})
}

// Forget drops the entries for p and everything under it.
func (s *HashStore) Forget(userID uint, p string) error {
	exact := hashKey(userID, p)
	prefix := append(bytes.Clone(exact), '/')
	if bytes.HasSuffix(exact, []byte("/")) { // the root
		prefix = exact
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(hashBucket)
		if err := b.Delete(exact); err != nil {
			return err
		}
		var doomed [][]byte
		cur := b.Cursor()
		for k, _ := cur.Seek(prefix); k != nil && bytes.HasPrefix(k, prefix); k, _ = cur.Next() {
			doomed = append(doomed, bytes.Clone(k))
		}
		for _, k := range doomed {
			if err := b.Delete(k); err != nil {
				return err
			}
		}
		return nil
	})
}

// Attach keeps the store tidy as files change. Returns the unsubscribe.
func (s *HashStore) Attach(subscribe func(func(events.Event)) func()) func() {
	return subscribe(func(e events.Event) {
		var uid uint
		var gone []string
		switch v := e.(type) {
		case events.FileDeleted:
			uid, gone = v.UserID, []string{v.Path}
		case events.FileModified:
			uid, gone = v.UserID, []string{v.Path}
		case events.FileUploaded:
			uid, gone = v.UserID, []string{v.Path}
		case events.FileRenamed:
			uid, gone = v.UserID, []string{v.From}
		case events.FileMoved:
			uid, gone = v.UserID, []string{v.From}
		case events.FilesChanged:
			uid = v.UserID
			for _, n := range v.Names {
				gone = append(gone, path.Join(v.Dir, n))
			}
		default:
			return
		}
		for _, p := range gone {
			_ = s.Forget(uid, p) // best effort: stale entries are ignored anyway
		}
	})
}
