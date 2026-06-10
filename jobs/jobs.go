// Package jobs is an in-memory registry of background transfer jobs (move /
// copy). It exists so a large cross-volume copy can run detached from the
// originating HTTP request while the UI polls progress and survives a browser
// reload.
//
// Per docs/transfers-plan.md the design is deliberately small:
//   - state lives in memory only (a browser reload re-queries live jobs; a
//     server restart ends them — the transfer itself dies on restart anyway);
//   - two worker lanes: copies and cross-volume moves run one-at-a-time on a
//     sequential MAIN worker (parallel large copies only thrash the same disks),
//     while same-volume moves — instant rename() metadata ops that don't thrash
//     disks — run on a separate FAST lane so they needn't wait behind a long
//     copy (see Registry.EnqueueFast);
//   - the actual filesystem work is an injected Executor, so this package has
//     no dependency on fileutils/afero and is unit-testable with a fake.
//
// Concurrency: the hot per-chunk counters (bytes/files) are atomics updated by
// the Executor's copy loop; everything else sits behind the job mutex. Reads go
// through Snapshot(), which returns a JSON-safe, lock-free copy (JobView).
package jobs

import (
	"sync"
	"sync/atomic"
	"time"
)

// Status is a transfer job's lifecycle state.
type Status string

const (
	StatusQueued    Status = "queued"
	StatusRunning   Status = "running"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
	StatusCanceled  Status = "canceled"
	// StatusInterrupted is set ONLY at startup for a job that was in flight
	// (queued/running) when the process died — recovered from the persisted
	// record (2.4.0 Stage 3). The transfer itself didn't survive; the job sits
	// in the dock with a Retry affordance and isn't scheduled on any worker.
	StatusInterrupted Status = "interrupted"
)

// Terminal reports whether the status is final (won't change on its own).
// Interrupted counts as terminal: the original run is over and the job only
// changes via an explicit Retry or Dismiss.
func (s Status) Terminal() bool {
	return s == StatusCompleted || s == StatusFailed ||
		s == StatusCanceled || s == StatusInterrupted
}

// Kind distinguishes a move from a copy (affects the verb shown + whether the
// source is removed; the Executor owns that behavior).
type Kind string

const (
	KindMove Kind = "move"
	KindCopy Kind = "copy"
)

// Item is one source→destination pair within a transfer. Paths are whatever the
// caller uses (scope-relative in the HTTP layer); this package only displays
// and forwards them.
type Item struct {
	From      string
	To        string
	Overwrite bool
	Rename    bool
}

// Job is a single transfer: a batch of items moved or copied together.
type Job struct {
	id      string
	userID  uint
	kind    Kind
	items   []Item
	name    string // display label: single item's base name, else "" (UI shows "N items")
	dest    string // destination directory shared by the items (for the UI)
	payload any    // opaque per-job execution context for the Executor (e.g. the user's fs + event base); never serialized

	// Hot counters — updated per chunk/file by the Executor without the lock.
	doneBytes int64
	filesDone int64

	mu          sync.Mutex
	status      Status
	totalBytes  int64
	fileCount   int
	currentName string
	currentTo   string
	errMsg      string
	createdAt   time.Time
	startedAt   time.Time
	finishedAt  time.Time
	cancel      func() // non-nil only while running
	canceled    bool   // a cancel was requested (queued or running)
	// itemsDone[i] is true once item i has fully transferred — persisted so a
	// Retry (manual, or of an interrupted-on-restart job) re-runs ONLY the
	// items that hadn't finished (2.4.0 Stage 3). Same length as items.
	itemsDone []bool
}

// ID returns the job's opaque id.
func (j *Job) ID() string { return j.id }

// UserID returns the owning user.
func (j *Job) UserID() uint { return j.userID }

// Kind returns move/copy.
func (j *Job) Kind() Kind { return j.kind }

// Items returns the transfer's items (do not mutate).
func (j *Job) Items() []Item { return j.items }

// Payload returns the opaque execution context attached at Enqueue (nil if
// none). The Executor type-asserts it to whatever it stored.
func (j *Job) Payload() any { return j.payload }

// MarkComplete pins the byte/file counters to their totals. Call on full
// success so an instant (same-volume rename) move — which copies nothing and
// therefore reports no bytes — still shows 100% / N-of-N.
func (j *Job) MarkComplete() {
	j.mu.Lock()
	atomic.StoreInt64(&j.doneBytes, j.totalBytes)
	atomic.StoreInt64(&j.filesDone, int64(j.fileCount))
	j.mu.Unlock()
}

// ── Progress API (called by the Executor) ───────────────────────────────────

// SetTotals records the pre-walk totals so the percentage is meaningful from
// the first poll onward.
func (j *Job) SetTotals(totalBytes int64, fileCount int) {
	j.mu.Lock()
	j.totalBytes = totalBytes
	j.fileCount = fileCount
	j.mu.Unlock()
}

// AddBytes adds n freshly-copied bytes. Hot path — atomic, no lock.
func (j *Job) AddBytes(n int64) { atomic.AddInt64(&j.doneBytes, n) }

// StartFile marks the file currently being transferred (name + destination).
func (j *Job) StartFile(name, to string) {
	j.mu.Lock()
	j.currentName = name
	j.currentTo = to
	j.mu.Unlock()
}

// FinishFile increments the completed-file counter.
func (j *Job) FinishFile() { atomic.AddInt64(&j.filesDone, 1) }

