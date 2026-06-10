package jobs

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func sampleItems() []Item {
	return []Item{{From: "/src/a", To: "/dst/a"}}
}

// waitStatus polls until the job reaches want, or fails the test.
func waitStatus(t *testing.T, r *Registry, id string, uid uint, want Status) JobView {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if v, ok := r.Get(id, uid); ok && v.Status == want {
			return v
		}
		time.Sleep(time.Millisecond)
	}
	if v, ok := r.Get(id, uid); ok {
		t.Fatalf("job %s: want status %q, still %q", id, want, v.Status)
	} else {
		t.Fatalf("job %s: want status %q, but job is gone", id, want)
	}
	return JobView{}
}

func TestEnqueueCompletesWithProgress(t *testing.T) {
	r := New(func(_ context.Context, j *Job) error {
		j.SetTotals(100, 1)
		j.StartFile("a", "/dst/a")
		j.AddBytes(60)
		j.AddBytes(40)
		j.FinishFile()
		return nil
	})
	defer r.Close()

	j := r.Enqueue(1, KindCopy, sampleItems(), nil)
	v := waitStatus(t, r, j.ID(), 1, StatusCompleted)

	if v.TotalBytes != 100 || v.DoneBytes != 100 {
		t.Fatalf("bytes: want 100/100, got %d/%d", v.DoneBytes, v.TotalBytes)
	}
	if v.FileCount != 1 || v.FilesDone != 1 {
		t.Fatalf("files: want 1/1, got %d/%d", v.FilesDone, v.FileCount)
	}
	if v.Name != "a" || v.Dest != "/dst" {
		t.Fatalf("label/dest: want a //dst, got %q / %q", v.Name, v.Dest)
	}
	if v.FinishedAt.IsZero() || v.StartedAt.IsZero() {
		t.Fatalf("timestamps not set: started=%v finished=%v", v.StartedAt, v.FinishedAt)
	}
}

func TestSequentialOneAtATime(t *testing.T) {
	started := make(chan string, 8)
	release := make(chan struct{})
	r := New(func(_ context.Context, j *Job) error {
		started <- j.ID()
		<-release
		return nil
	})
	defer r.Close()
	defer close(release) // unblock any straggler on teardown

	a := r.Enqueue(1, KindCopy, sampleItems(), nil)
	b := r.Enqueue(1, KindCopy, sampleItems(), nil)

	// A runs first.
	if id := <-started; id != a.ID() {
		t.Fatalf("expected A to start first, got %s", id)
	}
	// B must still be queued (worker is busy with A).
	if v, _ := r.Get(b.ID(), 1); v.Status != StatusQueued {
		t.Fatalf("B should be queued while A runs, got %q", v.Status)
	}

	release <- struct{}{} // finish A → B starts
	if id := <-started; id != b.ID() {
		t.Fatalf("expected B to start after A, got %s", id)
	}
	release <- struct{}{} // finish B
	waitStatus(t, r, b.ID(), 1, StatusCompleted)
	waitStatus(t, r, a.ID(), 1, StatusCompleted)
}

func TestFastLaneBypassesBlockedMain(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	r := New(func(_ context.Context, j *Job) error {
		// Only the "block" job (main lane) stalls; the fast-lane move returns at
		// once.
		if j.Payload() == "block" {
			started <- struct{}{}
			<-release
		}
		return nil
	})
	defer r.Close()
	defer close(release) // unblock the straggler on teardown

	// A blocking copy occupies the single main-lane worker.
	slow := r.Enqueue(1, KindCopy, sampleItems(), "block")
	<-started // main worker is now stuck on slow

	// A same-volume move on the fast lane must complete WITHOUT waiting for it.
	fast, view := r.EnqueueFast(1, KindMove, sampleItems(), nil)
	if view.Status != StatusQueued {
		t.Fatalf("EnqueueFast initial view: want %q, got %q", StatusQueued, view.Status)
	}
	waitStatus(t, r, fast.ID(), 1, StatusCompleted)

	// …while the main-lane job is still blocked/running.
	if v, _ := r.Get(slow.ID(), 1); v.Status != StatusRunning {
		t.Fatalf("main-lane job should still be running, got %q", v.Status)
	}
}

