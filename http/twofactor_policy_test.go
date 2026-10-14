package fbhttp

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/auth"
	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/twofactor"
)

// tokenUser decodes the user claims of a signed session token.
func tokenUser(t *testing.T, token string) userInfo {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("not a token: %q", token)
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims authToken
	if err := json.Unmarshal(raw, &claims); err != nil {
		t.Fatal(err)
	}
	return claims.User
}

func TestRequireAdminTwoFactor(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	set, err := st.Settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	set.AuthMethod = auth.MethodJSONAuth
	set.RequireAdminTwoFactor = true
	if err := st.Settings.Save(set); err != nil {
		t.Fatal(err)
	}
	if err := st.Auth.Save(&auth.JSONAuth{}); err != nil {
		t.Fatal(err)
	}
	srv := &settings.Server{Root: "/"}

	login := func(name string) userInfo {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"username":"`+name+`","password":"pw-123456"}`))
		r.RemoteAddr = "198.51.100.71:1234"
		rec := httptest.NewRecorder()
		handle(loginHandler(time.Hour), "", st, nil, nil, srv).ServeHTTP(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s login: %d %s", name, rec.Code, rec.Body)
		}
		return tokenUser(t, rec.Body.String())
	}
	adminOnly := handle(settingsGetHandler, "", st, nil, nil, srv)
	files := handle(resourceGetHandler, "/api/resources", st, nil, nil, srv)
	adminToken := mintToken(t, admin, authzSigningKey)

	// An admin without a second factor still signs in, flagged to set one
	// up; their files work but admin endpoints refuse them.
	if u := login("admin"); !u.TwoFactorSetupRequired {
		t.Error("admin token not flagged")
	}
	if u := login("bob"); u.TwoFactorSetupRequired {
		t.Error("non-admin flagged")
	}
	if got := serveStatus(adminOnly, authGet(t, "/", adminToken, nil)); got != http.StatusForbidden {
		t.Errorf("admin endpoint without 2FA = %d, want 403", got)
	}
	if got := serveStatus(files, authGet(t, "/api/resources/", adminToken, nil)); got != http.StatusOK {
		t.Errorf("files without 2FA = %d, want 200", got)
	}

	// Once it's set up, everything opens and the flag goes.
	if err := st.TwoFactor.Save(&twofactor.Factor{UserID: admin.ID, Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if got := serveStatus(adminOnly, authGet(t, "/", adminToken, nil)); got != http.StatusOK {
		t.Errorf("admin endpoint with 2FA = %d, want 200", got)
	}
	if u := login("admin"); u.TwoFactorSetupRequired {
		t.Error("enrolled admin still flagged")
	}

	// SSO and proxy set-ups leave second factors to the identity provider.
	_ = st.TwoFactor.Delete(admin.ID)
	set.AuthMethod = auth.MethodProxyAuth
	_ = st.Settings.Save(set)
	if got := serveStatus(adminOnly, authGet(t, "/", adminToken, nil)); got != http.StatusOK {
		t.Errorf("proxy auth admin = %d, want 200", got)
	}
	_ = bob
}

func TestRequireAdminTwoFactorCannotLockYourselfOut(t *testing.T) {
	st, admin, _ := newAuthzStorage(t)
	set, _ := st.Settings.Get()
	set.AuthMethod = auth.MethodJSONAuth
	_ = st.Settings.Save(set)
	srv := &settings.Server{Root: "/"}
	put := func() int {
		r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"requireAdminTwoFactor":true}`))
		r.Header.Set("X-Auth", mintToken(t, admin, authzSigningKey))
		rec := httptest.NewRecorder()
		handle(settingsPutHandler, "", st, nil, nil, srv).ServeHTTP(rec, r)
		return rec.Code
	}
	if got := put(); got != http.StatusConflict {
		t.Fatalf("turning it on without your own 2FA = %d, want 409", got)
	}
	if s, _ := st.Settings.Get(); s.RequireAdminTwoFactor {
		t.Fatal("setting saved anyway")
	}
	_ = st.TwoFactor.Save(&twofactor.Factor{UserID: admin.ID, Enabled: true})
	if got := put(); got != http.StatusOK {
		t.Fatalf("with 2FA = %d, want 200", got)
	}
	if s, _ := st.Settings.Get(); !s.RequireAdminTwoFactor {
		t.Error("setting not saved")
	}
}
