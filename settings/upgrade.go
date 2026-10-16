package settings

import (
	"time"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// UpgradeNotice records a database upgrade so admins are told about it once
// (4.0 Phase 6, 5.7): which schema it went from and to, where the copy of the
// old database is, and when it happened.
type UpgradeNotice struct {
	From   int       `json:"from"`
	To     int       `json:"to"`
	Backup string    `json:"backup"`
	At     time.Time `json:"at"`
}

// UpgradeNoticeBackend is implemented by backends that keep an upgrade
// notice. It is separate from StorageBackend so other backends need not.
type UpgradeNoticeBackend interface {
	GetUpgradeNotice() (*UpgradeNotice, error)
	SaveUpgradeNotice(*UpgradeNotice) error
	DeleteUpgradeNotice() error
}

// UpgradeNotice returns the pending notice, or fberrors.ErrNotExist when
// there is none.
func (s *Storage) UpgradeNotice() (*UpgradeNotice, error) {
	b, ok := s.back.(UpgradeNoticeBackend)
	if !ok {
		return nil, fberrors.ErrNotExist
	}
	return b.GetUpgradeNotice()
}

// SaveUpgradeNotice stores a notice for admins to see.
func (s *Storage) SaveUpgradeNotice(n *UpgradeNotice) error {
	b, ok := s.back.(UpgradeNoticeBackend)
	if !ok {
		return nil
	}
	return b.SaveUpgradeNotice(n)
}

// ClearUpgradeNotice removes the notice (an admin dismissed it). Clearing
// when there is none is not an error.
func (s *Storage) ClearUpgradeNotice() error {
	b, ok := s.back.(UpgradeNoticeBackend)
	if !ok {
		return nil
	}
	return b.DeleteUpgradeNotice()
}
