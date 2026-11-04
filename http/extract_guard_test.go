package fbhttp

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asdine/storm/v3"
	"github.com/dsnet/compress/bzip2"
	"github.com/klauspost/compress/zstd"
	"github.com/spf13/afero"
	"github.com/ulikunitz/xz"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/storage/bolt"
	"github.com/csummers-dev/vitrine/v4/users"
)

// The 4.0 extraction safeguards: free space, ratio limits, checks while
// writing, cleanup, and the error that reaches the browser. The limits are
// scaled down (ratioFloor, an injected free-space source) so nothing needs
// real multi-gigabyte files.

// smallLimits scales the ratio floor and free-space recheck down for a test.
func smallLimits(t *testing.T) {
	t.Helper()
	floor, recheck := ratioFloor, freeSpaceRecheck
	ratioFloor, freeSpaceRecheck = 64<<10, 64<<10
	t.Cleanup(func() { ratioFloor, freeSpaceRecheck = floor, recheck })
}

// guardOpts is extractOpts with the 4.0 defaults and plenty of free space.
func guardOpts() extractOpts {
	return extractOpts{
		Fs:         afero.NewOsFs(),
		Check:      func(string) bool { return true },
		DirMode:    0o755,
		FileMode:   0o644,
		MaxEntries: 1000,
		MaxRatio:   100,
		FreeMargin: 0,
		FreeSpace:  func() (uint64, error) { return 1 << 40, nil },
	}
}

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}

// writeTarTo writes entries as a tar stream, optionally compressed.
func writeTarTo(t *testing.T, path string, entries map[string][]byte, compress func(io.Writer) io.WriteCloser) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var w io.Writer = f
	var cw io.WriteCloser
	if compress != nil {
		cw = compress(f)
		w = cw
	}
	tw := tar.NewWriter(w)
	for name, data := range entries {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(data)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if cw != nil {
		if err := cw.Close(); err != nil {
			t.Fatal(err)
		}
	}
}

func writeZipBytes(t *testing.T, path string, entries map[string][]byte) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	for name, data := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
}

// formats writes the same entries in every format testable in pure Go.
// 7z comes from fixtures (testdata/extract-normal.7z, extract-bomb.7z).
var formats = []struct {
	ext   string
	write func(t *testing.T, path string, entries map[string][]byte)
}{
	{".zip", writeZipBytes},
	{".tar", func(t *testing.T, p string, e map[string][]byte) { writeTarTo(t, p, e, nil) }},
	{".tar.gz", func(t *testing.T, p string, e map[string][]byte) {
		writeTarTo(t, p, e, func(w io.Writer) io.WriteCloser { return gzip.NewWriter(w) })
	}},
	{".tar.bz2", func(t *testing.T, p string, e map[string][]byte) {
		writeTarTo(t, p, e, func(w io.Writer) io.WriteCloser {
			bw, err := bzip2.NewWriter(w, nil)
			if err != nil {
				t.Fatal(err)
			}
			return bw
		})
	}},
	{".tar.xz", func(t *testing.T, p string, e map[string][]byte) {
		writeTarTo(t, p, e, func(w io.Writer) io.WriteCloser {
			xw, err := xz.NewWriter(w)
			if err != nil {
				t.Fatal(err)
			}
			return xw
		})
	}},
	{".tar.zst", func(t *testing.T, p string, e map[string][]byte) {
		writeTarTo(t, p, e, func(w io.Writer) io.WriteCloser {
			zw, err := zstd.NewWriter(w)
			if err != nil {
				t.Fatal(err)
			}
			return zw
		})
	}},
}

// dirEntries lists what's in dir (nothing left behind after a failure).
func dirEntries(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	_ = filepath.WalkDir(dir, func(p string, _ os.DirEntry, err error) error {
		if err == nil && p != dir {
			out = append(out, strings.TrimPrefix(p, dir))
		}
		return nil
	})
	return out
}

