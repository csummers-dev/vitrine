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

// Registry owns every transfer job and runs them through two worker lanes: a
// MAIN sequential lane (copies + cross-volume moves — one active transfer, the
// rest queue, so parallel large copies don't thrash the same disks) and a FAST
// lane for same-volume moves (instant rename() metadata ops, which don't thrash
// disks and so are safe to run alongside a copy). All reads are scoped per-user.
type Registry struct {
	mu    sync.Mutex
	jobs  map[string]*Job
	order []string // creation order, for stable listing + sweeping

	queue     chan *Job // main lane: copies + cross-volume moves (sequential)
	fastQueue chan *Job // fast lane: same-volume moves (instant renames)
	exec      Executor
	retain    time.Duration
	now       func() time.Time
	stop      chan struct{}

	// Persistence hooks (2.4.0 Stage 3) — optional; nil = in-memory only.
	// persist is called whenever an in-flight job's state changes; forget when
	// a job becomes terminal or is dismissed (so the store holds only in-flight
	// jobs, and the sole post-restart state is "interrupted").
	persist func(Record)
	forget  func(id string)
}

// New creates a registry and starts its sequential worker + TTL sweeper. exec
// runs each job's filesystem work.
func New(exec Executor) *Registry {
	r := &Registry{
		jobs:      map[string]*Job{},
		queue:     make(chan *Job, defaultQueueCap),
		fastQueue: make(chan *Job, defaultQueueCap),
		exec:      exec,
		retain:    defaultRetain,
		now:       time.Now,
		stop:      make(chan struct{}),
	}
	go r.worker(r.queue)     // main lane
	go r.worker(r.fastQueue) // fast lane (same-volume moves)
	go r.sweeper()
	return r
}

// SetPersistence wires the bolt-backed store (2.4.0 Stage 3). Call once,
// before any Enqueue. `persist` records an in-flight job, `forget` drops it.
func (r *Registry) SetPersistence(persist func(Record), forget func(id string)) {
	r.persist = persist
	r.forget = forget
}

// savePersist records the job if persistence is wired (no-op otherwise).
func (r *Registry) savePersist(j *Job) {
	if r.persist != nil {
		r.persist(j.Record())
	}
}

// dropPersist forgets the job's record if persistence is wired.
func (r *Registry) dropPersist(id string) {
	if r.forget != nil {
		r.forget(id)
	}
}

// Restore re-registers jobs that were in flight when the process died, as
// non-scheduled `interrupted` jobs the dock shows with a Retry button (2.4.0
// Stage 3). Called once at startup with the persisted records. finishedAt is
// left zero so the TTL sweeper never reaps them — they linger until the user
// retries or dismisses.
func (r *Registry) Restore(records []Record) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, rec := range records {
		if _, exists := r.jobs[rec.ID]; exists {
			continue
		}
		done := make([]bool, len(rec.Items))
		copy(done, rec.ItemsDone)
		j := &Job{
			id:        rec.ID,
			userID:    rec.UserID,
			kind:      rec.Kind,
			items:     rec.Items,
			name:      rec.Name,
			dest:      rec.Dest,
			status:    StatusInterrupted,
			createdAt: rec.CreatedAt,
			itemsDone: done,
		}
		r.jobs[j.id] = j
		r.order = append(r.order, j.id)
	}
}

// Close stops the worker + sweeper goroutines. A job already running is left to
// finish. Intended for shutdown / tests.
func (r *Registry) Close() { close(r.stop) }

func newID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Enqueue registers a new job on the MAIN (sequential) worker lane and returns
// it immediately (status queued, or running shortly). Copies and cross-volume
// moves run here, one at a time.
func (r *Registry) Enqueue(userID uint, kind Kind, items []Item, payload any) *Job {
	j, _ := r.enqueue(r.queue, userID, kind, items, payload)
	return j
}

// EnqueueFast registers a move on the FAST worker lane — used for same-volume
// moves, which are instant rename() metadata ops that needn't wait behind a long
// cross-volume copy on the main lane (a rename doesn't thrash disks, so running
// it concurrently is safe). It returns BOTH the job and its creation-time
// snapshot: the fast lane can finish the rename before the caller would get
// around to calling Snapshot(), so returning the pre-scheduled (queued) view
// guarantees a non-terminal HTTP response and lets the UI observe the normal
// queued→completed transition via polling (see http/transfers.go).
func (r *Registry) EnqueueFast(userID uint, kind Kind, items []Item, payload any) (*Job, JobView) {
	return r.enqueue(r.fastQueue, userID, kind, items, payload)
}

// enqueue registers a job, captures its initial (queued) snapshot BEFORE handing
// it to a worker — so the returned view is always non-terminal even when the
// lane finishes instantly — then schedules it on q. If q is somehow saturated
// the job is marked failed rather than blocking the caller. payload is opaque
// execution context the Executor reads back via Job.Payload().
func (r *Registry) enqueue(q chan *Job, userID uint, kind Kind, items []Item, payload any) (*Job, JobView) {
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
		itemsDone: make([]bool, len(items)),
	}

	r.mu.Lock()
	r.jobs[j.id] = j
	r.order = append(r.order, j.id)
	r.mu.Unlock()
	r.savePersist(j) // record the in-flight job (Stage 3)

	// Snapshot BEFORE scheduling: until the channel send below, no worker can
	// hold j, so this view is guaranteed status=queued.
	view := j.Snapshot()

	select {
	case q <- j:
	default:
		j.mu.Lock()
		j.status = StatusFailed
		j.errMsg = "transfer queue is full"
		j.finishedAt = r.now()
		j.mu.Unlock()
		r.dropPersist(j.id) // terminal → forget
		view = j.Snapshot()
	}
	return j, view
}

// PersistProgress re-records the job's in-flight state (call after item-done
// updates so a restart's interrupted retry skips finished items). No-op without
// a persister.
func (r *Registry) PersistProgress(j *Job) { r.savePersist(j) }

// RetrySource returns a retryable job's kind + not-yet-finished items, so the
// caller can rebuild a payload and re-enqueue them. ok=false when the job is
// missing, not owned by userID, not retryable, or has nothing pending.
func (r *Registry) RetrySource(id string, userID uint) (Kind, []Item, bool) {
	r.mu.Lock()
	j, ok := r.jobs[id]
	r.mu.Unlock()
	if !ok || j.userID != userID {
		return "", nil, false
	}
	j.mu.Lock()
	retryable := j.status == StatusFailed || j.status == StatusCanceled ||
		j.status == StatusInterrupted
	kind := j.kind
	j.mu.Unlock()
	if !retryable {
		return "", nil, false
	}
	pending := j.PendingItems()
	if len(pending) == 0 {
		return "", nil, false
	}
	return kind, pending, true
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
	r.dropPersist(id) // also drop any lingering interrupted-job record
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

// worker pulls jobs off q and runs them one at a time. Two run concurrently —
// one per lane (r.queue, r.fastQueue) — which is safe because run() touches only
// the job's own mutex plus read-only registry fields, and a given job is only
// ever sent to one lane.
func (r *Registry) worker(q chan *Job) {
	for {
		select {
		case <-r.stop:
			return
		case j := <-q:
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
		r.dropPersist(j.id) // terminal → forget
		return
	}
	j.status = StatusRunning
	j.startedAt = r.now()
	j.cancel = cancel
	j.mu.Unlock()
	r.savePersist(j) // now running

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
	r.dropPersist(j.id) // terminal → forget (only in-flight jobs are persisted)
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
