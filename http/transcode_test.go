package fbhttp

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// TestEvictTranscodeCache verifies the size-cap LRU: oldest .mp4 files are
// deleted first until the directory is under the cap; the newest survives.
func TestEvictTranscodeCache(t *testing.T) {
	dir := t.TempDir()
	// Three 100-byte files with staggered mtimes (a oldest … c newest).
	names := []string{"a.mp4", "b.mp4", "c.mp4"}
	base := time.Now().Add(-3 * time.Hour)
	for i, n := range names {
		p := filepath.Join(dir, n)
		if err := os.WriteFile(p, make([]byte, 100), 0o644); err != nil {
			t.Fatalf("write %s: %v", n, err)
		}
		mt := base.Add(time.Duration(i) * time.Hour)
		if err := os.Chtimes(p, mt, mt); err != nil {
			t.Fatalf("chtimes %s: %v", n, err)
		}
	}
	// A non-.mp4 file must be ignored by eviction.
	if err := os.WriteFile(filepath.Join(dir, "index.db"), make([]byte, 100), 0o644); err != nil {
		t.Fatal(err)
	}

	// Cap of 150 bytes → must keep only the newest (c, 100 bytes).
	evictTranscodeCache(dir, 150)

	if _, err := os.Stat(filepath.Join(dir, "a.mp4")); !os.IsNotExist(err) {
		t.Error("oldest a.mp4 should have been evicted")
	}
	if _, err := os.Stat(filepath.Join(dir, "b.mp4")); !os.IsNotExist(err) {
		t.Error("b.mp4 should have been evicted")
	}
	if _, err := os.Stat(filepath.Join(dir, "c.mp4")); err != nil {
		t.Error("newest c.mp4 should have been kept")
	}
	if _, err := os.Stat(filepath.Join(dir, "index.db")); err != nil {
		t.Error("non-mp4 index.db must not be touched")
	}
}

// TestEvictTranscodeCacheUnderCap leaves everything when already under cap.
func TestEvictTranscodeCacheUnderCap(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"a.mp4", "b.mp4"} {
		if err := os.WriteFile(filepath.Join(dir, n), make([]byte, 100), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	evictTranscodeCache(dir, 10_000)
	for _, n := range []string{"a.mp4", "b.mp4"} {
		if _, err := os.Stat(filepath.Join(dir, n)); err != nil {
			t.Errorf("%s should be kept (under cap)", n)
		}
	}
}

// TestGenerateTranscodeSmoke exercises the real ffmpeg pipeline end to end:
// synthesize a tiny H.264/AAC .mkv, transcode it, and assert a playable .mp4
// lands at outPath. Skips cleanly when ffmpeg isn't installed.
func TestGenerateTranscodeSmoke(t *testing.T) {
	bin := ffmpegPath()
	if bin == "" {
		t.Skip("ffmpeg not installed; skipping transcode smoke test")
	}
	dir := t.TempDir()
	srcMkv := filepath.Join(dir, "in.mkv")

	gen := exec.Command(bin,
		"-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc=duration=1:size=128x128:rate=10",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=1",
		"-c:v", "libx264", "-c:a", "aac", "-shortest",
		"-y", srcMkv,
	)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Skipf("could not synthesize test clip (ffmpeg lacks codecs?): %v (%s)", err, out)
	}

	outPath := filepath.Join(dir, "out.mp4")
	if err := generateTranscode(srcMkv, outPath, dir); err != nil {
		t.Fatalf("generateTranscode: %v", err)
	}
	info, err := os.Stat(outPath)
	if err != nil {
		t.Fatalf("output mp4 missing: %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("output mp4 is empty")
	}
}
