package fbhttp

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	yzip "github.com/yeka/zip"

	fberrors "github.com/csummers-dev/vitrine/v3/errors"
)

// mapCache is an in-memory FileCache for tests.
type mapCache struct{ m map[string][]byte }

func newMapCache() *mapCache { return &mapCache{m: map[string][]byte{}} }
func (c *mapCache) Store(_ context.Context, k string, v []byte) error {
	c.m[k] = append([]byte(nil), v...)
	return nil
}
func (c *mapCache) Load(_ context.Context, k string) ([]byte, bool, error) {
	v, ok := c.m[k]
	return v, ok, nil
}
func (c *mapCache) Delete(_ context.Context, k string) error { delete(c.m, k); return nil }

func tinyPNGBytes(t *testing.T, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, c)
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return b.Bytes()
}

// makeCBZ writes a .cbz (zip) of the given entries to a temp dir.
func makeCBZ(t *testing.T, entries map[string][]byte) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "book.cbz")
	f, err := os.Create(p)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	zw := zip.NewWriter(f)
	for name, data := range entries {
		w, cErr := zw.Create(name)
		if cErr != nil {
			t.Fatalf("zip create %q: %v", name, cErr)
		}
		if _, wErr := w.Write(data); wErr != nil {
			t.Fatalf("zip write %q: %v", name, wErr)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("file close: %v", err)
	}
	return p
}

func TestNaturalLess(t *testing.T) {
	ascending := []string{"page1.png", "page2.png", "page9.png", "page10.png", "page11.png", "page100.png"}
	for i := 0; i+1 < len(ascending); i++ {
		lo, hi := ascending[i], ascending[i+1]
		if !naturalLess(lo, hi) {
			t.Errorf("naturalLess(%q, %q) = false, want true", lo, hi)
		}
		if naturalLess(hi, lo) {
			t.Errorf("naturalLess(%q, %q) = true, want false", hi, lo)
		}
	}
	// Leading zeros: equal value, fewer significant digits still orders < bigger.
	if !naturalLess("p01.jpg", "p2.jpg") {
		t.Error("p01 should sort before p2")
	}
	// Case-insensitive on letters.
	if !naturalLess("Chapter1/page2.png", "chapter1/page10.png") {
		t.Error("case-insensitive numeric order failed")
	}
}

func TestIsComicImageEntry(t *testing.T) {
	for _, name := range []string{"a.jpg", "A.JPEG", "ch1/p2.png", "cover.webp", "x.gif", "y.bmp", "z.avif"} {
		if !isComicImageEntry(name) {
			t.Errorf("isComicImageEntry(%q) = false, want true", name)
		}
	}
	for _, name := range []string{
		"ComicInfo.xml", "Thumbs.db", "notes.txt", "dir/",
		"__MACOSX/._a.jpg", "sub/__MACOSX/b.jpg", ".hidden.png",
	} {
		if isComicImageEntry(name) {
			t.Errorf("isComicImageEntry(%q) = true, want false", name)
		}
	}
}

func TestComicPagesAndBytes(t *testing.T) {
	p1 := tinyPNGBytes(t, color.RGBA{R: 255, A: 255})
	p2 := tinyPNGBytes(t, color.RGBA{G: 255, A: 255})
	p10 := tinyPNGBytes(t, color.RGBA{B: 255, A: 255})

	cbz := makeCBZ(t, map[string][]byte{
		"page10.png":           p10,
		"page2.png":            p2,
		"page1.png":            p1,
		"ComicInfo.xml":        []byte("<ComicInfo/>"),
		"__MACOSX/._page1.png": []byte("junk"),
	})
	fi, err := os.Stat(cbz)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	ctx := context.Background()
	cache := newMapCache()

	// Pages are natural-sorted and exclude non-images / __MACOSX.
	names, status, err := comicPages(ctx, cache, cbz, fi.ModTime(), 1000)
	if err != nil {
		t.Fatalf("comicPages: %v (status %d)", err, status)
	}
	want := []string{"page1.png", "page2.png", "page10.png"}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("pages = %v, want %v", names, want)
	}

	// Each page serves the right image bytes.
	got0, _, err := comicPageBytes(ctx, cache, cbz, fi.ModTime(), names[0], maxComicPageBytes)
	if err != nil {
		t.Fatalf("page 0: %v", err)
	}
	if !bytes.Equal(got0, p1) {
		t.Error("page 0 bytes != page1.png")
	}
	got2, _, err := comicPageBytes(ctx, cache, cbz, fi.ModTime(), names[2], maxComicPageBytes)
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if !bytes.Equal(got2, p10) {
		t.Error("page 2 bytes != page10.png")
	}

	// Second read of a page is a cache hit (manifest + page both cached).
	if _, ok, _ := cache.Load(ctx, comicKeyBase(cbz, fi.ModTime())+":names"); !ok {
		t.Error("manifest was not cached")
	}
}

