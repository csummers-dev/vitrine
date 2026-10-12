package fbhttp

import (
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/usagetree"
)

func TestUsageTreeCache(t *testing.T) {
	var deliver func(events.Event)
	c := newUsageTreeCache(func(fn func(events.Event)) func() {
		deliver = fn
		return func() {}
	})
	clock := time.Unix(1_800_000_000, 0)
	c.now = func() time.Time { return clock }
	builds := 0
	build := func() (*usagetree.Result, error) {
		builds++
		return &usagetree.Result{Root: &usagetree.Node{Size: int64(builds)}}, nil
	}

	_, _, _ = c.get("k", false, build)
	_, _, _ = c.get("k", false, build)
	if builds != 1 {
		t.Fatalf("cached tree rebuilt: %d builds", builds)
	}
	_, _, _ = c.get("k", true, build) // refresh=1
	clock = clock.Add(usageTreeTTL + time.Second)
	_, _, _ = c.get("k", false, build) // expired
	deliver(events.FilesChanged{Dir: "/x"})
	res, _, _ := c.get("k", false, build) // cleared by a change
	if builds != 4 || res.Root.Size != 4 {
		t.Errorf("builds = %d", builds)
	}

	for i := range usageTreeMaxEntries + 5 {
		_, _, _ = c.get(string(rune('a'+i)), false, build)
	}
	if len(c.entries) > usageTreeMaxEntries {
		t.Errorf("cache grew to %d entries", len(c.entries))
	}
}
