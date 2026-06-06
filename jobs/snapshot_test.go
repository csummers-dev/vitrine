package jobs_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/filebrowser/filebrowser/v2/jobs"
)

func noopExec(_ context.Context, _ *jobs.Job) error { return nil }

// Snapshot must expose each item's RESOLVED destination as ToPaths — including
// any "(1)" version suffix the HTTP layer applied for a same-folder copy — so
// the UI selects the actual new copies a transfer produced, not the originals.
func TestSnapshotToPaths(t *testing.T) {
	reg := jobs.New(noopExec)
	defer reg.Close()

	items := []jobs.Item{
		{From: "/a/report.txt", To: "/a/report(1).txt"}, // same-folder copy → suffixed
		{From: "/a/notes", To: "/b/notes"},              // moved to another folder
	}
	job := reg.Enqueue(7, jobs.KindCopy, items, nil)

	snap := job.Snapshot()
	if want := []string{"/a/report(1).txt", "/b/notes"}; !reflect.DeepEqual(snap.ToPaths, want) {
		t.Fatalf("ToPaths = %#v, want %#v", snap.ToPaths, want)
	}
	// FromPaths mirrors the items' sources, so the UI can tell whether the user
	// is still on those files or has moved on mid-transfer.
	if want := []string{"/a/report.txt", "/a/notes"}; !reflect.DeepEqual(snap.FromPaths, want) {
		t.Fatalf("FromPaths = %#v, want %#v", snap.FromPaths, want)
	}
}

// A job with no items yields an empty (non-panicking) ToPaths.
func TestSnapshotToPathsEmpty(t *testing.T) {
	reg := jobs.New(noopExec)
	defer reg.Close()

	job := reg.Enqueue(1, jobs.KindMove, []jobs.Item{}, nil)
	if got := job.Snapshot().ToPaths; len(got) != 0 {
		t.Fatalf("ToPaths = %#v, want empty", got)
	}
}