func TestExtractNearOneToOnePasses(t *testing.T) {
	smallLimits(t)
	// Random data doesn't compress: ~1:1, like a disk image. 512 KiB is
	// eight times the scaled-down ratio floor.
	payload := randomBytes(t, 512<<10)
	for _, f := range formats {
		t.Run(f.ext, func(t *testing.T) {
			dir := t.TempDir()
			src := filepath.Join(dir, "image"+f.ext)
			f.write(t, src, map[string][]byte{"disk.img": payload, "readme.txt": []byte("hi")})
			dst := filepath.Join(dir, "out")
			if err := extractArchive(context.Background(), src, dst, "", guardOpts()); err != nil {
				t.Fatalf("extract: %v", err)
			}
			got, err := os.ReadFile(filepath.Join(dst, "disk.img"))
			if err != nil || !bytes.Equal(got, payload) {
				t.Fatalf("disk.img not extracted intact: %v", err)
			}
		})
	}
	t.Run(".7z", func(t *testing.T) {
		dst := filepath.Join(t.TempDir(), "out")
		if err := extractArchive(context.Background(), "testdata/extract-normal.7z", dst, "", guardOpts()); err != nil {
			t.Fatalf("extract: %v", err)
		}
		if fi, err := os.Stat(filepath.Join(dst, "disk.img")); err != nil || fi.Size() != 256<<10 {
			t.Fatalf("disk.img: %v", err)
		}
	})
}

// A 48 GB image in a 47 GB archive with 60 GB free passes the checks made
// before writing (the sizes are what the old 5 GB cap refused).
func TestPreflightPassesHugeNearOneToOneArchive(t *testing.T) {
	opts := guardOpts()
	opts.ArchiveSize = 47e9
	opts.FreeMargin = 1 << 30
	opts.FreeSpace = func() (uint64, error) { return 60e9, nil }
	if err := preflight(declaredSizes{total: 48e9, known: true}, opts); err != nil {
		t.Fatalf("preflight: %v", err)
	}
}

func TestExtractRejectsHighRatio(t *testing.T) {
	smallLimits(t)
	zeros := make([]byte, 4<<20) // compresses to almost nothing
	for _, f := range formats {
		if f.ext == ".tar" {
			continue // uncompressed: no ratio to exceed
		}
		t.Run(f.ext, func(t *testing.T) {
			dir := t.TempDir()
			src := filepath.Join(dir, "bomb"+f.ext)
			f.write(t, src, map[string][]byte{"zeros.bin": zeros})
			dst := filepath.Join(dir, "out")
			err := extractArchive(context.Background(), src, dst, "", guardOpts())
			var unsafe *fberrors.UnsafeArchiveError
			if !errors.As(err, &unsafe) || !strings.Contains(unsafe.Error(), "compression ratio") {
				t.Fatalf("err = %v, want a compression-ratio refusal", err)
			}
			if left := dirEntries(t, dst); len(left) != 0 {
				t.Errorf("left behind: %v", left)
			}
		})
	}
	t.Run(".7z", func(t *testing.T) {
		dst := filepath.Join(t.TempDir(), "out")
		err := extractArchive(context.Background(), "testdata/extract-bomb.7z", dst, "", guardOpts())
		var unsafe *fberrors.UnsafeArchiveError
		if !errors.As(err, &unsafe) {
			t.Fatalf("err = %v, want a refusal", err)
		}
	})
}

// fakeEntry is an archive member whose header claims `declared` bytes but
// whose data is `actual`.
func fakeEntry(name string, declared int64, actual []byte) normalizedEntry {
	return normalizedEntry{
		name:         name,
		mode:         0o644,
		declaredSize: declared,
		open:         func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(actual)), nil },
	}
}

