// Package twofactor implements TOTP second-factor login (4.0 Phase 4.4):
// RFC 6238 codes, single-use recovery codes, encryption of secrets at rest,
// and short-lived signed challenges between the password and code steps.
//
// Everything here is standard library only. Records live in their own
// storm bucket (see storage/bolt), never on users.User, so a user object
// rendered to JSON can't leak a secret.
package twofactor

import (
	"errors"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// Factor is one user's second factor. (The type name is also its storm
// bucket name.)
type Factor struct {
	UserID uint `storm:"id" json:"userId"`
	// Secret is the base32 TOTP secret, sealed with the server key.
	Secret string `json:"secret"`
	// Enabled is false between setup and the first confirmed code.
	Enabled   bool  `json:"enabled"`
	EnabledAt int64 `json:"enabledAt,omitempty"`
	// Recovery holds hashes of the unused recovery codes.
	Recovery []string `json:"recovery,omitempty"`
	Salt     string   `json:"salt,omitempty"`
	// LastStep is the last accepted TOTP time step; a code is never
	// accepted twice.
	LastStep int64 `json:"lastStep,omitempty"`
}

// StorageBackend persists records.
type StorageBackend interface {
	Get(userID uint) (*Factor, error)
	Save(r *Factor) error
	Delete(userID uint) error
}

// Storage wraps a backend.
type Storage struct{ back StorageBackend }

// NewStorage returns a Storage over back.
func NewStorage(back StorageBackend) *Storage { return &Storage{back: back} }

// Get returns a user's record, or (nil, nil) when they have none.
func (s *Storage) Get(userID uint) (*Factor, error) {
	r, err := s.back.Get(userID)
	if errors.Is(err, fberrors.ErrNotExist) {
		return nil, nil
	}
	return r, err
}

// Enabled reports whether the user must give a second factor.
func (s *Storage) Enabled(userID uint) bool {
	r, err := s.Get(userID)
	return err == nil && r != nil && r.Enabled
}

// Save stores a record.
func (s *Storage) Save(r *Factor) error { return s.back.Save(r) }

// Delete removes a user's record (no error when there is none).
func (s *Storage) Delete(userID uint) error {
	err := s.back.Delete(userID)
	if errors.Is(err, fberrors.ErrNotExist) {
		return nil
	}
	return err
}
