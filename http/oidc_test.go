package fbhttp

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/csummers-dev/vitrine/v4/auth"
	"github.com/csummers-dev/vitrine/v4/settings"
)

func TestOIDCStateCookie(t *testing.T) {
	key := []byte("k")
	now := time.Unix(1_800_000_000, 0)
	st := oidcState{State: "s", Nonce: "n", Verifier: "v", Redirect: "/files/x", Expires: now.Add(time.Minute).Unix()}
	c, err := signOIDCState(key, st)
	if err != nil {
		t.Fatal(err)
	}
	got, err := parseOIDCState(key, c, now)
	if err != nil || *got != st {
		t.Fatalf("round trip: %+v, %v", got, err)
	}
	if _, err := parseOIDCState([]byte("other"), c, now); err == nil {
		t.Error("cookie signed with another key accepted")
	}
	if _, err := parseOIDCState(key, c, now.Add(2*time.Minute)); err == nil {
		t.Error("expired cookie accepted")
	}
	if _, err := parseOIDCState(key, "x"+c, now); err == nil {
		t.Error("tampered cookie accepted")
	}
}

func TestSafeRedirect(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/files/Movies/", "/files/Movies/"},
		{"", "/files/"},
		{"https://evil.example", "/files/"},
		{"//evil.example", "/files/"},
		{`/\evil.example`, "/files/"},
	}
	for _, c := range cases {
		if got := safeRedirect(c.in); got != c.want {
			t.Errorf("safeRedirect(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestCallbackURL(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "http://files.lan:8080/api/auth/oidc/login", http.NoBody)
	if got := callbackURL(r, &auth.OIDCAuth{}, "/vitrine"); got != "http://files.lan:8080/vitrine/api/auth/oidc/callback" {
		t.Errorf("plain: %s", got)
	}
	r.Header.Set("X-Forwarded-Proto", "https, http")
	r.Header.Set("X-Forwarded-Host", "files.example.com")
	if got := callbackURL(r, &auth.OIDCAuth{}, ""); got != "https://files.example.com/api/auth/oidc/callback" {
		t.Errorf("proxied: %s", got)
	}
	if got := callbackURL(r, &auth.OIDCAuth{RedirectURL: "https://x/cb"}, ""); got != "https://x/cb" {
		t.Errorf("override: %s", got)
	}
	r.TLS = &tls.ConnectionState{}
	if !cookieSecure(r) {
		t.Error("TLS request should get a Secure cookie")
	}
}

func TestSSOUserCreatesAndSyncsAdmin(t *testing.T) {
	st, _, bob := newAuthzStorage(t)
	set, _ := st.Settings.Get()
	d := &data{settings: set, server: &settings.Server{Root: t.TempDir()}, store: st}
	a := &auth.OIDCAuth{AutoCreate: true, AdminGroup: "admins"}

	u, err := ssoUser(d, a, jwt.MapClaims{"preferred_username": "carol", "groups": []any{"admins"}})
	if err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 || !u.Perm.Admin || !u.LockPassword {
		t.Errorf("new admin = %+v", u)
	}
	// Removed from the group: admin goes on the next sign-in.
	u, err = ssoUser(d, a, jwt.MapClaims{"preferred_username": "carol", "groups": []any{"family"}})
	if err != nil || u.Perm.Admin {
		t.Fatalf("after leaving the group: %+v, %v", u, err)
	}
	// Existing users sign in as themselves.
	if u, err := ssoUser(d, a, jwt.MapClaims{"preferred_username": "bob"}); err != nil || u.ID != bob.ID {
		t.Errorf("bob: %v, %v", u, err)
	}
	// Without auto-create, unknown users are refused.
	a.AutoCreate = false
	if _, err := ssoUser(d, a, jwt.MapClaims{"preferred_username": "dave"}); err != errUnknownSSOUser {
		t.Errorf("unknown user err = %v", err)
	}
	for _, bad := range []string{"", "../x", "a/b"} {
		if _, err := ssoUser(d, a, jwt.MapClaims{"preferred_username": bad}); err == nil {
			t.Errorf("username %q accepted", bad)
		}
	}
}
