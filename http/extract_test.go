package fbhttp

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/mholt/archives"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
)

func TestFirstRarVolume(t *testing.T) {
	cases := map[string]string{
		"movie.rar":         "movie.rar",
		"movie.part1.rar":   "movie.part1.rar",
		"movie.part01.rar":  "movie.part01.rar",
		"movie.part03.rar":  "movie.part01.rar",
		"movie.part003.rar": "movie.part001.rar",
		"Movie.PART02.RAR":  "Movie.PART01.RAR", // case + width preserved
		"movie.r00":         "movie.rar",
		"movie.r15":         "movie.rar",
	}
	for in, want := range cases {
		if got := firstRarVolume(in); got != want {
			t.Errorf("firstRarVolume(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDetectArchive_RejectsSplitAndMultiVolume(t *testing.T) {
	ctx := context.Background()
	// Name-based rejections short-circuit before touching disk.
	for _, name := range []string{"foo.z01", "foo.Z02", "foo.7z.001", "foo.7z.002"} {
		_, _, _, err := detectArchive(ctx, filepath.Join(t.TempDir(), name), "")
		if !errors.Is(err, fberrors.ErrMultiVolumeUnsupported) {
			t.Errorf("detectArchive(%q) err = %v, want ErrMultiVolumeUnsupported", name, err)
		}
	}
}

func TestDetectArchive_RarFirstVolumeMissing(t *testing.T) {
	dir := t.TempDir()
	// Only part02 present; part01 (the first volume) is missing.
	mustWrite(t, filepath.Join(dir, "set.part02.rar"), []byte("x"))
	_, _, _, err := detectArchive(context.Background(), filepath.Join(dir, "set.part02.rar"), "")
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("err = %v, want fs.ErrNotExist", err)
	}
}

func TestDetectArchive_RarUsesFirstVolume(t *testing.T) {
	dir := t.TempDir()
	mustWrite(t, filepath.Join(dir, "set.part01.rar"), []byte("x"))
	mustWrite(t, filepath.Join(dir, "set.part02.rar"), []byte("y"))
	// Click the SECOND volume — detect should normalize to the first.
	ex, reader, closeFn, err := detectArchive(context.Background(), filepath.Join(dir, "set.part02.rar"), "")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	defer closeFn()
	if reader != nil {
		t.Errorf("rar reader should be nil (opened via FS), got %T", reader)
	}
	rar, ok := ex.(archives.Rar)
	if !ok {
		t.Fatalf("extractor = %T, want archives.Rar", ex)
	}
	if rar.Name != "set.part01.rar" {
		t.Errorf("rar.Name = %q, want set.part01.rar", rar.Name)
	}
}

func TestDetectArchive_ExtractsZip(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "bundle.zip")
	writeZip(t, zipPath, map[string]string{
		"a.txt":     "hello",
		"sub/b.txt": "world",
	})
	assertExtracts(t, zipPath, map[string]string{"a.txt": "hello", "sub/b.txt": "world"})
}

func TestDetectArchive_ExtractsTarGz(t *testing.T) {
	dir := t.TempDir()
	tgzPath := filepath.Join(dir, "bundle.tar.gz")
	writeTarGz(t, tgzPath, map[string]string{
		"a.txt":     "hello",
		"sub/b.txt": "world",
	})
	assertExtracts(t, tgzPath, map[string]string{"a.txt": "hello", "sub/b.txt": "world"})
}

func TestDetectArchive_UnsupportedFormat(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "notanarchive.bin")
	mustWrite(t, p, []byte("just some bytes, definitely not an archive header"))
	_, _, _, err := detectArchive(context.Background(), p, "")
	if !errors.Is(err, fberrors.ErrUnsupportedArchive) {
		t.Fatalf("err = %v, want ErrUnsupportedArchive", err)
	}
}

// assertExtracts runs the same detect+Extract path the handler uses and
// asserts the regular-file entries match want (name -> content).
func assertExtracts(t *testing.T, path string, want map[string]string) {
	t.Helper()
	ctx := context.Background()
	ex, reader, closeFn, err := detectArchive(ctx, path, "")
	if err != nil {
		t.Fatalf("detectArchive: %v", err)
	}
	defer closeFn()

	got := map[string]string{}
	err = ex.Extract(ctx, reader, func(_ context.Context, entry archives.FileInfo) error {
		if entry.IsDir() {
			return nil
		}
		f, openErr := entry.Open()
		if openErr != nil {
			return openErr
		}
		defer f.Close()
		b, readErr := io.ReadAll(f)
		if readErr != nil {
			return readErr
		}
		got[entry.NameInArchive] = string(b)
		return nil
	})
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	for name, content := range want {
		if got[name] != content {
			t.Errorf("entry %q = %q, want %q", name, got[name], content)
		}
	}
}

func mustWrite(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func writeZip(t *testing.T, path string, entries map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create zip: %v", err)
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	for name, content := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("zip create %s: %v", name, err)
		}
		if _, err := io.WriteString(w, content); err != nil {
			t.Fatalf("zip write %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
}

func writeTarGz(t *testing.T, path string, entries map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create tgz: %v", err)
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for name, content := range entries {
		hdr := &tar.Header{Name: name, Mode: 0o644, Size: int64(len(content)), Typeflag: tar.TypeReg}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("tar header %s: %v", name, err)
		}
		if _, err := io.WriteString(tw, content); err != nil {
			t.Fatalf("tar write %s: %v", name, err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gz close: %v", err)
	}
}
