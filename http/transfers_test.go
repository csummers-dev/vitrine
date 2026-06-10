package fbhttp

import (
	"path"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/spf13/afero"

	"github.com/filebrowser/filebrowser/v2/events"
	"github.com/filebrowser/filebrowser/v2/jobs"
)

func seedFile(t *testing.T, fs afero.Fs, name, content string) {
	t.Helper()
	if err := fs.MkdirAll(path.Dir(name), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", name, err)
	}
	if err := afero.WriteFile(fs, name, []byte(content), 0o644); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
}

func testPayload(fs afero.Fs) *transferPayload {
	// prewalk:true models a main-lane transfer (copy or cross-volume move),
	// where the executor counts bytes up front. The fast-lane skip is covered
	// by TestTransferExecuteSkipsPrewalk.
	return &transferPayload{fs: fs, fileMode: 0o644, dirMode: 0o755, base: events.NewBase(1, ""), prewalk: true}
}

func waitJob(t *testing.T, tm *transferManager, id string, uid uint, want jobs.Status) jobs.JobView {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if v, ok := tm.reg.Get(id, uid); ok && v.Status == want {
			return v
		}
		time.Sleep(time.Millisecond)
	}
	if v, ok := tm.reg.Get(id, uid); ok {
		t.Fatalf("job %s: want %q, got %q (err %q)", id, want, v.Status, v.Error)
	}
	t.Fatalf("job %s: gone before reaching %q", id, want)
	return jobs.JobView{}
}

func TestTransferExecuteCopy(t *testing.T) {
	fs := afero.NewMemMapFs()
	seedFile(t, fs, "/src/a.txt", "hello")

	tm := newTransferManager()
	defer tm.reg.Close()

	j := tm.reg.Enqueue(1, jobs.KindCopy,
		[]jobs.Item{{From: "/src/a.txt", To: "/dst/a.txt"}}, testPayload(fs))
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusCompleted)

	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != "hello" {
		t.Errorf("dest = %q, want %q", got, "hello")
	}
	if _, err := fs.Stat("/src/a.txt"); err != nil {
		t.Errorf("copy disturbed the source: %v", err)
	}
	if v.TotalBytes != 5 || v.DoneBytes != 5 || v.FileCount != 1 || v.FilesDone != 1 {
		t.Errorf("progress: %d/%d bytes, %d/%d files (want 5/5, 1/1)",
			v.DoneBytes, v.TotalBytes, v.FilesDone, v.FileCount)
	}
}

func TestTransferExecuteMoveInstantPinsCounters(t *testing.T) {
	fs := afero.NewMemMapFs() // Rename succeeds → instant move, copies nothing
	seedFile(t, fs, "/src/a.txt", "data")

	tm := newTransferManager()
	defer tm.reg.Close()

	j := tm.reg.Enqueue(1, jobs.KindMove,
		[]jobs.Item{{From: "/src/a.txt", To: "/dst/a.txt"}}, testPayload(fs))
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusCompleted)

	if _, err := fs.Stat("/src/a.txt"); err == nil {
		t.Error("source still present after move")
	}
	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != "data" {
		t.Errorf("dest = %q, want %q", got, "data")
	}
	// MarkComplete must pin the counters to 100% even though the rename copied
	// no bytes (otherwise the dock would show 0%).
	if v.DoneBytes != v.TotalBytes || v.TotalBytes != 4 || v.FilesDone != v.FileCount || v.FileCount != 1 {
		t.Errorf("instant move counters: %d/%d bytes, %d/%d files (want 4/4, 1/1)",
			v.DoneBytes, v.TotalBytes, v.FilesDone, v.FileCount)
	}
}

func TestTransferExecuteMissingPayloadFails(t *testing.T) {
	tm := newTransferManager()
	defer tm.reg.Close()

	j := tm.reg.Enqueue(1, jobs.KindCopy,
		[]jobs.Item{{From: "/x", To: "/y"}}, nil) // no payload
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusFailed)
	if !strings.Contains(v.Error, "missing execution context") {
		t.Errorf("error = %q, want it to mention the missing context", v.Error)
	}
}

