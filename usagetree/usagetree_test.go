package usagetree

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, root, rel string, size int) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, make([]byte, size), 0o600); err != nil {
		t.Fatal(err)
	}
}

func kindOf(name string) string {
	switch filepath.Ext(name) {
	case ".mkv":
		return "video"
	case ".jpg":
		return "image"
	}
	return ""
}

func TestBuild(t *testing.T) {
	root := t.TempDir()
	write(t, root, "Movies/a.mkv", 5000)
	write(t, root, "Movies/Extras/b.mkv", 3000)
	write(t, root, "Movies/Extras/deep/c.jpg", 100)
	write(t, root, "Photos/1.jpg", 700)
	write(t, root, "Photos/2.jpg", 300)
	write(t, root, "Private/secret.txt", 9999)
	write(t, root, ".trash/old.mkv", 8888)
	write(t, root, "notes.txt", 50)

	res, err := Build(filepath.Walk, root, Options{
		Depth:   2,
		Allowed: func(p string) bool { return !strings.Contains(p, "/Private") },
		SkipDir: func(name string) bool { return name == ".trash" },
		Kind:    kindOf,
		Largest: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	r := res.Root
	if r.Size != 9150 || r.Files != 6 {
		t.Fatalf("root = %d bytes, %d files", r.Size, r.Files)
	}
	names := func(n *Node) []string {
		var out []string
		for _, c := range n.Children {
			out = append(out, c.Name)
		}
		return out
	}
	if got := strings.Join(names(r), ","); got != "Movies,Photos,notes.txt" {
		t.Errorf("root children = %s", got)
	}
	movies := r.Children[0]
	if movies.Size != 8100 || movies.Kind != "video" || movies.Files != 3 {
		t.Errorf("Movies = %+v", movies)
	}
	// Level 2 folders are leaves holding everything below them.
	if got := strings.Join(names(movies), ","); got != "a.mkv,Extras" {
		t.Errorf("Movies children = %s", got)
	}
	extras := movies.Children[1]
	if extras.Name != "Extras" || extras.Size != 3100 || len(extras.Children) != 0 {
		t.Errorf("Extras = %+v", extras)
	}
	if r.Children[1].Kind != "image" || r.Kind != "video" {
		t.Errorf("kinds: photos %q root %q", r.Children[1].Kind, r.Kind)
	}

	var largest []string
	for _, f := range res.Largest {
		largest = append(largest, f.Name)
	}
	if got := strings.Join(largest, ","); got != "a.mkv,b.mkv,1.jpg" {
		t.Errorf("largest = %s", got)
	}
}

func TestBuildCapsChildren(t *testing.T) {
	root := t.TempDir()
	for i := range 5 {
		write(t, root, "f"+string(rune('a'+i)), 10*(i+1))
	}
	res, err := Build(filepath.Walk, root, Options{Depth: 1, MaxChildren: 3})
	if err != nil {
		t.Fatal(err)
	}
	c := res.Root.Children
	if len(c) != 3 || c[0].Name != "fe" || c[1].Name != "fd" {
		t.Fatalf("children = %+v", c)
	}
	if !c[2].Other || c[2].Size != 60 || c[2].Files != 3 || c[2].Name != "3 more items" {
		t.Errorf("other = %+v", c[2])
	}
}
