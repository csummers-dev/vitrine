package share

import (
	"context"
	"errors"
	"sync"
	"time"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// Counter records share views and downloads (4.0 Phase 4.2).
//
// Counts for unlimited links are buffered in memory and written once per
// FlushInterval, so a busy share costs one database write a second rather
// than one per request. Downloads of a download-limited link are written
// at once, under a lock, so the limit holds exactly.
type Counter struct {
	store   *Storage
	now     func() time.Time
	onSaved func(*Link)

	mu      sync.Mutex
	pending map[string]*usage
}

type usage struct {
	views, downloads int64
	at               int64
}

// FlushInterval is how often buffered counts are written.
const FlushInterval = time.Second

// ErrExhausted means a download-limited link has no downloads left.
var ErrExhausted = errors.New("share link has no downloads left")

// NewCounter returns a Counter writing to store. onSaved, if set, is called
// with each link after its new counts are saved (e.g. to notify the owner).
func NewCounter(store *Storage, onSaved func(*Link)) *Counter {
	return &Counter{store: store, now: time.Now, onSaved: onSaved, pending: map[string]*usage{}}
}

func (c *Counter) add(hash string, views, downloads int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	u := c.pending[hash]
	if u == nil {
		u = &usage{}
		c.pending[hash] = u
	}
	u.views += views
	u.downloads += downloads
	u.at = c.now().Unix()
}

// View records an open of the share page.
func (c *Counter) View(hash string) { c.add(hash, 1, 0) }

// Download records a download of an unlimited link. Use TakeDownload for
// links with a MaxDownloads limit.
func (c *Counter) Download(hash string) { c.add(hash, 0, 1) }

// TakeDownload uses up one download of a limited link, failing with
// ErrExhausted when none are left. It saves before returning.
func (c *Counter) TakeDownload(hash string) (*Link, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	l, err := c.store.GetByHash(hash)
	if err != nil {
		return nil, err
	}
	if u := c.pending[hash]; u != nil {
		l.Views += u.views
		l.Downloads += u.downloads
		delete(c.pending, hash)
	}
	if l.Exhausted() {
		return l, ErrExhausted
	}
	l.Downloads++
	l.LastAccessAt = c.now().Unix()
	if err := c.store.Save(l); err != nil {
		return nil, err
	}
	if c.onSaved != nil {
		c.onSaved(l)
	}
	return l, nil
}

// Flush writes all buffered counts. Links deleted in the meantime are
// skipped.
func (c *Counter) Flush() error {
	c.mu.Lock()
	batch := c.pending
	c.pending = map[string]*usage{}
	c.mu.Unlock()

	var errs error
	for hash, u := range batch {
		l, err := c.store.GetByHash(hash)
		if errors.Is(err, fberrors.ErrNotExist) {
			continue
		}
		if err != nil {
			errs = errors.Join(errs, err)
			continue
		}
		l.Views += u.views
		l.Downloads += u.downloads
		if u.at > l.LastAccessAt {
			l.LastAccessAt = u.at
		}
		if err := c.store.Save(l); err != nil {
			errs = errors.Join(errs, err)
			continue
		}
		if c.onSaved != nil {
			c.onSaved(l)
		}
	}
	return errs
}

// Run flushes every FlushInterval until ctx ends, then flushes once more.
func (c *Counter) Run(ctx context.Context, logf func(string, ...any)) {
	t := time.NewTicker(FlushInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			if err := c.Flush(); err != nil && logf != nil {
				logf("share counters: %v", err)
			}
			return
		case <-t.C:
			if err := c.Flush(); err != nil && logf != nil {
				logf("share counters: %v", err)
			}
		}
	}
}

// ReserveUpload checks a drop-box upload of size bytes against the link's
// limits and, if it fits, records it (UploadedBytes, Uploads) before the
// file is written, so concurrent uploads can't overrun MaxTotalSize. Call
// ReleaseUpload if writing the file then fails.
func (c *Counter) ReserveUpload(hash, name string, size int64) (*Link, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	l, err := c.store.GetByHash(hash)
	if err != nil {
		return nil, err
	}
	if u := c.pending[hash]; u != nil {
		l.Views += u.views
		l.Downloads += u.downloads
		delete(c.pending, hash)
	}
	if err := l.CheckUpload(name, size); err != nil {
		return l, err
	}
	l.UploadedBytes += size
	l.Uploads++
	l.LastAccessAt = c.now().Unix()
	if err := c.store.Save(l); err != nil {
		return nil, err
	}
	if c.onSaved != nil {
		c.onSaved(l)
	}
	return l, nil
}

// ReleaseUpload undoes a ReserveUpload whose file wasn't written.
func (c *Counter) ReleaseUpload(hash string, size int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	l, err := c.store.GetByHash(hash)
	if err != nil {
		return
	}
	l.UploadedBytes = max(0, l.UploadedBytes-size)
	l.Uploads = max(0, l.Uploads-1)
	_ = c.store.Save(l)
}
