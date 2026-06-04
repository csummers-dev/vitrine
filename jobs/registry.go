package jobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"path"
	"strings"
	"sync"
	"time"
)

// Executor performs the actual filesystem work for a job, updating progress via
// the Job's methods and honoring ctx cancellation. Injected so this package
// stays decoupled from fileutils/afero and is unit-testable with a fake.
type Executor func(ctx context.Context, j *Job) error

const (
	defaultQueueCap = 256
	defaultRetain   = 5 * time.Minute
	sweepEvery      = time.Minute
)

// Registry owns every transfer job and runs them through a single sequential
// worker (one active transfer; the rest queue). All reads are scoped per-user.
type Registry struct {
	mu    sync.Mutex
	jobs  map[string]*Job
	order []string // creation order, for stable listing + sweeping

	queue  chan *Job
	exec   Executor
	retain time.Duration
	now    func() time.Time
	stop   chan struct{}
}

// New creates a registry and starts its sequential worker + TTL sweeper. exec
// runs each job's filesystem work.
func New(exec Executor) *Registry {
	r := &Registry{
		jobs:   map[string]*Job{},
		queue:  make(chan *Job, defaultQueueCap),
		exec:   exec,
		retain: defaultRetain,
		now:    time.Now,
		stop:   make(chan struct{}),
	}
	go r.worker()
	go r.sweeper()
	return r
}

// Close stops the worker + sweeper goroutines. A job already running is left to
// finish. Intended for shutdown / tests.
func (r *Registry) Close() { close(r.stop) }

func newID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Enqueue registers a new job and schedules it. Returns immediately with the
// job (status queued, or running shortly). If the queue is somehow saturated
// the job is marked failed rather than blocking the caller. payload is opaque
// execution context the Executor reads back via Job.Payload().
func (r *Registry) Enqueue(userID uint, kind Kind, items []Item, payload any) *Job {
	j := &Job{
		id:        newID(),
		userID:    userID,
		kind:      kind,
		items:     items,
		payload:   payload,
		name:      label(items),
		dest:      destDir(items),
		status:    StatusQueued,
		createdAt: r.now(),
	}

	r.mu.Lock()
	r.jobs[j.id] = j
	r.order = append(r.order, j.id)
	r.mu.Unlock()

	select {
	case r.queue <- j:
	default:
		j.mu.Lock()
		j.status = StatusFailed
		j.errMsg = "transfer queue is full"
		j.finishedAt = r.now()
		j.mu.Unlock()
	}
	return j
}

// Cancel requests cancellation of a job owned by userID. Returns true if the
// job exists, belongs to the user, and was cancelable (queued or running).
func (r *Registry) Cancel(id string, userID uint) bool {
	r.mu.Lock()
	j, ok := r.jobs[id]
	r.mu.Unlock()
	if !ok || j.userID != userID {
		return false
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.status.Terminal() {
		return false
	}
	j.canceled = true
	if j.cancel != nil {
		j.cancel() // running → cancel its context
	}
	return true
}

// Dismiss removes a finished job from the registry. Returns false if it's
// missing, not owned by userID, or still active (cancel it first).
func (r *Registry) Dismiss(id string, userID uint) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	j, ok := r.jobs[id]
	if !ok || j.userID != userID {
		return false
	}
	j.mu.Lock()
	terminal := j.status.Terminal()
	j.mu.Unlock()
	if !terminal {
		return false
	}
	delete(r.jobs, id)
	r.removeOrderLocked(id)
	return true
}

// List returns snapshots of userID's jobs in creation order.
func (r *Registry) List(userID uint) []JobView {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]JobView, 0, len(r.order))
	for _, id := range r.order {
		j := r.jobs[id]
		if j == nil || j.userID != userID {
			continue
		}
		out = append(out, j.Snapshot())
	}
	return out
}

// Get returns one job's snapshot if it exists and belongs to userID.
func (r *Registry) Get(id string, userID uint) (JobView, bool) {
	r.mu.Lock()
	j, ok := r.jobs[id]
	r.mu.Unlock()
	if !ok || j.userID != userID {
		return JobView{}, false
	}
	return j.Snapshot(), true
}

// ── internals ────────────────────────────────────────────────────────────────

func (r *Registry) worker() {
	for {
		select {
		case <-r.stop:
			return
		case j := <-r.queue:
			r.run(j)
		}
	}
}

func (r *Registry) run(j *Job) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Transition queued→running, unless cancellation was requested while queued.
	j.mu.Lock()
	if j.canceled {
		j.status = StatusCanceled
		j.finishedAt = r.now()
		j.mu.Unlock()
		return
	}
	j.status = StatusRunning
	j.startedAt = r.now()
	j.cancel = cancel
	j.mu.Unlock()

	err := r.exec(ctx, j)

	j.mu.Lock()
	j.cancel = nil
	j.finishedAt = r.now()
	switch {
	case j.canceled || ctx.Err() != nil:
		j.status = StatusCanceled
	case err != nil:
		j.status = StatusFailed
		j.errMsg = err.Error()
	default:
		j.status = StatusCompleted
	}
	j.mu.Unlock()
}

func (r *Registry) sweeper() {
	ticker := time.NewTicker(sweepEvery)
	defer ticker.Stop()
	for {
		select {
		case <-r.stop:
			return
		case <-ticker.C:
			r.sweep()
		}
	}
}

// sweep drops terminal jobs that finished longer ago than the retain window, so
// the registry doesn't grow without bound over a long session.
func (r *Registry) sweep() {
	cutoff := r.now().Add(-r.retain)
	r.mu.Lock()
	defer r.mu.Unlock()
	kept := r.order[:0]
	for _, id := range r.order {
		j := r.jobs[id]
		if j == nil {
			continue
		}
		j.mu.Lock()
		drop := j.status.Terminal() && !j.finishedAt.IsZero() && j.finishedAt.Before(cutoff)
		j.mu.Unlock()
		if drop {
			delete(r.jobs, id)
			continue
		}
		kept = append(kept, id)
	}
	r.order = kept
}

func (r *Registry) removeOrderLocked(id string) {
	for i, x := range r.order {
		if x == id {
			r.order = append(r.order[:i], r.order[i+1:]...)
			return
		}
	}
}

// label is the single-item display name (base of the source path), or "" for a
// multi-item transfer (the UI renders "N items" from ItemCount instead).
func label(items []Item) string {
	if len(items) == 1 {
		return path.Base(strings.TrimRight(items[0].From, "/"))
	}
	return ""
}

// destDir is the destination directory shared by the items, for the UI's
// "→ /Movies" hint.
func destDir(items []Item) string {
	if len(items) == 0 {
		return ""
	}
	return path.Dir(strings.TrimRight(items[0].To, "/"))
}
