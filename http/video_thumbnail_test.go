package fbhttp

import (
	"os/exec"
	"path/filepath"
	"testing"
)

// TestRunFFmpegThumbnail exercises the real ffmpeg poster-frame pipeline
// end-to-end (v1.3 S6-2): it synthesizes a tiny test clip, runs the same
// command the preview handler uses, and asserts the output is a JPEG.
// Skips cleanly when ffmpeg isn't installed, so CI without ffmpeg stays
// green (mirroring the runtime graceful-degradation contract).
func TestRunFFmpegThumbnail(t *testing.T) {
	t.Parallel()

	bin := ffmpegPath()
	if bin == "" {
		t.Skip("ffmpeg not installed; skipping video-thumbnail generation test")
	}

	// Synthesize a 1s 128x128 test clip via ffmpeg's lavfi source.
	dir := t.TempDir()
	clip := filepath.Join(dir, "clip.mp4")
	gen := exec.Command(bin,
		"-loglevel", "error",
		"-f", "lavfi",
		"-i", "testsrc=duration=1:size=128x128:rate=10",
		"-pix_fmt", "yuv420p",
		clip,
	)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("failed to synthesize test clip: %v (%s)", err, out)
	}

	jpg, err := runFFmpegThumbnail(bin, clip, "clip.mp4")
	if err != nil {
		t.Fatalf("runFFmpegThumbnail: %v", err)
	}
	if len(jpg) == 0 {
		t.Fatal("expected JPEG bytes, got none")
	}
	// JPEG SOI marker: FF D8.
	if jpg[0] != 0xFF || jpg[1] != 0xD8 {
		t.Fatalf("output is not a JPEG (first bytes % x)", jpg[:min(2, len(jpg))])
	}
}
