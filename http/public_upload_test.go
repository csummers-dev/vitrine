package fbhttp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/asdine/storm/v3"
	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/share"
	"github.com/csummers-dev/vitrine/v4/storage"
	"github.com/csummers-dev/vitrine/v4/storage/bolt"
	"github.com/csummers-dev/vitrine/v4/users"
)

func newDropBox(t *testing.T, link *share.Link, perm users.Permissions) (*storage.Storage, afero.Fs) {
	t.Helper()
	db, err := storm.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	st, err := bolt.NewStorage(db)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Share.Save(link); err != nil {
		t.Fatal(err)
	}
	if err := st.Users.Save(&users.User{Username: "owner", Password: "pw", Perm: perm}); err != nil {
		t.Fatal(err)
	}
	if err := st.Settings.Save(&settings.Settings{Key: []byte("key"), FileMode: 0o640, DirMode: 0o750}); err != nil {
		t.Fatal(err)
	}
	fs := afero.NewMemMapFs()
	if err := fs.MkdirAll("/box", 0o750); err != nil {
		t.Fatal(err)
	}
	_ = afero.WriteFile(fs, "/box/secret.txt", []byte("private"), 0o640)
	st.Users = &customFSUser{Store: st.Users, fs: fs}
	return st, fs
}

// Requests carry what's left after the /api/public/... prefix is stripped.
func uploadReq(hash, query, body string) *http.Request {
	r, _ := http.NewRequest(http.MethodPost, hash+"?"+query, strings.NewReader(body))
	r.RemoteAddr = "203.0.113.9:1234"
	return r
}

func getReq(p string) *http.Request {
	r, _ := http.NewRequest(http.MethodGet, p, http.NoBody)
	r.RemoteAddr = "203.0.113.9:1234"
	return r
}

func serve(st *storage.Storage, h handleFunc, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handle(h, "", st, nil, nil, &settings.Server{}).ServeHTTP(rec, r)
	return rec
}

func TestPublicUploadWritesWithoutOverwriting(t *testing.T) {
	link := &share.Link{Hash: "box", UserID: 1, Path: "/box", Mode: share.ModeUpload,
		AllowedExtensions: []string{".txt", ".pdf"}, MaxFileSize: 10, MaxTotalSize: 15, UploadedBytes: 10}
	st, fs := newDropBox(t, link, users.Permissions{Share: true, Create: true})

	rec := serve(st, publicUploadHandler, uploadReq("box", "name=secret.txt", "hello"))
	if rec.Code != http.StatusOK {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var res struct{ Name string }
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if res.Name != "secret (2).txt" {
		t.Errorf("stored as %q, want a non-overwriting name", res.Name)
	}
	if b, _ := afero.ReadFile(fs, "/box/secret.txt"); string(b) != "private" {
		t.Error("existing file was overwritten")
	}
	if b, _ := afero.ReadFile(fs, "/box/secret (2).txt"); string(b) != "hello" {
		t.Errorf("uploaded content = %q", b)
	}

	cases := []struct {
		name, query, body string
		want              int
	}{
		{"traversal", "name=../../etc/passwd", "x", http.StatusBadRequest},
		{"type", "name=run.exe", "x", http.StatusUnsupportedMediaType},
		{"file too big", "name=big.pdf", "01234567890", http.StatusRequestEntityTooLarge},
		{"total exceeded", "name=c.pdf", "0123456789", http.StatusRequestEntityTooLarge},
		{"not an upload link", "name=a.txt", "x", http.StatusNotFound},
	}
	for _, c := range cases {
		hash := "box"
		if c.name == "not an upload link" {
			hash = "nope"
		}
		if got := serve(st, publicUploadHandler, uploadReq(hash, c.query, c.body)).Code; got != c.want {
			t.Errorf("%s: status %d, want %d", c.name, got, c.want)
		}
	}
}

func TestPublicUploadPerUploaderFolderAndInfo(t *testing.T) {
	link := &share.Link{Hash: "box", UserID: 1, Path: "/box", Mode: share.ModeUpload, PerUploaderFolder: true, MaxTotalSize: 100}
	st, fs := newDropBox(t, link, users.Permissions{Share: true, Create: true})

	if rec := serve(st, publicUploadHandler, uploadReq("box", "name=a.txt&uploader=../Alice", "hi")); rec.Code != http.StatusOK {
		t.Fatalf("upload: %d", rec.Code)
	}
	if ok, _ := afero.Exists(fs, "/box/Alice/a.txt"); !ok {
		t.Error("expected /box/Alice/a.txt")
	}

	// The share page describes the drop-box and never lists it.
	rec := serve(st, publicShareHandler, getReq("box"))
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "secret.txt") {
		t.Fatalf("info: %d %s", rec.Code, rec.Body)
	}
	var info uploadShareInfo
	_ = json.Unmarshal(rec.Body.Bytes(), &info)
	if info.Mode != share.ModeUpload || info.Name != "box" || info.RemainingBytes == nil {
		t.Errorf("info = %+v", info)
	}
	// Downloads are refused.
	if code := serve(st, publicDlHandler, getReq("box")).Code; code != http.StatusNotFound {
		t.Errorf("dl status %d, want 404", code)
	}
}

func TestPublicUploadNeedsOwnerCreatePermission(t *testing.T) {
	link := &share.Link{Hash: "box", UserID: 1, Path: "/box", Mode: share.ModeUpload}
	st, _ := newDropBox(t, link, users.Permissions{Share: true})
	if code := serve(st, publicUploadHandler, uploadReq("box", "name=a.txt", "x")).Code; code != http.StatusForbidden {
		t.Errorf("status %d, want 403", code)
	}
}

func TestUploadLimiter(t *testing.T) {
	u := newUploadLimiter()
	now := time.Unix(1_800_000_000, 0)
	u.now = func() time.Time { return now }
	for i := 0; i < uploadConcurrencyPerLink; i++ {
		if wait, busy := u.begin("ip", "h"); wait != 0 || busy {
			t.Fatalf("upload %d refused", i)
		}
	}
	if _, busy := u.begin("ip", "h"); !busy {
		t.Error("expected busy at the concurrency cap")
	}
	u.end("h")
	if _, busy := u.begin("ip", "h"); busy {
		t.Error("a finished upload should free a slot")
	}
	for i := 0; i < uploadConcurrencyPerLink; i++ {
		u.end("h")
	}
	for i := 0; i < uploadsPerIPPerHour; i++ {
		u.begin("ip2", "x")
		u.end("x")
	}
	if wait, _ := u.begin("ip2", "x"); wait <= 0 {
		t.Error("expected the hourly cap to apply")
	}
	now = now.Add(time.Hour)
	if wait, _ := u.begin("ip2", "x"); wait != 0 {
		t.Error("the cap should lift after an hour")
	}
}