func TestCancelRunning(t *testing.T) {
	r := New(func(ctx context.Context, _ *Job) error {
		<-ctx.Done() // block until canceled
		return ctx.Err()
	})
	defer r.Close()

	j := r.Enqueue(1, KindMove, sampleItems(), nil)
	waitStatus(t, r, j.ID(), 1, StatusRunning)

	if !r.Cancel(j.ID(), 1) {
		t.Fatal("Cancel of a running job should return true")
	}
	waitStatus(t, r, j.ID(), 1, StatusCanceled)
}

func TestCancelQueuedSkipsExecutor(t *testing.T) {
	started := make(chan string, 8)
	release := make(chan struct{})
	var ran sync.Map
	r := New(func(_ context.Context, j *Job) error {
		ran.Store(j.ID(), true)
		started <- j.ID()
		<-release
		return nil
	})
	defer r.Close()

	r.Enqueue(1, KindCopy, sampleItems(), nil) // A — blocks the worker
	b := r.Enqueue(1, KindCopy, sampleItems(), nil)

	<-started // A running, B queued
	if !r.Cancel(b.ID(), 1) {
		t.Fatal("Cancel of a queued job should return true")
	}
	release <- struct{}{} // finish A → worker reaches B, sees canceled, skips exec

	waitStatus(t, r, b.ID(), 1, StatusCanceled)
	if _, ok := ran.Load(b.ID()); ok {
		t.Fatal("executor must not run for a job canceled while queued")
	}
}

func TestFailedReportsError(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error {
		return errors.New("disk full")
	})
	defer r.Close()

	j := r.Enqueue(1, KindCopy, sampleItems(), nil)
	v := waitStatus(t, r, j.ID(), 1, StatusFailed)
	if v.Error != "disk full" {
		t.Fatalf("want error %q, got %q", "disk full", v.Error)
	}
}

func TestPerUserIsolation(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error { return nil })
	defer r.Close()

	a := r.Enqueue(1, KindCopy, sampleItems(), nil)
	b := r.Enqueue(2, KindCopy, sampleItems(), nil)
	waitStatus(t, r, a.ID(), 1, StatusCompleted)
	waitStatus(t, r, b.ID(), 2, StatusCompleted)

	if got := r.List(1); len(got) != 1 || got[0].ID != a.ID() {
		t.Fatalf("List(1) should contain only user 1's job, got %+v", got)
	}
	if _, ok := r.Get(b.ID(), 1); ok {
		t.Fatal("user 1 should not Get user 2's job")
	}
	if r.Dismiss(b.ID(), 1) {
		t.Fatal("user 1 should not Dismiss user 2's job")
	}
}

func TestDismiss(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error { return nil })
	defer r.Close()

	a := r.Enqueue(1, KindCopy, sampleItems(), nil)
	waitStatus(t, r, a.ID(), 1, StatusCompleted)
	if !r.Dismiss(a.ID(), 1) {
		t.Fatal("Dismiss of a completed job should return true")
	}
	if _, ok := r.Get(a.ID(), 1); ok {
		t.Fatal("dismissed job should be gone")
	}

	// A running job is not dismissable.
	release := make(chan struct{})
	r2 := New(func(_ context.Context, _ *Job) error { <-release; return nil })
	defer r2.Close()
	b := r2.Enqueue(1, KindCopy, sampleItems(), nil)
	waitStatus(t, r2, b.ID(), 1, StatusRunning)
	if r2.Dismiss(b.ID(), 1) {
		t.Fatal("a running job must not be dismissable")
	}
	close(release)
}