func TestTransferExecuteCopyErrorRollsBackDest(t *testing.T) {
	fs := afero.NewMemMapFs() // source does not exist
	tm := newTransferManager()
	defer tm.reg.Close()

	j := tm.reg.Enqueue(1, jobs.KindCopy,
		[]jobs.Item{{From: "/nope.txt", To: "/dst/nope.txt"}}, testPayload(fs))
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusFailed)
	if v.Error == "" {
		t.Error("failed job should carry an error")
	}
	if _, err := fs.Stat("/dst/nope.txt"); err == nil {
		t.Error("a failed copy left a destination behind")
	}
}

func TestTransferExecuteSkipsPrewalk(t *testing.T) {
	fs := afero.NewMemMapFs()
	seedFile(t, fs, "/src/a.txt", "data")

	tm := newTransferManager()
	defer tm.reg.Close()

	// prewalk:false models a fast-lane (same-volume) move — the executor must
	// NOT walk for byte totals; the rename copies nothing, so TotalBytes stays 0
	// while MarkComplete still pins 100% / N-of-N.
	pl := &transferPayload{fs: fs, fileMode: 0o644, dirMode: 0o755, base: events.NewBase(1, ""), prewalk: false}
	j := tm.reg.Enqueue(1, jobs.KindMove,
		[]jobs.Item{{From: "/src/a.txt", To: "/dst/a.txt"}}, pl)
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusCompleted)

	if v.TotalBytes != 0 {
		t.Errorf("prewalk should have been skipped (TotalBytes=0), got %d", v.TotalBytes)
	}
	if v.FileCount != 1 || v.FilesDone != 1 {
		t.Errorf("files: want 1/1, got %d/%d", v.FilesDone, v.FileCount)
	}
	if _, err := fs.Stat("/src/a.txt"); err == nil {
		t.Error("source still present after move")
	}
}

func TestTransferExecuteVerifiedCopy(t *testing.T) {
	fs := afero.NewMemMapFs()
	seedFile(t, fs, "/src/a.txt", "verify me")

	tm := newTransferManager()
	defer tm.reg.Close()

	// verify:true → the executor re-hashes src vs dst after the copy; a faithful
	// copy passes, so the job still completes with the source intact.
	pl := &transferPayload{fs: fs, fileMode: 0o644, dirMode: 0o755, base: events.NewBase(1, ""), prewalk: true, verify: true}
	j := tm.reg.Enqueue(1, jobs.KindCopy,
		[]jobs.Item{{From: "/src/a.txt", To: "/dst/a.txt"}}, pl)
	v := waitJob(t, tm, j.ID(), 1, jobs.StatusCompleted)

	got, _ := afero.ReadFile(fs, "/dst/a.txt")
	if string(got) != "verify me" {
		t.Errorf("dest = %q, want %q", got, "verify me")
	}
	if v.DoneBytes != v.TotalBytes || v.FilesDone != v.FileCount {
		t.Errorf("verified copy counters off: %d/%d bytes, %d/%d files",
			v.DoneBytes, v.TotalBytes, v.FilesDone, v.FileCount)
	}
}

func TestIsTransientTransferErr(t *testing.T) {
	transient := []error{syscall.EINTR, syscall.EAGAIN, syscall.EBUSY, syscall.ETIMEDOUT}
	for _, e := range transient {
		if !isTransientTransferErr(e) {
			t.Errorf("%v should be transient", e)
		}
	}
	permanent := []error{nil, syscall.ENOENT, syscall.EACCES, syscall.EEXIST, syscall.ENOSPC, syscall.EXDEV}
	for _, e := range permanent {
		if isTransientTransferErr(e) {
			t.Errorf("%v should NOT be transient", e)
		}
	}
}
