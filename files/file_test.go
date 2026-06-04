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

// Archives carry a registered application/* MIME (zip, 7z, tar, gzip…) that is
// neither text/* nor octet-stream, so they skip the DetectContentType branch.
// The text-classifier's `!isBinary(...)` rescue must therefore read the real
// header bytes — otherwise every such archive was mis-typed as "text" and its
// raw bytes were dumped into the text viewer (WS3). This guards the fix.
func TestDetectTypeArchivesAreBlobNotText(t *testing.T) {
	memFs := afero.NewMemMapFs()

	// zip local-file-header magic: "PK\x03\x04" — the 0x03 is a control byte
	// that isBinary must catch when the header is actually read.
	zipBytes := append([]byte{'P', 'K', 0x03, 0x04, 0x14, 0x00}, make([]byte, 64)...)
	cases := map[string]struct {
		content []byte
		want    string
	}{
		"archive.zip": {zipBytes, "blob"},
		"notes.json":  {[]byte(`{"hello":"world","n":42}`), "text"},
		"readme.txt":  {[]byte("just some plain text here\n"), "text"},
	}

	for name, tc := range cases {
		if err := afero.WriteFile(memFs, "/"+name, tc.content, 0o644); err != nil {
			t.Fatalf("%s: write: %v", name, err)
		}
		fi, err := NewFileInfo(&FileOptions{
			Fs:         memFs,
			Path:       "/" + name,
			Expand:     true,
			ReadHeader: true,
			Modify:     true,
			Checker:    allowAllChecker{},
		})
		if err != nil {
			t.Fatalf("%s: NewFileInfo: %v", name, err)
		}
		if fi.Type != tc.want {
			t.Errorf("%s: type = %q, want %q", name, fi.Type, tc.want)
		}
	}
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

	// `Listing` is embedded (`*Listing` in FileInfo) so `Items` and
	// `NumDirs` are promoted to the parent — staticcheck QF1008 flags
	// the explicit `file.Listing.X` selector as redundant. The nil
	// check above stays explicit because that one IS about the embedded
	// pointer itself, not a field promoted through it.
	if got := len(file.Items); got != 1 {
		t.Fatalf("expected one accessible child, got %d", got)
	}

	if got := file.Items[0].Name; got != "media" {
		t.Fatalf("expected accessible child to be listed, got %q", got)
	}

	if got := file.NumDirs; got != 1 {
		t.Fatalf("expected one listed directory, got %d", got)
	}
}