func TestSweepDropsOldTerminalJobs(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error { return nil })
	defer r.Close()

	a := r.Enqueue(1, KindCopy, sampleItems(), nil)
	waitStatus(t, r, a.ID(), 1, StatusCompleted)

	// Fast-forward past the retain window and sweep synchronously. (The
	// background sweeper ticks once a minute, so it can't race this in-test.)
	r.now = func() time.Time { return time.Now().Add(10 * time.Minute) }
	r.sweep()

	if _, ok := r.Get(a.ID(), 1); ok {
		t.Fatal("a terminal job past the retain window should be swept")
	}
}

func TestLabelAndDest(t *testing.T) {
	if got := label([]Item{{From: "/Movies/The Matrix/", To: "/x"}}); got != "The Matrix" {
		t.Fatalf("single-item label: got %q", got)
	}
	if got := label([]Item{{From: "/a", To: "/x"}, {From: "/b", To: "/y"}}); got != "" {
		t.Fatalf("multi-item label should be empty, got %q", got)
	}
	if got := destDir([]Item{{From: "/a", To: "/Movies/The Matrix"}}); got != "/Movies" {
		t.Fatalf("dest dir: got %q", got)
	}
}

// ── Stage 3: persistence + restore + partial-batch retry ─────────────────────

func TestPersistAndForgetHooks(t *testing.T) {
	var mu sync.Mutex
	saved := map[string]Record{}
	forgotten := map[string]bool{}

	r := New(func(_ context.Context, j *Job) error {
		j.MarkItemDone(0)
		return nil
	})
	defer r.Close()
	r.SetPersistence(
		func(rec Record) { mu.Lock(); saved[rec.ID] = rec; mu.Unlock() },
		func(id string) { mu.Lock(); forgotten[id] = true; mu.Unlock() },
	)

	j := r.Enqueue(1, KindMove, sampleItems(), nil)
	waitStatus(t, r, j.ID(), 1, StatusCompleted)

	mu.Lock()
	defer mu.Unlock()
	// Persisted at least once while in flight, then forgotten on completion.
	if _, ok := saved[j.ID()]; !ok {
		t.Fatal("expected the in-flight job to be persisted")
	}
	if !forgotten[j.ID()] {
		t.Fatal("expected a completed job's record to be forgotten")
	}
}

func TestRestoreMakesInterruptedRetryable(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error { return nil })
	defer r.Close()

	// A record for a 2-item job where item 0 finished before the "crash".
	rec := Record{
		ID:        "abc123",
		UserID:    7,
		Kind:      KindCopy,
		Items:     []Item{{From: "/a", To: "/x/a"}, {From: "/b", To: "/x/b"}},
		ItemsDone: []bool{true, false},
		Name:      "",
		Dest:      "/x",
		CreatedAt: time.Now().Add(-time.Hour),
	}
	r.Restore([]Record{rec})

	v, ok := r.Get("abc123", 7)
	if !ok {
		t.Fatal("restored job not found")
	}
	if v.Status != StatusInterrupted {
		t.Fatalf("status: want interrupted, got %q", v.Status)
	}
	if !v.Retryable {
		t.Fatal("an interrupted job with a pending item should be Retryable")
	}
	// Another user can't see it.
	if _, ok := r.Get("abc123", 99); ok {
		t.Fatal("restored job leaked across users")
	}
	// RetrySource returns ONLY the not-yet-done item (partial-batch retry).
	kind, pending, ok := r.RetrySource("abc123", 7)
	if !ok || kind != KindCopy {
		t.Fatalf("RetrySource: ok=%v kind=%q", ok, kind)
	}
	if len(pending) != 1 || pending[0].From != "/b" {
		t.Fatalf("pending items: want just /b, got %+v", pending)
	}
}

func TestRetrySourceRejectsNonRetryable(t *testing.T) {
	r := New(func(_ context.Context, _ *Job) error { return nil })
	defer r.Close()
	j := r.Enqueue(1, KindCopy, sampleItems(), nil)
	waitStatus(t, r, j.ID(), 1, StatusCompleted)
	// A completed job is not retryable.
	if _, _, ok := r.RetrySource(j.ID(), 1); ok {
		t.Fatal("a completed job must not be retryable")
	}
}
