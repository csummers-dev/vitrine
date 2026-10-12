package fbhttp

import (
	"strings"
	"testing"

	"github.com/spf13/afero"
)

func TestBuildUsageTreeRespectsScopeAndRules(t *testing.T) {
	base := afero.NewMemMapFs()
	put := func(p string, n int) {
		if err := afero.WriteFile(base, p, make([]byte, n), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	put("/srv/alice/Movies/a.mkv", 4000)
	put("/srv/alice/Hidden/x.bin", 9000)
	put("/srv/alice/.trash/old.mkv", 7000)
	put("/srv/bob/b.mkv", 5000) // outside alice's scope
	scoped := afero.NewBasePathFs(base, "/srv/alice")

	res, err := buildUsageTree(scoped, "/", 2, func(p string) bool {
		return !strings.HasPrefix(p, "/Hidden")
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Root.Size != 4000 || len(res.Root.Children) != 1 {
		t.Fatalf("root = %+v", res.Root)
	}
	m := res.Root.Children[0]
	if m.Path != "/Movies" || m.Kind != "video" {
		t.Errorf("Movies = %+v", m)
	}
	if len(res.Largest) != 1 || res.Largest[0].Path != "/Movies/a.mkv" {
		t.Errorf("largest = %+v", res.Largest)
	}
}
