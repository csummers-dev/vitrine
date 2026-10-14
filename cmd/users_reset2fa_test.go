package cmd

import (
	"path/filepath"
	"testing"

	"github.com/asdine/storm/v3"

	"github.com/csummers-dev/vitrine/v4/storage/bolt"
	"github.com/csummers-dev/vitrine/v4/twofactor"
	"github.com/csummers-dev/vitrine/v4/users"
)

func TestResetTwoFactor(t *testing.T) {
	db, err := storm.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	st, err := bolt.NewStorage(db)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"admin", "guest"} {
		if err := st.Users.Save(&users.User{Username: name, Password: "pw"}); err != nil {
			t.Fatal(err)
		}
	}
	admin, _ := st.Users.Get("", "admin")
	guest, _ := st.Users.Get("", "guest")
	for _, u := range []*users.User{admin, guest} {
		if err := st.TwoFactor.Save(&twofactor.Factor{UserID: u.ID, Enabled: true}); err != nil {
			t.Fatal(err)
		}
	}

	got, err := resetTwoFactor(st, "admin")
	if err != nil || got.ID != admin.ID {
		t.Fatalf("reset by name: %v, %+v", err, got)
	}
	if st.TwoFactor.Enabled(admin.ID) || !st.TwoFactor.Enabled(guest.ID) {
		t.Error("reset the wrong user")
	}
	// By id, and again with nothing left to reset.
	for range 2 {
		if _, err := resetTwoFactor(st, "2"); err != nil {
			t.Fatalf("reset by id: %v", err)
		}
	}
	if st.TwoFactor.Enabled(guest.ID) {
		t.Error("guest still has a second factor")
	}
	if _, err := resetTwoFactor(st, "nobody"); err == nil {
		t.Error("unknown user accepted")
	}
}
