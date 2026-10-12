package fbhttp

import (
	"strings"
	"testing"
	"time"

	"github.com/spf13/afero"
)

func waitScan(t *testing.T, s *dupeScan) dupeScanView {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		v := s.view()
		if v.Status != "queued" && v.Status != "running" {
			return v
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("scan never finished")
	return dupeScanView{}
}

func TestDupeScanManager(t *testing.T) {
	afs := afero.NewMemMapFs()
	same := []byte(strings.Repeat("vitrine", 1000))
	for _, p := range []string{"/Music/a.flac", "/Backup/a.flac", "/Private/a.flac", "/.trash/a.flac"} {
		if err := afero.WriteFile(afs, p, same, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	allowed := func(p string) bool { return !strings.HasPrefix(p, "/Private") }
	m := newDupeScanManager()

	s := m.start(1, afs, allowed, dupeScanRequest{Path: "/", MinSize: 1})
	v := waitScan(t, s)
	if v.Status != "done" || v.Result == nil || len(v.Result.Groups) != 1 {
		t.Fatalf("scan = %+v", v)
	}
	if got := len(v.Result.Groups[0].Files); got != 2 {
		t.Fatalf("group has %d files; rules or the trash leaked in", got)
	}
	if m.get(1) != s || m.get(2) != nil {
		t.Error("scans aren't per user")
	}

	// Deleting a copy leaves a single file: the group goes away.
	_ = afs.Remove("/Backup/a.flac")
	s.prune(func(p string) bool { _, err := afs.Stat(p); return err == nil })
	if v := s.view(); len(v.Result.Groups) != 0 || v.Result.Reclaimable != 0 {
		t.Errorf("after delete = %+v", v.Result)
	}

	// A new scan replaces the old one; stop forgets it.
	s2 := m.start(1, afs, allowed, dupeScanRequest{Path: "/", MinSize: 1})
	if m.get(1) != s2 {
		t.Error("new scan didn't replace the old one")
	}
	waitScan(t, s2)
	m.stop(1)
	if m.get(1) != nil {
		t.Error("stop kept the scan")
	}
}
