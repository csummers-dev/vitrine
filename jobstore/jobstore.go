// Package jobstore persists in-flight transfer job metadata to a sibling bolt
// DB so a transfer interrupted by a server restart/crash reappears in the dock
// with a Retry affordance (2.4.0 Stage 3).
//
// Only IN-FLIGHT jobs are stored: the registry saves a record when a job is
// queued/running (and after each item completes) and forgets it the moment the
// job reaches a terminal state. So everything still in the store at startup was
// mid-flight when the process died — the registry restores each as an
// "interrupted" job. The record carries the items + per-item done flags (for
// partial-batch retry) but NOT the user's filesystem, which the authenticated
// Retry request rebuilds from its own context.
package jobstore

import (
	"encoding/json"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/csummers-dev/vitrine/v3/jobs"
)

var bucket = []byte("jobs")

// Store is the bolt-backed persistence for in-flight transfer jobs.
type Store struct {
	db *bolt.DB
}

// New opens (or creates) the job store at dbPath.
func New(dbPath string) (*Store, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(bucket)
		return err
	})
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close releases the bolt DB.
func (s *Store) Close() error { return s.db.Close() }

// Save writes (or overwrites) a job record. Wired as the registry's persist
// hook. Errors are swallowed by the caller — a failed progress write only
// costs precision on a crash, never correctness of the live transfer.
func (s *Store) Save(rec jobs.Record) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucket).Put([]byte(rec.ID), raw)
	})
}

// Delete drops a job record (wired as the registry's forget hook).
func (s *Store) Delete(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucket).Delete([]byte(id))
	})
}

// LoadAll returns every persisted record — the in-flight jobs to restore as
// interrupted at startup. Corrupt rows are skipped rather than failing boot.
func (s *Store) LoadAll() ([]jobs.Record, error) {
	var out []jobs.Record
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(bucket).ForEach(func(_, v []byte) error {
			var rec jobs.Record
			if err := json.Unmarshal(v, &rec); err != nil {
				return nil
			}
			out = append(out, rec)
			return nil
		})
	})
	return out, err
}
