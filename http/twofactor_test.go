package fbhttp

import (
	"bytes"
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

func TestTwoFactorLogin(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	set, err := st.Settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	set.AuthMethod = auth.MethodJSONAuth
	if err := st.Settings.Save(set); err != nil {
		t.Fatal(err)
	}
	if err := st.Auth.Save(&auth.JSONAuth{}); err != nil {
		t.Fatal(err)
	}
	if err := SetTwoFactorKey(bytes.Repeat([]byte{7}, twofactor.KeySize)); err != nil {
		t.Fatal(err)
	}
	secret, _ := twofactor.NewSecret()
	sealed, _ := sealer().Seal(secret)
	f := &twofactor.Factor{UserID: admin.ID, Secret: sealed, Enabled: true}
	recovery, _ := f.NewRecoveryCodes()
	if err := st.TwoFactor.Save(f); err != nil {
		t.Fatal(err)
	}

	srv := &settings.Server{Root: "/"}
	post := func(h handleFunc, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		r.RemoteAddr = "198.51.100.44:1234" // its own throttle bucket
		rec := httptest.NewRecorder()
		handle(h, "", st, nil, nil, srv).ServeHTTP(rec, r)
		return rec
	}
	login := loginHandler(time.Hour)
	second := twoFactorLoginHandler(time.Hour)

	// Without a factor, the password is enough.
	if rec := post(login, `{"username":"bob","password":"pw-123456"}`); rec.Code != http.StatusOK || strings.Count(rec.Body.String(), ".") != 2 {
		t.Fatalf("bob login: %d %q", rec.Code, rec.Body)
	}
	_ = bob

	challenge := func() string {
		rec := post(login, `{"username":"admin","password":"pw-123456"}`)
		if rec.Code != http.StatusAccepted {
			t.Fatalf("admin password step: %d %s", rec.Code, rec.Body)
		}
		var res struct {
			TwoFactor bool   `json:"twoFactor"`
			Challenge string `json:"challenge"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		if !res.TwoFactor || res.Challenge == "" {
			t.Fatalf("no challenge: %s", rec.Body)
		}
		return res.Challenge
	}
	codeBody := func(ch, code string) string {
		b, _ := json.Marshal(twoFactorLoginBody{Challenge: ch, Code: code})
		return string(b)
	}

	ch := challenge()
	if rec := post(second, codeBody(ch, "000000")); rec.Code != http.StatusForbidden {
		// (a 1-in-a-million chance the real code is 000000 is acceptable)
		t.Errorf("wrong code: %d", rec.Code)
	}
	if rec := post(second, codeBody("forged.token", "123456")); rec.Code != http.StatusUnauthorized {
		t.Errorf("forged challenge: %d", rec.Code)
	}
	code, _ := twofactor.Code(secret, time.Now())
	rec := post(second, codeBody(ch, code))
	if rec.Code != http.StatusOK || strings.Count(rec.Body.String(), ".") != 2 {
		t.Fatalf("code step: %d %q", rec.Code, rec.Body)
	}
	// The same code can't be used again.
	if rec := post(second, codeBody(challenge(), code)); rec.Code != http.StatusForbidden {
		t.Errorf("replayed code: %d", rec.Code)
	}
	// A recovery code works once.
	if rec := post(second, codeBody(challenge(), recovery[0])); rec.Code != http.StatusOK {
		t.Errorf("recovery code: %d", rec.Code)
	}
	if rec := post(second, codeBody(challenge(), recovery[0])); rec.Code != http.StatusForbidden {
		t.Errorf("reused recovery code: %d", rec.Code)
	}
	loginThrottler.succeed("198.51.100.44")
}
