package fswatch

import (
	"io/fs"
	"path"
	"path/filepath"
	"sort"
	"time"
)

// pollLoop detects structure changes by comparing directory mtimes every
// PollInterval. The first scan only records a baseline.
func (w *Watcher) pollLoop() {
	prev := w.scanDirs()
	tick := time.NewTicker(w.opts.PollInterval)
	defer tick.Stop()
	for {
		select {
		case <-w.done:
			return
		case <-tick.C:
			next := w.scanDirs()
			for _, c := range diffScans(prev, next) {
				w.opts.OnChange(c)
			}
			prev = next
		}
	}
}

// scanDirs maps every non-skipped directory (root-relative) to its mtime.
func (w *Watcher) scanDirs() map[string]time.Time {
	out := map[string]time.Time{}
	_ = filepath.WalkDir(w.root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if d != nil && d.IsDir() && p != w.root {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		rel, ok := w.rel(p)
		if !ok {
			return filepath.SkipDir
		}
		if rel != "/" && w.opts.Skip(rel) {
			return filepath.SkipDir
		}
		if info, err := d.Info(); err == nil {
			out[rel] = info.ModTime()
		}
		return nil
	})
	return out
}

// diffScans reports directories whose contents changed between two scans:
// any directory with a new mtime, and the parent of any directory that
// appeared or disappeared (Names nil: refresh the whole directory).
func diffScans(prev, next map[string]time.Time) []Change {
	changed := map[string]struct{}{}
	for dir, mt := range next {
		old, seen := prev[dir]
		if !seen {
			if dir != "/" {
				changed[path.Dir(dir)] = struct{}{}
			}
			continue
		}
		if !mt.Equal(old) {
			changed[dir] = struct{}{}
		}
	}
	for dir := range prev {
		if _, still := next[dir]; !still && dir != "/" {
			changed[path.Dir(dir)] = struct{}{}
		}
	}
	out := make([]Change, 0, len(changed))
	for dir := range changed {
		// A changed directory that itself vanished has nothing to refresh.
		if _, ok := next[dir]; !ok {
			continue
		}
		out = append(out, Change{Dir: dir})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Dir < out[j].Dir })
	return out
}
