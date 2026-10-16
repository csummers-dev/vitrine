package fbhttp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/settings"
)

func TestUpgradeNotice(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	srv := &settings.Server{Root: "/"}
	get := handle(upgradeNoticeGetHandler, "", st, nil, nil, srv)
	del := handle(upgradeNoticeDeleteHandler, "", st, nil, nil, srv)
	adminToken := mintToken(t, admin, authzSigningKey)
	bobToken := mintToken(t, bob, authzSigningKey)

	read := func() (int, string) {
		rec := httptest.NewRecorder()
		get.ServeHTTP(rec, authGet(t, "/", adminToken, nil))
		return rec.Code, rec.Body.String()
	}

	// Nothing recorded: null.
	if code, body := read(); code != http.StatusOK || body != "null" {
		t.Fatalf("no notice = %d %q, want 200 null", code, body)
	}

	at := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	if err := st.Settings.SaveUpgradeNotice(&settings.UpgradeNotice{
		From: 3, To: 4, Backup: "/db/vitrine.db.pre-4.0.bak", At: at,
	}); err != nil {
		t.Fatal(err)
	}

	// Admins only.
	if got := serveStatus(get, authGet(t, "/", bobToken, nil)); got != http.StatusForbidden {
		t.Errorf("non-admin GET = %d, want 403", got)
	}
	delReq := func(token string) *http.Request {
		r := httptest.NewRequest(http.MethodDelete, "/", http.NoBody)
		r.Header.Set("X-Auth", token)
		return r
	}
	if got := serveStatus(del, delReq(bobToken)); got != http.StatusForbidden {
		t.Errorf("non-admin DELETE = %d, want 403", got)
	}

	code, body := read()
	if code != http.StatusOK {
		t.Fatalf("GET = %d %s", code, body)
	}
	var n settings.UpgradeNotice
	if err := json.Unmarshal([]byte(body), &n); err != nil {
		t.Fatal(err)
	}
	if n.From != 3 || n.To != 4 || n.Backup != "/db/vitrine.db.pre-4.0.bak" || !n.At.Equal(at) {
		t.Errorf("notice = %+v", n)
	}

	// Dismissed for good; dismissing again is fine.
	if got := serveStatus(del, delReq(adminToken)); got != http.StatusNoContent {
		t.Errorf("DELETE = %d, want 204", got)
	}
	if code, body := read(); code != http.StatusOK || body != "null" {
		t.Errorf("after DELETE = %d %q, want 200 null", code, body)
	}
	if got := serveStatus(del, delReq(adminToken)); got != http.StatusNoContent {
		t.Errorf("second DELETE = %d, want 204", got)
	}
}
