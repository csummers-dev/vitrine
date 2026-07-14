package fbhttp

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/asdine/storm/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v3/settings"
	"github.com/csummers-dev/vitrine/v3/storage"
	"github.com/csummers-dev/vitrine/v3/storage/bolt"
	"github.com/csummers-dev/vitrine/v3/users"
)

// Reusable authenticated-handler harness: mints a real HS256 token (signed with
// the stored signing key, exactly like loginHandler does) and drives a handler
// through the same `handle()` wrapper the router uses — so withUser / withAdmin
// / withSelfOrAdmin run for real. Covers the audit's deferred handler-level
// auth + authz + IDOR suite. (customFSUser / its in-memory FS come from
// public_test.go in this same package.)

var authzSigningKey = []byte("authz-test-signing-key-0123456789")

func newAuthzStorage(t *testing.T) (*storage.Storage, *users.User, *users.User) {
	t.Helper()
	db, err := storm.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	st, err := bolt.NewStorage(db)
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	if err := st.Settings.Save(&settings.Settings{Key: authzSigningKey}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	hash, _ := users.HashPwd("pw-123456")
	save := func(name string, admin bool) {
		if err := st.Users.Save(&users.User{
			Username: name,
			Password: hash,
			Scope:    "/",
			Perm:     users.Permissions{Admin: admin, Download: true},
		}); err != nil {
			t.Fatalf("save %s: %v", name, err)
		}
	}
	save("admin", true)
	save("bob", false)

	// In-memory FS so the resource handler has a directory to list.
	memfs := afero.NewMemMapFs()
	if err := afero.WriteFile(memfs, "/hello.txt", []byte("hi"), 0o644); err != nil {
		t.Fatalf("seed fs: %v", err)
	}
	st.Users = &customFSUser{Store: st.Users, fs: memfs}

	admin, err := st.Users.Get("/", "admin")
	if err != nil {
		t.Fatalf("get admin: %v", err)
	}
	bob, err := st.Users.Get("/", "bob")
	if err != nil {
		t.Fatalf("get bob: %v", err)
	}
	return st, admin, bob
}

func mintToken(t *testing.T, u *users.User, key []byte) string {
	t.Helper()
	claims := authToken{
		User: userInfo{ID: u.ID, Username: u.Username, Perm: u.Perm},
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func serveStatus(handler http.Handler, r *http.Request) int {
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, r)
	return rec.Result().StatusCode
}

func authGet(t *testing.T, target, token string, vars map[string]string) *http.Request {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, target, http.NoBody)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if token != "" {
		r.Header.Set("X-Auth", token)
	}
	if vars != nil {
		r = mux.SetURLVars(r, vars)
	}
	return r
}

func TestResourceHandler_RequiresValidToken(t *testing.T) {
	st, _, bob := newAuthzStorage(t)
	h := handle(resourceGetHandler, "/api/resources", st, nil, nil, &settings.Server{})

	t.Run("no token is rejected with 401", func(t *testing.T) {
		got := serveStatus(h, authGet(t, "/api/resources/", "", nil))
		if got != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", got)
		}
	})

	t.Run("a token signed with the wrong key is rejected with 401", func(t *testing.T) {
		bad := mintToken(t, bob, []byte("a-totally-different-key"))
		got := serveStatus(h, authGet(t, "/api/resources/", bad, nil))
		if got != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", got)
		}
	})

	t.Run("a valid token lists the user's scope (200)", func(t *testing.T) {
		got := serveStatus(h, authGet(t, "/api/resources/", mintToken(t, bob, authzSigningKey), nil))
		if got != http.StatusOK {
			t.Fatalf("status = %d, want 200", got)
		}
	})
}

func TestAdminRoute_RejectsNonAdmin(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	h := handle(usersGetHandler, "", st, nil, nil, &settings.Server{})

	if got := serveStatus(h, authGet(t, "/api/users", mintToken(t, bob, authzSigningKey), nil)); got != http.StatusForbidden {
		t.Fatalf("non-admin on admin route = %d, want 403", got)
	}
	if got := serveStatus(h, authGet(t, "/api/users", mintToken(t, admin, authzSigningKey), nil)); got != http.StatusOK {
		t.Fatalf("admin on admin route = %d, want 200", got)
	}
}

func TestUserGet_SelfOrAdmin_BlocksIDOR(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	h := handle(userGetHandler, "", st, nil, nil, &settings.Server{})

	idVars := func(u *users.User) map[string]string {
		return map[string]string{"id": fmt.Sprint(u.ID)}
	}

	// Bob may read his OWN profile.
	if got := serveStatus(h, authGet(t, "/api/users/x", mintToken(t, bob, authzSigningKey), idVars(bob))); got != http.StatusOK {
		t.Fatalf("bob → own profile = %d, want 200", got)
	}
	// Bob may NOT read another user's profile (IDOR).
	if got := serveStatus(h, authGet(t, "/api/users/x", mintToken(t, bob, authzSigningKey), idVars(admin))); got != http.StatusForbidden {
		t.Fatalf("bob → admin's profile = %d, want 403 (IDOR must be blocked)", got)
	}
	// An admin may read anyone's profile.
	if got := serveStatus(h, authGet(t, "/api/users/x", mintToken(t, admin, authzSigningKey), idVars(bob))); got != http.StatusOK {
		t.Fatalf("admin → bob's profile = %d, want 200", got)
	}
}
