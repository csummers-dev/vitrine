package files

import (
	"os"
	"path"
	"testing"

	"github.com/spf13/afero"
)

type allowAllChecker struct{}

func (allowAllChecker) Check(string) bool {
	return true
}

type inaccessibleChildFs struct {
	afero.Fs
	child string
}

func (fs inaccessibleChildFs) Open(name string) (afero.File, error) {
	file, err := fs.Fs.Open(name)
	if err != nil {
		return nil, err
	}

	if path.Clean(name) == "/" {
		return inaccessibleChildDir{File: file}, nil
	}

	return file, nil
}

func (fs inaccessibleChildFs) Stat(name string) (os.FileInfo, error) {
	if path.Clean(name) == fs.child {
		return nil, os.ErrPermission
	}

	return fs.Fs.Stat(name)
}

func (fs inaccessibleChildFs) LstatIfPossible(name string) (os.FileInfo, bool, error) {
	if path.Clean(name) == fs.child {
		return nil, false, os.ErrPermission
	}

	if lstater, ok := fs.Fs.(afero.Lstater); ok {
		return lstater.LstatIfPossible(name)
	}

	info, err := fs.Fs.Stat(name)
	return info, false, err
}

type inaccessibleChildDir struct {
	afero.File
}

func (dir inaccessibleChildDir) Readdir(int) ([]os.FileInfo, error) {
	return nil, os.ErrPermission
}

func TestReadListingSkipsInaccessibleChildren(t *testing.T) {
	memFs := afero.NewMemMapFs()
	for _, dir := range []string{"/media", "/proton-mount"} {
		if err := memFs.Mkdir(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	file, err := NewFileInfo(&FileOptions{
		Fs:      inaccessibleChildFs{Fs: memFs, child: "/proton-mount"},
		Path:    "/",
		Expand:  true,
		Checker: allowAllChecker{},
	})
	if err != nil {
		t.Fatal(err)
	}

	if file.Listing == nil {
		t.Fatal("expected root listing")
	}

	if got := len(file.Listing.Items); got != 1 {
		t.Fatalf("expected one accessible child, got %d", got)
	}

	if got := file.Listing.Items[0].Name; got != "media" {
		t.Fatalf("expected accessible child to be listed, got %q", got)
	}

	if got := file.Listing.NumDirs; got != 1 {
		t.Fatalf("expected one listed directory, got %d", got)
	}
}
