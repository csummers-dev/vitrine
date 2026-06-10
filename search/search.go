package search

import (
	"context"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/spf13/afero"

	"github.com/filebrowser/filebrowser/v2/rules"
)

type searchOptions struct {
	CaseSensitive bool
	Conditions    []condition
	Terms         []string
}

// Matcher is a parsed search query that can test a single path/name WITHOUT
// touching the filesystem. It's the shared matching core so the live FS-walk
// (Search, below) and the in-memory search index (the searchindex package,
// 2.4.0 Stage 5) apply identical query semantics — type/extension conditions +
// case-aware substring terms over the file name.
type Matcher struct {
	opts *searchOptions
}

// NewMatcher parses a query string into a reusable Matcher.
func NewMatcher(query string) *Matcher {
	return &Matcher{opts: parseSearch(query)}
}

// Match reports whether the file at fullPath (with base name `name`) satisfies
// the query: type/extension conditions form an OR-set that must hit at least
// once when any are present, and — when search terms are present — the name must
// contain at least one term (case-folded unless `case:sensitive`). A query with
// neither conditions nor terms matches everything.
func (m *Matcher) Match(fullPath, name string) bool {
	o := m.opts
	if len(o.Conditions) > 0 {
		matched := false
		for _, c := range o.Conditions {
			if c(fullPath) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if len(o.Terms) > 0 {
		for _, term := range o.Terms {
			n, t := name, term
			if !o.CaseSensitive {
				n = strings.ToLower(n)
				t = strings.ToLower(t)
			}
			if strings.Contains(n, t) {
				return true
			}
		}
		return false
	}
	return true
}

// Search searches for a query in a fs by walking it live. Used as the result
// source when the in-memory index isn't ready yet — and as the ground truth the
// index is built from.
func Search(ctx context.Context,
	fs afero.Fs, scope, query string, checker rules.Checker, found func(path string, f os.FileInfo) error) error {
	matcher := NewMatcher(query)

	scope = filepath.ToSlash(filepath.Clean(scope))
	scope = path.Join("/", scope)

	return afero.Walk(fs, scope, func(fPath string, f os.FileInfo, _ error) error {
		if ctx.Err() != nil {
			return context.Cause(ctx)
		}
		if f == nil {
			return nil // walk error on this entry — skip it
		}
		fPath = filepath.ToSlash(filepath.Clean(fPath))
		fPath = path.Join("/", fPath)
		relativePath := strings.TrimPrefix(fPath, scope)
		relativePath = strings.TrimPrefix(relativePath, "/")

		if fPath == scope {
			return nil
		}

		// 2.4.0 Stage 2: never descend into trash directories — trashed items
		// are browsed via the Trash view, not found by search. Name kept in
		// sync with trash.Dirname.
		if f.IsDir() && f.Name() == ".trash" {
			return filepath.SkipDir
		}

		if !checker.Check(fPath) {
			return nil
		}

		if !matcher.Match(fPath, f.Name()) {
			return nil
		}

		return found(relativePath, f)
	})
}