func TestLyingEntryIsAbortedAndCleanedUp(t *testing.T) {
	dir := t.TempDir()
	dst := filepath.Join(dir, "out")
	job := &extractJob{opts: guardOpts()}

	// A good entry in a new folder, then one that claims 10 bytes but
	// streams 3 MiB.
	if err := materializeEntry(fakeEntry("new/ok.txt", 2, []byte("ok")), dst, job); err != nil {
		t.Fatal(err)
	}
	err := materializeEntry(fakeEntry("new/liar.bin", 10, make([]byte, 3<<20)), dst, job)
	var unsafe *fberrors.UnsafeArchiveError
	if !errors.As(err, &unsafe) || unsafe.Entry != "new/liar.bin" {
		t.Fatalf("err = %v, want the lying entry refused", err)
	}
	_ = job.finish(err)
	if _, statErr := os.Stat(dst); !os.IsNotExist(statErr) {
		t.Errorf("partial output left: %v", dirEntries(t, dst))
	}
}

func TestAbortNeverTouchesExistingFiles(t *testing.T) {
	dir := t.TempDir()
	dst := filepath.Join(dir, "out")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(dst, "big.bin")
	if err := os.WriteFile(keep, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	opts := guardOpts()
	opts.Override = true
	job := &extractJob{opts: opts}

	err := materializeEntry(fakeEntry("big.bin", 10, make([]byte, 3<<20)), dst, job)
	if err == nil {
		t.Fatal("lying entry accepted")
	}
	_ = job.finish(err)
	got, readErr := os.ReadFile(keep)
	if readErr != nil || string(got) != "original" {
		t.Errorf("existing file = %q, %v; want it untouched", got, readErr)
	}
	if left := dirEntries(t, dst); len(left) != 1 {
		t.Errorf("left behind: %v", left)
	}
}

func TestFreeSpacePreflightFailsBeforeWriting(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "big.zip")
	writeZipBytes(t, src, map[string][]byte{"disk.img": randomBytes(t, 1<<20)})
	dst := filepath.Join(dir, "out")
	opts := guardOpts()
	opts.FreeMargin = 256 << 10
	opts.FreeSpace = func() (uint64, error) { return 768 << 10, nil }

	err := extractArchive(context.Background(), src, dst, "", opts)
	var space *fberrors.InsufficientSpaceError
	if !errors.As(err, &space) {
		t.Fatalf("err = %v, want not enough space", err)
	}
	if space.Need != 1<<20 || space.Free != 512<<10 {
		t.Errorf("need %d free %d", space.Need, space.Free)
	}
	if !strings.HasPrefix(space.Error(), "not enough space: needs 1.0 MB, 524.3 kB free") {
		t.Errorf("message = %q", space.Error())
	}
	if _, statErr := os.Stat(dst); !os.IsNotExist(statErr) {
		t.Error("something was written")
	}
}

// A compressed tar can't be measured up front, so each entry is checked
// against free space before it is written.
func TestFreeSpaceCheckedPerEntryWithoutAnIndex(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "big.tar.gz")
	writeTarTo(t, src, map[string][]byte{"disk.img": randomBytes(t, 1<<20)},
		func(w io.Writer) io.WriteCloser { return gzip.NewWriter(w) })
	opts := guardOpts()
	opts.FreeSpace = func() (uint64, error) { return 512 << 10, nil }
	err := extractArchive(context.Background(), src, filepath.Join(dir, "out"), "", opts)
	var space *fberrors.InsufficientSpaceError
	if !errors.As(err, &space) {
		t.Fatalf("err = %v, want not enough space", err)
	}
}

func TestPathTraversalStillRejected(t *testing.T) {
	for _, name := range []string{"../evil.txt", "a/../../evil.txt", "/etc/evil.txt"} {
		dir := t.TempDir()
		src := filepath.Join(dir, "evil.zip")
		writeZipBytes(t, src, map[string][]byte{name: []byte("x")})
		dst := filepath.Join(dir, "out")
		err := extractArchive(context.Background(), src, dst, "", guardOpts())
		var unsafe *fberrors.UnsafeArchiveError
		if !errors.As(err, &unsafe) || !strings.Contains(unsafe.Error(), "outside the destination") {
			t.Errorf("%s: err = %v", name, err)
		}
		if _, statErr := os.Stat(filepath.Join(dir, "evil.txt")); !os.IsNotExist(statErr) {
			t.Errorf("%s: wrote outside the destination", name)
		}
	}
}

