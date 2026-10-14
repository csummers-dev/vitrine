// Package usagetree measures what uses space under a folder (4.0 Phase 5.1):
// a size tree a few levels deep for the Storage treemap, plus the largest
// files anywhere below. One walk produces both.
//
// It takes a walk function rather than a filesystem so the HTTP layer can
// hand it the user's scoped afero.Fs and tests can use a temp directory.
package usagetree

import (
	"container/heap"
	"io/fs"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Node is a folder or file in the tree. Folders deeper than the requested
// depth are leaves whose Size covers everything under them.
type Node struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Size  int64  `json:"size"`
	Files int    `json:"files"`
	IsDir bool   `json:"isDir"`
	// Kind is the file kind (image, video, audio, pdf, text, archive) or,
	// for a folder, the kind using the most bytes in it. Empty when mixed
	// or unknown.
	Kind string `json:"kind,omitempty"`
	// Other marks the aggregate of the smallest children beyond the cap.
	Other    bool    `json:"other,omitempty"`
	Children []*Node `json:"children,omitempty"`

	kindBytes map[string]int64
}

// File is one entry in the largest-files list.
type File struct {
	Path     string    `json:"path"`
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Kind     string    `json:"kind,omitempty"`
}

// Result is the tree and the largest files.
type Result struct {
	Root    *Node  `json:"root"`
	Largest []File `json:"largest"`
}

// WalkFunc walks the tree under root, like filepath.Walk.
type WalkFunc func(root string, fn filepath.WalkFunc) error

// Options tune Build. Zero values pick the defaults.
type Options struct {
	// Depth is how many levels below root get their own nodes (default 2).
	Depth int
	// MaxChildren caps each folder's children; the rest merge into one
	// "Other" node (default 60).
	MaxChildren int
	// Largest is how many of the biggest files to return (default 50).
	Largest int
	// Allowed reports whether a path may be shown (the user's rules).
	Allowed func(p string) bool
	// SkipDir reports folders to leave out entirely (e.g. the recycle bin).
	SkipDir func(name string) bool
	// Kind classifies a file name.
	Kind func(name string) string
}

func (o *Options) defaults() {
	if o.Depth <= 0 {
		o.Depth = 2
	}
	if o.Depth > 6 {
		o.Depth = 6
	}
	if o.MaxChildren <= 0 {
		o.MaxChildren = 60
	}
	if o.Largest <= 0 {
		o.Largest = 50
	}
	if o.Allowed == nil {
		o.Allowed = func(string) bool { return true }
	}
	if o.SkipDir == nil {
		o.SkipDir = func(string) bool { return false }
	}
	if o.Kind == nil {
		o.Kind = func(string) string { return "" }
	}
}

// Build walks root and returns its size tree and largest files. Unreadable
// entries are skipped, not fatal.
func Build(walk WalkFunc, root string, opts Options) (*Result, error) {
	opts.defaults()
	root = path.Clean("/" + root)
	rootNode := &Node{Name: path.Base(root), Path: root, IsDir: true}
	if root == "/" {
		rootNode.Name = ""
	}
	nodes := map[string]*Node{"": rootNode} // keyed by path relative to root
	largest := &fileHeap{}

	prefix := root
	if prefix != "/" {
		prefix += "/"
	}

	err := walk(root, func(p string, info fs.FileInfo, err error) error {
		p = filepath.ToSlash(p)
		if p == root {
			return nil
		}
		if err != nil || info == nil {
			if info != nil && info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel := strings.TrimPrefix(p, prefix)
		segs := strings.Split(rel, "/")
		level := len(segs)

		if info.IsDir() {
			if !opts.Allowed(p) || opts.SkipDir(info.Name()) {
				return filepath.SkipDir
			}
			if level <= opts.Depth {
				parent := nodes[strings.Join(segs[:level-1], "/")]
				if parent == nil {
					return filepath.SkipDir
				}
				n := &Node{Name: info.Name(), Path: p, IsDir: true}
				nodes[rel] = n
				parent.Children = append(parent.Children, n)
			}
			return nil
		}
		if !info.Mode().IsRegular() || !opts.Allowed(p) {
			return nil
		}

		size := info.Size()
		kind := opts.Kind(info.Name())
		// Credit the root and every folder node above the file.
		for l := 0; l < level && l <= opts.Depth; l++ {
			n := nodes[strings.Join(segs[:l], "/")]
			if n == nil {
				break
			}
			n.add(size, kind)
		}
		if level <= opts.Depth {
			if parent := nodes[strings.Join(segs[:level-1], "/")]; parent != nil {
				parent.Children = append(parent.Children, &Node{
					Name: info.Name(), Path: p, Size: size, Files: 1, Kind: kind,
				})
			}
		}
		largest.offer(File{
			Path: p, Name: info.Name(), Size: size, Modified: info.ModTime(), Kind: kind,
		}, opts.Largest)
		return nil
	})
	if err != nil {
		return nil, err
	}

	finish(rootNode, opts.MaxChildren)
	return &Result{Root: rootNode, Largest: largest.sorted()}, nil
}

func (n *Node) add(size int64, kind string) {
	n.Size += size
	n.Files++
	if kind == "" {
		return
	}
	if n.kindBytes == nil {
		n.kindBytes = map[string]int64{}
	}
	n.kindBytes[kind] += size
}

// finish sorts children biggest first, caps them, and picks folder kinds.
func finish(n *Node, maxChildren int) {
	if !n.IsDir {
		return
	}
	// A kind is the folder's if it holds over half the bytes.
	for k, b := range n.kindBytes {
		if n.Size > 0 && b*2 > n.Size {
			n.Kind = k
		}
	}
	n.kindBytes = nil
	for _, c := range n.Children {
		finish(c, maxChildren)
	}
	sort.SliceStable(n.Children, func(i, j int) bool {
		a, b := n.Children[i], n.Children[j]
		if a.Size != b.Size {
			return a.Size > b.Size
		}
		return a.Name < b.Name
	})
	if len(n.Children) > maxChildren {
		keep := n.Children[:maxChildren-1]
		rest := n.Children[maxChildren-1:]
		other := &Node{Name: "", Path: n.Path, Other: true}
		for _, c := range rest {
			other.Size += c.Size
			other.Files += c.Files
		}
		other.Name = plural(len(rest), "more item", "more items")
		children := make([]*Node, 0, maxChildren)
		children = append(children, keep...)
		n.Children = append(children, other)
	}
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}

// fileHeap keeps the N largest files (a min-heap on size).
type fileHeap []File

func (h fileHeap) Len() int { return len(h) }
func (h fileHeap) Less(i, j int) bool {
	if h[i].Size != h[j].Size {
		return h[i].Size < h[j].Size
	}
	return h[i].Path > h[j].Path
}
func (h fileHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *fileHeap) Push(x any)   { *h = append(*h, x.(File)) }
func (h *fileHeap) Pop() any {
	old := *h
	f := old[len(old)-1]
	*h = old[:len(old)-1]
	return f
}

func (h *fileHeap) offer(f File, limit int) {
	if h.Len() < limit {
		heap.Push(h, f)
		return
	}
	if (*h)[0].Size < f.Size {
		(*h)[0] = f
		heap.Fix(h, 0)
	}
}

func (h *fileHeap) sorted() []File {
	out := make([]File, h.Len())
	for i := len(out) - 1; i >= 0; i-- {
		out[i] = heap.Pop(h).(File)
	}
	return out
}