func TestComicNoImages(t *testing.T) {
	cbz := makeCBZ(t, map[string][]byte{"readme.txt": []byte("hi")})
	fi, _ := os.Stat(cbz)
	_, status, err := comicPages(context.Background(), newMapCache(), cbz, fi.ModTime(), 1000)
	if err == nil || status != http.StatusUnsupportedMediaType {
		t.Errorf("empty comic: status %d err %v, want 415", status, err)
	}
}

// Encryption is mapped to the friendly error (we can't easily build an
// encrypted zip in-test; this covers the mapping the page/list handlers use).
func TestComicEncryptionMapping(t *testing.T) {
	enc := errors.New("rar: archive requires a password to decrypt")
	if comicErr(enc) != fberrors.ErrEncryptedArchiveUnsupported {
		t.Error("encryption error not mapped to ErrEncryptedArchiveUnsupported")
	}
	plain := errors.New("boom")
	if comicErr(plain) != plain {
		t.Error("non-encryption error should pass through unchanged")
	}
}

// makeEncryptedCBZ builds an AES-256 password-protected .cbz at a temp path.
func makeEncryptedCBZ(t *testing.T, password string, entries map[string][]byte) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "secret.cbz")
	f, err := os.Create(p)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	defer f.Close()
	zw := yzip.NewWriter(f)
	for name, data := range entries {
		w, encErr := zw.Encrypt(name, password, yzip.AES256Encryption)
		if encErr != nil {
			t.Fatalf("encrypt %q: %v", name, encErr)
		}
		if _, wErr := w.Write(data); wErr != nil {
			t.Fatalf("write %q: %v", name, wErr)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return p
}

// An encrypted comic is detected up front (at /list) and surfaced as the
// friendly "not supported" error — not a string of broken page loads.
func TestComicEncryptedArchiveUnsupported(t *testing.T) {
	page := tinyPNGBytes(t, color.RGBA{R: 255, A: 255})
	cbz := makeEncryptedCBZ(t, "swordfish", map[string][]byte{"page1.png": page})

	fi, err := os.Stat(cbz)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	_, status, err := comicPages(context.Background(), newMapCache(), cbz, fi.ModTime(), 1000)
	if !errors.Is(err, fberrors.ErrEncryptedArchiveUnsupported) {
		t.Fatalf("err = %v, want ErrEncryptedArchiveUnsupported", err)
	}
	if status != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", status)
	}
}

func TestIsComicPreviewExt(t *testing.T) {
	// v2.7: BOTH real-world comic formats get covers (.cbz joined .cbr — the
	// V2 #6 exclusion was reversed on request). Plain archives must never
	// match: an ordinary zip of images is not a comic, and sweeping every
	// archive for a cover would turn folder listings into archive scans.
	for ext, want := range map[string]bool{
		".cbz": true, ".CBZ": true, ".cbr": true, ".CbR": true,
		".zip": false, ".rar": false, ".cb7": false, ".epub": false, "": false,
	} {
		if got := isComicPreviewExt(ext); got != want {
			t.Errorf("isComicPreviewExt(%q) = %v, want %v", ext, got, want)
		}
	}
}