func TestArchiveDiskSizeCountsEveryRarVolume(t *testing.T) {
	dir := t.TempDir()
	for name, size := range map[string]int{
		"set.part1.rar": 100, "set.part2.rar": 100, "set.part3.rar": 50,
		"other.part1.rar": 999, "old.rar": 10, "old.r00": 20, "old.r01": 30,
	} {
		mustWrite(t, filepath.Join(dir, name), make([]byte, size))
	}
	if got := archiveDiskSize(filepath.Join(dir, "set.part2.rar")); got != 250 {
		t.Errorf("part set = %d, want 250", got)
	}
	if got := archiveDiskSize(filepath.Join(dir, "old.rar")); got != 60 {
		t.Errorf("old-style set = %d, want 60", got)
	}
}

func TestHumanBytes(t *testing.T) {
	for n, want := range map[uint64]string{
		512: "512 B", 48_200_000_000: "48.2 GB", 31_000_000_000: "31.0 GB", 1_500_000: "1.5 MB",
	} {
		if got := fberrors.HumanBytes(n); got != want {
			t.Errorf("HumanBytes(%d) = %q, want %q", n, got, want)
		}
	}
}

// The reason reaches the browser: 422 with the refusal, 507 with the space.
func TestExtractHandlerReportsTheReason(t *testing.T) {
	smallLimits(t)
	root := t.TempDir()
	writeZipBytes(t, filepath.Join(root, "bomb.zip"), map[string][]byte{"zeros.bin": make([]byte, 4<<20)})
	writeZipBytes(t, filepath.Join(root, "fine.zip"), map[string][]byte{"a.txt": randomBytes(t, 1<<20)})

	db, err := storm.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	st, err := bolt.NewStorage(db)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Settings.Save(&settings.Settings{Key: authzSigningKey}); err != nil {
		t.Fatal(err)
	}
	if err := st.Users.Save(&users.User{Username: "u", Password: "x", Scope: "/",
		Perm: users.Permissions{Create: true, Modify: true}}); err != nil {
		t.Fatal(err)
	}
	st.Users = &customFSUser{Store: st.Users, fs: afero.NewBasePathFs(afero.NewOsFs(), root)}
	u, err := st.Users.Get("/", "u")
	if err != nil {
		t.Fatal(err)
	}
	token := mintToken(t, u, authzSigningKey)

	post := func(srv *settings.Server, archive string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/"+archive+"?destination=%2Fout", http.NoBody)
		r.Header.Set("X-Auth", token)
		rec := httptest.NewRecorder()
		handle(extractHandler(), "", st, nil, nil, srv).ServeHTTP(rec, r)
		return rec
	}

	srv := &settings.Server{Root: root, UnzipEnabled: true, MaxZipFileEntries: 1000, ExtractMaxRatio: 100}
	rec := post(srv, "bomb.zip")
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "exceeds safe compression ratio") {
		t.Errorf("bomb: %d %q", rec.Code, rec.Body)
	}

	// A margin no disk can meet: not enough space, said plainly.
	full := *srv
	full.ExtractFreeSpaceMargin = 1 << 62
	rec = post(&full, "fine.zip")
	if rec.Code != http.StatusInsufficientStorage || !strings.Contains(rec.Body.String(), "not enough space: needs 1.0 MB") {
		t.Errorf("full disk: %d %q", rec.Code, rec.Body)
	}

	rec = post(srv, "fine.zip")
	if rec.Code != http.StatusOK {
		t.Errorf("fine: %d %q", rec.Code, rec.Body)
	}
}