// MarkItemDone records that item i has fully transferred (for partial-batch
// Retry). Out-of-range indices are ignored. Returns the now-complete snapshot
// flags so the caller can persist them.
func (j *Job) MarkItemDone(i int) {
	j.mu.Lock()
	if i >= 0 && i < len(j.itemsDone) {
		j.itemsDone[i] = true
	}
	j.mu.Unlock()
}

// ItemsDone returns a copy of the per-item completion flags.
func (j *Job) ItemsDone() []bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := make([]bool, len(j.itemsDone))
	copy(out, j.itemsDone)
	return out
}

// PendingItems returns the items that haven't finished yet — the input for a
// Retry. For a fresh or fully-failed job that's every item.
func (j *Job) PendingItems() []Item {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := make([]Item, 0, len(j.items))
	for i, it := range j.items {
		if i < len(j.itemsDone) && j.itemsDone[i] {
			continue
		}
		out = append(out, it)
	}
	return out
}

// Canceled reports whether cancellation was requested. Executors honor ctx
// cancellation; this is an extra signal for loops that don't thread ctx.
func (j *Job) Canceled() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.canceled
}

// JobView is the JSON-safe, lock-free snapshot returned over HTTP / to tests.
type JobView struct {
	ID     string `json:"id"`
	Kind   Kind   `json:"kind"`
	Status Status `json:"status"`
	Name   string `json:"name"`
	Dest   string `json:"dest"`
	// ToPaths are the items' RESOLVED destination paths (scope-relative), with
	// any "(1)" version suffix already applied for same-folder copies — so the
	// UI can select the actual new copies, not the originals.
	ToPaths []string `json:"toPaths"`
	// FromPaths are the items' source paths (scope-relative). The UI compares
	// them against the current selection to detect that the user has moved on
	// to other files mid-transfer, and then leaves their selection alone.
	FromPaths   []string  `json:"fromPaths"`
	ItemCount   int       `json:"itemCount"`
	TotalBytes  int64     `json:"totalBytes"`
	DoneBytes   int64     `json:"doneBytes"`
	FileCount   int       `json:"fileCount"`
	FilesDone   int       `json:"filesDone"`
	CurrentName string    `json:"currentName"`
	CurrentTo   string    `json:"currentTo"`
	Error       string    `json:"error,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	StartedAt   time.Time `json:"startedAt,omitempty"`
	FinishedAt  time.Time `json:"finishedAt,omitempty"`
	// Retryable is true when the job can be re-run (failed, canceled, or
	// interrupted-on-restart) AND at least one item hasn't finished — drives
	// the dock's Retry button (2.4.0 Stage 3).
	Retryable bool `json:"retryable"`
}

// Snapshot returns a consistent point-in-time view of the job.
func (j *Job) Snapshot() JobView {
	j.mu.Lock()
	defer j.mu.Unlock()
	toPaths := make([]string, len(j.items))
	fromPaths := make([]string, len(j.items))
	for i, it := range j.items {
		toPaths[i] = it.To
		fromPaths[i] = it.From
	}
	pending := false
	for i := range j.items {
		if i >= len(j.itemsDone) || !j.itemsDone[i] {
			pending = true
			break
		}
	}
	retryable := pending &&
		(j.status == StatusFailed || j.status == StatusCanceled || j.status == StatusInterrupted)
	return JobView{
		ID:          j.id,
		Kind:        j.kind,
		Status:      j.status,
		Name:        j.name,
		Dest:        j.dest,
		ToPaths:     toPaths,
		FromPaths:   fromPaths,
		ItemCount:   len(j.items),
		TotalBytes:  j.totalBytes,
		DoneBytes:   atomic.LoadInt64(&j.doneBytes),
		FileCount:   j.fileCount,
		FilesDone:   int(atomic.LoadInt64(&j.filesDone)),
		CurrentName: j.currentName,
		CurrentTo:   j.currentTo,
		Error:       j.errMsg,
		CreatedAt:   j.createdAt,
		StartedAt:   j.startedAt,
		FinishedAt:  j.finishedAt,
		Retryable:   retryable,
	}
}

// Record is the serializable persistence form of a job (2.4.0 Stage 3). Only
// IN-FLIGHT jobs are persisted; on restart each becomes an interrupted job.
// Carries everything needed to (a) render the dock row and (b) Retry the
// not-yet-done items — but NOT the execution payload (the user's fs), which the
// Retry request rebuilds from its own authenticated context.
type Record struct {
	ID        string    `json:"id"`
	UserID    uint      `json:"userId"`
	Kind      Kind      `json:"kind"`
	Items     []Item    `json:"items"`
	ItemsDone []bool    `json:"itemsDone"`
	Name      string    `json:"name"`
	Dest      string    `json:"dest"`
	CreatedAt time.Time `json:"createdAt"`
}

// Record captures the job's persistence form (call under no external lock).
func (j *Job) Record() Record {
	j.mu.Lock()
	defer j.mu.Unlock()
	items := make([]Item, len(j.items))
	copy(items, j.items)
	done := make([]bool, len(j.itemsDone))
	copy(done, j.itemsDone)
	return Record{
		ID:        j.id,
		UserID:    j.userID,
		Kind:      j.kind,
		Items:     items,
		ItemsDone: done,
		Name:      j.name,
		Dest:      j.dest,
		CreatedAt: j.createdAt,
	}
}
