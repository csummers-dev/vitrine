package fbhttp

import (
	"strings"
	"testing"
)

func TestIsConvertedImageExt(t *testing.T) {
	for _, ext := range []string{".heic", ".HEIC", ".heif", ".avif"} {
		if !isConvertedImageExt(ext) {
			t.Errorf("%s should need conversion", ext)
		}
	}
	for _, ext := range []string{".jpg", ".webp", ".png", ""} {
		if isConvertedImageExt(ext) {
			t.Errorf("%s should not need conversion", ext)
		}
	}
}

func TestFfmpegScaleFilter(t *testing.T) {
	if got := ffmpegScaleFilter(true); !strings.Contains(got, "crop=256:256") {
		t.Errorf("thumb filter = %q", got)
	}
	if got := ffmpegScaleFilter(false); !strings.Contains(got, "min(1080,iw)") ||
		!strings.Contains(got, "force_original_aspect_ratio=decrease") {
		t.Errorf("big filter = %q", got)
	}
}
