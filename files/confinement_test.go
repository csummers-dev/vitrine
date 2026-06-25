package files

import (
	"testing"

	"github.com/spf13/afero"
)

// TestScopeConfinement is the security-regression test for path confinement
// (audit A1). A user's filesystem is an afero.BasePathFs rooted at their scope
// (see users.User.Fs). This proves that `..`/absolute traversal through that
// scoped FS — the foundation every path-touching handler relies on — cannot
// escape to a sibling/parent file, both directly and via NewFileInfo.
func TestScopeConfinement(t *testing.T) {
	mem := afero.NewMemMapFs()

	// A secret that lives OUTSIDE the user's scope.
	if err := afero.WriteFile(mem, "/secret.txt", []byte("top secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	// The user's scope + an in-scope file.
	if err := mem.MkdirAll("/scope/sub", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := afero.WriteFile(mem, "/scope/inside.txt", []byte("ok"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Mirror users.User.Fs: a BasePathFs rooted at the scope.
	scoped := afero.NewBasePathFs(mem, "/scope")

	// Sanity: in-scope access works.
	if _, err := NewFileInfo(&FileOptions{
		Fs: scoped, Path: "/inside.txt", Checker: allowAllChecker{},
	}); err != nil {
		t.Fatalf("in-scope file should be readable: %v", err)
	}

	// Traversal attempts must be confined — none may resolve to the secret.
	escapes := []string{
		"/../secret.txt",
		"/../../secret.txt",
		"/sub/../../secret.txt",
		"/foo/../../secret.txt",
	}
	for _, escape := range escapes {
		if _, err := NewFileInfo(&FileOptions{
			Fs: scoped, Path: escape, Checker: allowAllChecker{},
		}); err == nil {
			t.Errorf("NewFileInfo(%q) escaped the scope (expected an error)", escape)
		}
		if _, err := scoped.Stat(escape); err == nil {
			t.Errorf("BasePathFs.Stat(%q) should reject the escape", escape)
		}
	}
}
