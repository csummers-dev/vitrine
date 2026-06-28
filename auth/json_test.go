package auth_test

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/asdine/storm/v3"

	"github.com/filebrowser/filebrowser/v2/auth"
	"github.com/filebrowser/filebrowser/v2/settings"
	"github.com/filebrowser/filebrowser/v2/storage/bolt"
	"github.com/filebrowser/filebrowser/v2/users"
)

// newUserStore returns a bolt-backed users.Store seeded with one user
// ("alice" / "s3cret-pw").
func newUserStore(t *testing.T) users.Store {
	t.Helper()
	db, err := storm.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	storage, err := bolt.NewStorage(db)
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	hash, err := users.HashPwd("s3cret-pw")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := storage.Users.Save(&users.User{
		Username: "alice",
		Password: hash,
		Scope:    t.TempDir(),
	}); err != nil {
		t.Fatalf("save user: %v", err)
	}
	return storage.Users
}

func loginReq(body string) *http.Request {
	return httptest.NewRequest(
		http.MethodPost,
		"/api/login",
		bytes.NewBufferString(body),
	)
}

func TestJSONAuth(t *testing.T) {
	store := newUserStore(t)
	stg := &settings.Settings{}
	srv := &settings.Server{}

	t.Run("valid credentials return the user", func(t *testing.T) {
		u, err := auth.JSONAuth{}.Auth(
			loginReq(`{"username":"alice","password":"s3cret-pw"}`),
			store, stg, srv,
		)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u == nil || u.Username != "alice" {
			t.Fatalf("expected user alice, got %+v", u)
		}
	})

	t.Run("wrong password is rejected", func(t *testing.T) {
		_, err := auth.JSONAuth{}.Auth(
			loginReq(`{"username":"alice","password":"nope"}`),
			store, stg, srv,
		)
		if !errors.Is(err, os.ErrPermission) {
			t.Fatalf("expected ErrPermission, got %v", err)
		}
	})

	t.Run("unknown user is rejected (no enumeration leak)", func(t *testing.T) {
		_, err := auth.JSONAuth{}.Auth(
			loginReq(`{"username":"mallory","password":"whatever"}`),
			store, stg, srv,
		)
		if !errors.Is(err, os.ErrPermission) {
			t.Fatalf("expected ErrPermission, got %v", err)
		}
	})

	t.Run("malformed JSON body is rejected", func(t *testing.T) {
		_, err := auth.JSONAuth{}.Auth(loginReq(`{not json`), store, stg, srv)
		if !errors.Is(err, os.ErrPermission) {
			t.Fatalf("expected ErrPermission, got %v", err)
		}
	})
}
