package bolt

import (
	"errors"

	"github.com/asdine/storm/v3"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
	"github.com/csummers-dev/vitrine/v4/twofactor"
)

type twoFactorBackend struct {
	db *storm.DB
}

func (b twoFactorBackend) Get(userID uint) (*twofactor.Factor, error) {
	var r twofactor.Factor
	err := b.db.One("UserID", userID, &r)
	if errors.Is(err, storm.ErrNotFound) {
		return nil, fberrors.ErrNotExist
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (b twoFactorBackend) Save(r *twofactor.Factor) error {
	return b.db.Save(r)
}

func (b twoFactorBackend) Delete(userID uint) error {
	err := b.db.DeleteStruct(&twofactor.Factor{UserID: userID})
	if errors.Is(err, storm.ErrNotFound) {
		return fberrors.ErrNotExist
	}
	return err
}
