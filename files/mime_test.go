package files

import (
	"mime"
	"strings"
	"testing"
)

// WS2: `.opus` was registered as "video/ogg", so a valid Opus file was typed
// "video" and routed to the video player instead of the audio viewer. It's now
// "audio/ogg". This guards every taggable audio extension against ever
// resolving to a non-audio MIME again (which would mis-route the preview).
func TestAudioExtensionsClassifyAsAudio(t *testing.T) {
	for _, ext := range []string{".opus", ".ogg", ".oga", ".mp3", ".flac", ".m4a"} {
		got := mime.TypeByExtension(ext)
		if !strings.HasPrefix(got, "audio") {
			t.Errorf("%s = %q, want an audio/* type", ext, got)
		}
	}
}
