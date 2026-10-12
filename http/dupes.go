package fbhttp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"path"
	"path/filepath"
	"sync"
	"time"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/dupes"
	"github.com/csummers-dev/vitrine/v4/trash"
)

// Duplicate finder (4.0 Phase 5.2). One scan per user runs in the
// background; the client starts it, polls its progress and reads the
// groups when it's done. Deleting is the normal delete, so it goes to the
// trash and can be undone.

var (
	dupeHashMu sync.RWMutex
	dupeHashes *dupes.HashStore
)

// SetDupeHashStore wires the hash cache used by duplicate scans; without
// one, every scan hashes from scratch.
func SetDupeHashStore(s *dupes.HashStore) {
	dupeHashMu.Lock()
	dupeHashes = s
	dupeHashMu.Unlock()
}

func dupeCacheFor(userID uint) dupes.Cache {
	dupeHashMu.RLock()
	defer dupeHashMu.RUnlock()
	if dupeHashes == nil {
		return nil
	}
	return dupeHashes.ForUser(userID)
}

// maxConcurrentDupeScans bounds disk reads across all users; more scans
// wait their turn.
const maxConcurrentDupeScans = 2

type dupeScanRequest struct {
	Path          string   `json:"path"`
	MinSize       int64    `json:"minSize"`
	IncludeHidden bool     `json:"includeHidden"`
	Exclude       []string `json:"exclude"`
}

type dupeScan struct {
	id      string
	req     dupeScanRequest
	scanner *dupes.Scanner
	cancel  context.CancelFunc

	mu       sync.Mutex
	status   string // queued | running | done | failed | canceled
	errText  string
	started  time.Time
	finished time.Time
	result   *dupes.Result
}

type dupeScanView struct {
	ID         string          `json:"id"`
	Path       string          `json:"path"`
	Options    dupeScanRequest `json:"options"`
	Status     string          `json:"status"`
	Error      string          `json:"error,omitempty"`
	Progress   dupes.Progress  `json:"progress"`
	StartedAt  time.Time       `json:"startedAt"`
	FinishedAt *time.Time      `json:"finishedAt,omitempty"`
	Result     *dupes.Result   `json:"result,omitempty"`
}

func (s *dupeScan) view() dupeScanView {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := dupeScanView{
		ID: s.id, Path: s.req.Path, Options: s.req, Status: s.status,
		Error: s.errText, Progress: s.scanner.Progress(), StartedAt: s.started,
		Result: s.result,
	}
	if !s.finished.IsZero() {
		f := s.finished
		v.FinishedAt = &f
	}
	return v
}

type dupeScanManager struct {
	mu    sync.Mutex
	scans map[uint]*dupeScan
	slots chan struct{}
}

func newDupeScanManager() *dupeScanManager {
	return &dupeScanManager{
		scans: map[uint]*dupeScan{},
		slots: make(chan struct{}, maxConcurrentDupeScans),
	}
}

func newScanID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// start replaces the user's scan (canceling a running one) with a new one.
func (m *dupeScanManager) start(userID uint, afs afero.Fs, allowed func(string) bool, req dupeScanRequest) *dupeScan {
	ctx, cancel := context.WithCancel(context.Background())
	s := &dupeScan{
		id:  newScanID(),
		req: req,
		scanner: &dupes.Scanner{
			Walk:  func(root string, fn filepath.WalkFunc) error { return afero.Walk(afs, root, fn) },
			Open:  func(p string) (dupes.File, error) { return afs.Open(p) },
			Cache: dupeCacheFor(userID),
		},
		cancel:  cancel,
		status:  "queued",
		started: time.Now(),
	}
	m.mu.Lock()
	if old := m.scans[userID]; old != nil {
		old.cancel()
	}
	m.scans[userID] = s
	m.mu.Unlock()

	go func() {
		defer cancel()
		select {
		case m.slots <- struct{}{}:
			defer func() { <-m.slots }()
		case <-ctx.Done():
			s.finish(nil, ctx.Err())
			return
		}
		s.mu.Lock()
		s.status = "running"
		s.mu.Unlock()
		res, err := s.scanner.Scan(ctx, req.Path, dupes.Options{
			MinSize:       req.MinSize,
			IncludeHidden: req.IncludeHidden,
			Exclude:       req.Exclude,
			Allowed:       allowed,
			SkipDir:       func(name string) bool { return name == trash.Dirname },
		})
		s.finish(res, err)
	}()
	return s
}

func (s *dupeScan) finish(res *dupes.Result, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.finished = time.Now()
	switch {
	case errors.Is(err, context.Canceled):
		s.status = "canceled"
	case err != nil:
		s.status, s.errText = "failed", err.Error()
	default:
		s.status, s.result = "done", res
	}
}

func (m *dupeScanManager) get(userID uint) *dupeScan {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.scans[userID]
}

func (m *dupeScanManager) stop(userID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.scans[userID]; s != nil {
		s.cancel()
		delete(m.scans, userID)
	}
}

// prune drops files that no longer exist (deleted since the scan, usually
// from these results) and groups left with a single copy.
func (s *dupeScan) prune(exists func(p string) bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.result == nil {
		return
	}
	kept := s.result.Groups[:0]
	var reclaim int64
	for _, g := range s.result.Groups {
		files := g.Files[:0]
		for _, f := range g.Files {
			if exists(f.Path) {
				files = append(files, f)
			}
		}
		g.Files = files
		if len(g.Files) > 1 {
			kept = append(kept, g)
			reclaim += g.Reclaimable()
		}
	}
	s.result.Groups = kept
	s.result.Reclaimable = reclaim
}

func dupesStartHandler(m *dupeScanManager) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		var req dupeScanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return http.StatusBadRequest, err
		}
		req.Path = path.Clean("/" + req.Path)
		if !d.Check(req.Path) {
			return http.StatusForbidden, nil
		}
		info, err := d.user.Fs.Stat(req.Path)
		if err != nil {
			return errToStatus(err), err
		}
		if !info.IsDir() {
			return http.StatusBadRequest, errors.New("dupes: not a folder")
		}
		if req.MinSize < 0 {
			req.MinSize = 0
		}
		if len(req.Exclude) > 100 {
			req.Exclude = req.Exclude[:100]
		}
		s := m.start(d.user.ID, d.user.Fs, d.Check, req)
		return renderJSON(w, r, s.view())
	})
}

func dupesGetHandler(m *dupeScanManager) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		s := m.get(d.user.ID)
		if s == nil {
			return http.StatusNotFound, nil
		}
		s.prune(func(p string) bool {
			_, err := d.user.Fs.Stat(p)
			return err == nil
		})
		return renderJSON(w, r, s.view())
	})
}

func dupesStopHandler(m *dupeScanManager) handleFunc {
	return withUser(func(_ http.ResponseWriter, _ *http.Request, d *data) (int, error) {
		m.stop(d.user.ID)
		return http.StatusNoContent, nil
	})
}
