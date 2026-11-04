package fbhttp

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/share"
	"github.com/csummers-dev/vitrine/v4/users"
)

// The "ask for archive format" setting (4.0): only admins change it, the
// settings API round-trips it, and archive downloads default to zip.

func TestAskArchiveFormatSettingIsAdminOnly(t *testing.T) {
	st, admin, bob := newAuthzStorage(t)
	srv := &settings.Server{Root: "/"}
	put := func(u *users.User, body string) int {
		r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body))
		r.Header.Set("X-Auth", mintToken(t, u, authzSigningKey))
		rec := httptest.NewRecorder()
		handle(settingsPutHandler, "", st, nil, nil, srv).ServeHTTP(rec, r)
		return rec.Code
	}

	if got := put(bob, `{"askArchiveFormat":true}`); got != http.StatusForbidden {
		t.Fatalf("non-admin PUT = %d, want 403", got)
	}
	if s, _ := st.Settings.Get(); s.AskArchiveFormat {
		t.Fatal("a non-admin turned the prompt on")
	}

	if got := put(admin, `{"askArchiveFormat":true}`); got != http.StatusOK {
		t.Fatalf("admin PUT = %d, want 200", got)
	}
	if s, _ := st.Settings.Get(); !s.AskArchiveFormat {
		t.Fatal("admin change not saved")
	}

	rec := httptest.NewRecorder()
	handle(settingsGetHandler, "", st, nil, nil, srv).
		ServeHTTP(rec, authGet(t, "/", mintToken(t, admin, authzSigningKey), nil))
	var got settingsData
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.AskArchiveFormat {
		t.Error("GET /api/settings doesn't report askArchiveFormat")
	}
}

// archiveKind names an archive by its first bytes.
func archiveKind(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("PK\x03\x04")):
		return "zip"
	case bytes.HasPrefix(b, []byte{0x1f, 0x8b}):
		return "gzip"
	default:
		return "unknown"
	}
}

func TestFolderDownloadDefaultsToZip(t *testing.T) {
	st, admin, _ := newAuthzStorage(t)
	srv := &settings.Server{Root: "/"}
	raw := handle(rawHandler, "", st, nil, nil, srv)
	token := mintToken(t, admin, authzSigningKey)

	for _, tc := range []struct {
		query, kind, ext string
	}{
		{"", "zip", ".zip"},
		{"?algo=zip", "zip", ".zip"},
		{"?algo=targz", "gzip", ".tar.gz"},
	} {
		rec := httptest.NewRecorder()
		raw.ServeHTTP(rec, authGet(t, "/"+tc.query, token, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /%s = %d %s", tc.query, rec.Code, rec.Body)
		}
		if k := archiveKind(rec.Body.Bytes()); k != tc.kind {
			t.Errorf("GET /%s returned %s, want %s", tc.query, k, tc.kind)
		}
		if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, tc.ext) {
			t.Errorf("GET /%s Content-Disposition %q, want %s", tc.query, cd, tc.ext)
		}
	}

	rec := httptest.NewRecorder()
	raw.ServeHTTP(rec, authGet(t, "/?algo=rar", token, nil))
	if rec.Code == http.StatusOK {
		t.Error("an unknown format was accepted")
	}
}

func TestSharedFolderDownloadDefaultsToZip(t *testing.T) {
	link := &share.Link{Hash: "box", UserID: 1, Path: "/box"}
	st, _ := newDropBox(t, link, users.Permissions{Share: true, Download: true})

	for _, tc := range []struct{ path, kind string }{
		{"box", "zip"},
		{"box?algo=targz", "gzip"},
	} {
		rec := serve(st, publicDlHandler, getReq(tc.path))
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d %s", tc.path, rec.Code, rec.Body)
		}
		if k := archiveKind(rec.Body.Bytes()); k != tc.kind {
			t.Errorf("GET %s returned %s, want %s", tc.path, k, tc.kind)
		}
	}
}
