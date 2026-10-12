package fbhttp

import (
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/usagetree"
)

const (
	usageTreeTTL        = 2 * time.Minute
	usageTreeMaxEntries = 32
)

type usageTreeEntry struct {
	res *usagetree.Result
	at  time.Time
}

// usageTreeCache keeps recent trees so moving around the Storage view
// doesn't re-walk the disk. Any file change clears it; a short TTL covers
// changes made outside vitrine.
type usageTreeCache struct {
	mu      sync.Mutex
	entries map[string]usageTreeEntry
	sf      singleflight.Group
	now     func() time.Time
}

func newUsageTreeCache(subscribe func(func(events.Event)) func()) *usageTreeCache {
	c := &usageTreeCache{entries: map[string]usageTreeEntry{}, now: time.Now}
	if subscribe != nil {
		subscribe(c.onEvent) // server lifetime: never unsubscribed
	}
	return c
}

func (c *usageTreeCache) onEvent(e events.Event) {
	switch e.(type) {
	case events.FileCreated, events.FileDeleted, events.FileUploaded,
		events.FileModified, events.FileRenamed, events.FileMoved,
		events.FileCopied, events.FilesChanged:
		c.mu.Lock()
		clear(c.entries)
		c.mu.Unlock()
	}
}

func (c *usageTreeCache) get(key string, fresh bool, build func() (*usagetree.Result, error)) (*usagetree.Result, time.Time, error) {
	if !fresh {
		c.mu.Lock()
		e, ok := c.entries[key]
		c.mu.Unlock()
		if ok && c.now().Sub(e.at) < usageTreeTTL {
			return e.res, e.at, nil
		}
	}
	v, err, _ := c.sf.Do(key, func() (any, error) {
		res, err := build()
		if err != nil {
			return nil, err
		}
		e := usageTreeEntry{res: res, at: c.now()}
		c.mu.Lock()
		if len(c.entries) >= usageTreeMaxEntries {
			c.evictOldest()
		}
		c.entries[key] = e
		c.mu.Unlock()
		return e, nil
	})
	if err != nil {
		return nil, time.Time{}, err
	}
	e := v.(usageTreeEntry)
	return e.res, e.at, nil
}

func (c *usageTreeCache) evictOldest() {
	var oldest string
	var at time.Time
	for k, e := range c.entries {
		if oldest == "" || e.at.Before(at) {
			oldest, at = k, e.at
		}
	}
	delete(c.entries, oldest)
}
