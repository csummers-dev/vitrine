package fbhttp

import (
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/afero"
	yzip "github.com/yeka/zip"

	fberrors "github.com/csummers-dev/vitrine/v3/errors"
)

// testExtractOpts returns extractOpts with generous caps + a permissive checker
// so the password behaviour is what's under test (not the zip-bomb guards).
func testExtractOpts(fsys afero.Fs) extractOpts {
	return extractOpts{
		Fs:                      fsys,
		Check:                   func(string) bool { return true },
		Override:                true,
		DirMode:                 0o755,
		FileMode:                0o644,
		MaxEntries:              10000,
		MaxUncompressedFileSize: 100 << 20,
		MaxTotalUncompressed:    1 << 30,
		MaxUncompressedRate:     0, // disable the ratio guard for these tests
	}
}

// writeEncryptedZip builds an AES-256 password-protected zip at path.
func writeEncryptedZip(t *testing.T, path, password string, entries map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create zip: %v", err)
	}
	defer f.Close()
	zw := yzip.NewWriter(f)
	for name, content := range entries {
		w, encErr := zw.Encrypt(name, password, yzip.AES256Encryption)
		if encErr != nil {
			t.Fatalf("encrypt entry %q: %v", name, encErr)
		}
		if _, wErr := io.WriteString(w, content); wErr != nil {
			t.Fatalf("write entry %q: %v", name, wErr)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
}

// assertExtractedFiles checks each want entry exists under dst with content.
func assertExtractedFiles(t *testing.T, fsys afero.Fs, dst string, want map[string]string) {
	t.Helper()
	for name, content := range want {
		got, err := afero.ReadFile(fsys, filepath.Join(dst, filepath.FromSlash(name)))
		if err != nil {
			t.Fatalf("read extracted %q: %v", name, err)
		}
		if string(got) != content {
			t.Errorf("extracted %q = %q, want %q", name, got, content)
		}
	}
}

// assertNothingExtracted fails if dst contains any entries (all-or-nothing on
// a failed password).
func assertNothingExtracted(t *testing.T, dst string) {
	t.Helper()
	entries, err := os.ReadDir(dst)
	if err != nil {
		t.Fatalf("readdir dst: %v", err)
	}
	if len(entries) != 0 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("expected no extracted files, found %v", names)
	}
}

func TestExtractArchive_EncryptedZip_CorrectPassword(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "secret.zip")
	want := map[string]string{"hello.txt": "hello", "sub/inner.txt": "world"}
	writeEncryptedZip(t, zipPath, "swordfish", want)

	dst := t.TempDir()
	fsys := afero.NewOsFs()
	if err := extractArchive(t.Context(), zipPath, dst, "swordfish", testExtractOpts(fsys)); err != nil {
		t.Fatalf("extractArchive: %v", err)
	}
	assertExtractedFiles(t, fsys, dst, want)
}

func TestExtractArchive_EncryptedZip_NoPassword(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "secret.zip")
	writeEncryptedZip(t, zipPath, "swordfish", map[string]string{"hello.txt": "hello"})

	dst := t.TempDir()
	err := extractArchive(t.Context(), zipPath, dst, "", testExtractOpts(afero.NewOsFs()))
	if !errors.Is(err, fberrors.ErrArchivePasswordRequired) {
		t.Fatalf("err = %v, want ErrArchivePasswordRequired", err)
	}
	assertNothingExtracted(t, dst)
}

func TestExtractArchive_EncryptedZip_WrongPassword(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "secret.zip")
	writeEncryptedZip(t, zipPath, "swordfish", map[string]string{"hello.txt": "hello"})

	dst := t.TempDir()
	err := extractArchive(t.Context(), zipPath, dst, "wrong-password", testExtractOpts(afero.NewOsFs()))
	if !errors.Is(err, fberrors.ErrArchivePasswordIncorrect) {
		t.Fatalf("err = %v, want ErrArchivePasswordIncorrect", err)
	}
	assertNothingExtracted(t, dst)
}

// Regression: an unencrypted zip still extracts via the mholt path (no probe
// false-positive, password ignored).
func TestExtractArchive_UnencryptedZip(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "plain.zip")
	want := map[string]string{"a.txt": "hello", "sub/b.txt": "world"}
	writeZip(t, zipPath, want)

	dst := t.TempDir()
	fsys := afero.NewOsFs()
	if err := extractArchive(t.Context(), zipPath, dst, "", testExtractOpts(fsys)); err != nil {
		t.Fatalf("extractArchive: %v", err)
	}
	assertExtractedFiles(t, fsys, dst, want)
}

