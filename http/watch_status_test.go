package fbhttp

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/csummers-dev/vitrine/v4/settings"
)

// Global Settings reports the file watcher's state (4.0 2.1): read-only,
// and absent when nothing has registered a watcher.
func TestSettingsReportFileWatchStatus(t *testing.T) {
	st, admin, _ := newAuthzStorage(t)
	srv := &settings.Server{Root: "/"}
	get := func() settingsData {
		t.Helper()
		rec := httptest.NewRecorder()
		handle(settingsGetHandler, "", st, nil, nil, srv).
			ServeHTTP(rec, authGet(t, "/", mintToken(t, admin, authzSigningKey), nil))
		var got settingsData
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}

	prev := watchStatus
	t.Cleanup(func() { watchStatus = prev })

	watchStatus = nil
	if got := get(); got.FileWatch != nil {
		t.Fatalf("fileWatch = %+v without a watcher, want absent", got.FileWatch)
	}

	SetWatchStatus(func() WatchStatus {
		return WatchStatus{Mode: "auto", Polling: true, LimitHit: true}
	})
	got := get().FileWatch
	if got == nil || got.Mode != "auto" || !got.Polling || !got.LimitHit {
		t.Fatalf("fileWatch = %+v, want auto, polling, limit hit", got)
	}
}