// Encrypted 7z via the committed fixture (password "filebrowser"). Validates
// the mholt SevenZip.Password threading + the required/incorrect heuristic.
func TestExtractArchive_Encrypted7z(t *testing.T) {
	fixture := filepath.Join("testdata", "secret.7z")
	if _, err := os.Stat(fixture); err != nil {
		t.Skipf("fixture missing: %v", err)
	}
	want := map[string]string{
		"hello.txt":     "top secret contents\n",
		"sub/inner.txt": "nested secret\n",
	}

	t.Run("correct", func(t *testing.T) {
		dst := t.TempDir()
		fsys := afero.NewOsFs()
		if err := extractArchive(t.Context(), fixture, dst, "filebrowser", testExtractOpts(fsys)); err != nil {
			t.Fatalf("extractArchive: %v", err)
		}
		assertExtractedFiles(t, fsys, dst, want)
	})

	t.Run("none", func(t *testing.T) {
		dst := t.TempDir()
		err := extractArchive(t.Context(), fixture, dst, "", testExtractOpts(afero.NewOsFs()))
		if !errors.Is(err, fberrors.ErrArchivePasswordRequired) {
			t.Fatalf("err = %v, want ErrArchivePasswordRequired", err)
		}
	})

	t.Run("wrong", func(t *testing.T) {
		dst := t.TempDir()
		err := extractArchive(t.Context(), fixture, dst, "nope", testExtractOpts(afero.NewOsFs()))
		if !errors.Is(err, fberrors.ErrArchivePasswordIncorrect) {
			t.Fatalf("err = %v, want ErrArchivePasswordIncorrect", err)
		}
	})
}

// Content-encrypted 7z (filenames listable without a password) is the case
// that, before the pre-extraction password validation, left partial output on
// a wrong/missing password — the streaming walk would create the first file
// before the decrypt failed. Assert all-or-nothing now.
func TestExtractArchive_Encrypted7zContent(t *testing.T) {
	fixture := filepath.Join("testdata", "secret-content.7z")
	if _, err := os.Stat(fixture); err != nil {
		t.Skipf("fixture missing: %v", err)
	}
	want := map[string]string{
		"hello.txt":     "top secret contents\n",
		"sub/inner.txt": "nested secret\n",
	}

	t.Run("correct", func(t *testing.T) {
		dst := t.TempDir()
		fsys := afero.NewOsFs()
		if err := extractArchive(t.Context(), fixture, dst, "filebrowser", testExtractOpts(fsys)); err != nil {
			t.Fatalf("extractArchive: %v", err)
		}
		assertExtractedFiles(t, fsys, dst, want)
	})

	t.Run("none leaves nothing", func(t *testing.T) {
		dst := t.TempDir()
		err := extractArchive(t.Context(), fixture, dst, "", testExtractOpts(afero.NewOsFs()))
		if !errors.Is(err, fberrors.ErrArchivePasswordRequired) {
			t.Fatalf("err = %v, want ErrArchivePasswordRequired", err)
		}
		assertNothingExtracted(t, dst)
	})

	t.Run("wrong leaves nothing", func(t *testing.T) {
		dst := t.TempDir()
		err := extractArchive(t.Context(), fixture, dst, "nope", testExtractOpts(afero.NewOsFs()))
		if !errors.Is(err, fberrors.ErrArchivePasswordIncorrect) {
			t.Fatalf("err = %v, want ErrArchivePasswordIncorrect", err)
		}
		assertNothingExtracted(t, dst)
	})
}

func TestArchivePasswordHeader(t *testing.T) {
	newReq := func(set bool, raw string) *http.Request {
		r, _ := http.NewRequest(http.MethodPost, "/api/unzip/x", nil)
		if set {
			r.Header.Set("X-Archive-Password", raw)
		}
		return r
	}

	// Round-trips a non-ASCII password (the base64(UTF-8) header contract).
	want := "pä$$wörd"
	enc := base64.StdEncoding.EncodeToString([]byte(want))
	if got := archivePassword(newReq(true, enc)); got != want {
		t.Errorf("archivePassword = %q, want %q", got, want)
	}
	// No header → empty (treated as "no password supplied").
	if got := archivePassword(newReq(false, "")); got != "" {
		t.Errorf("missing header = %q, want empty", got)
	}
	// Malformed base64 → empty (never panics / leaks the raw header).
	if got := archivePassword(newReq(true, "not!base64!")); got != "" {
		t.Errorf("malformed header = %q, want empty", got)
	}
}

func TestPasswordErr(t *testing.T) {
	if got := passwordErr(""); !errors.Is(got, fberrors.ErrArchivePasswordRequired) {
		t.Errorf(`passwordErr("") = %v, want Required`, got)
	}
	if got := passwordErr("x"); !errors.Is(got, fberrors.ErrArchivePasswordIncorrect) {
		t.Errorf(`passwordErr("x") = %v, want Incorrect`, got)
	}
}
