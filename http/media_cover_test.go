package fbhttp

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/afero"

	"github.com/filebrowser/filebrowser/v2/files"
)

// tinyJPEG returns the bytes of a small valid JPEG.
func tinyJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 60), G: uint8(y * 60), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func id3v23Frame(id string, content []byte) []byte {
	var sz [4]byte
	binary.BigEndian.PutUint32(sz[:], uint32(len(content)))
	out := append([]byte(id), sz[:]...)
	out = append(out, 0x00, 0x00) // frame flags
	return append(out, content...)
}

func id3v23Tag(frames []byte) []byte {
	size := len(frames)
	hdr := []byte("ID3")
	hdr = append(hdr, 0x03, 0x00, 0x00) // v2.3.0, no flags
	hdr = append(hdr,
		byte((size>>21)&0x7f),
		byte((size>>14)&0x7f),
		byte((size>>7)&0x7f),
		byte(size&0x7f),
	)
	return append(hdr, frames...)
}

// writeMalformedMP3 writes an MP3 whose ID3v2.3 tag carries (a) a TIT2 text
// frame with an *odd*-length UTF-16 payload — the exact shape that makes
// dhowden/tag abort with "expected even number of bytes" — followed by (b) a
// well-formed APIC cover. Mirrors the real-world file reported in V3 #16.
func writeMalformedMP3(t *testing.T, dir string, jpegData []byte) string {
	t.Helper()

	// TIT2: encoding 0x01 (UTF-16) + BOM + a single stray byte => odd count.
	badTitle := []byte{0x01, 0xFF, 0xFE, 0x41}

	// APIC: enc(0) + "image/jpeg"\0 + picType(0x03 front cover) + desc\0 + jpeg.
	apic := []byte{0x00}
	apic = append(apic, []byte("image/jpeg")...)
	apic = append(apic, 0x00, 0x03, 0x00)
	apic = append(apic, jpegData...)

	frames := append(id3v23Frame("TIT2", badTitle), id3v23Frame("APIC", apic)...)
	tag := id3v23Tag(frames)
	// A few bytes of "audio" after the tag (content is irrelevant to the scan).
	tag = append(tag, bytes.Repeat([]byte{0xFF, 0xFB, 0x90, 0x00}, 8)...)

	p := filepath.Join(dir, "cover.mp3")
	if err := os.WriteFile(p, tag, 0o644); err != nil {
		t.Fatalf("write mp3: %v", err)
	}
	return p
}

func TestExtractAudioCover_MalformedUTF16Fallback(t *testing.T) {
	jpegData := tinyJPEG(t)
	dir := t.TempDir()
	p := writeMalformedMP3(t, dir, jpegData)
	fi := &files.FileInfo{Fs: afero.NewOsFs(), Path: p}

	// The dhowden primary path is expected to fail on the malformed frame; the
	// fallback must still recover the cover. (Soft-log the primary so the test
	// doesn't break if dhowden ever becomes lenient.)
	if _, err := extractAudioCoverViaTag(fi); err != nil {
		t.Logf("dhowden path errored as expected: %v", err)
	}

	// Direct fallback.
	got, err := extractID3APIC(fi)
	if err != nil {
		t.Fatalf("extractID3APIC: %v", err)
	}
	if !bytes.Equal(got, jpegData) {
		t.Fatalf("extractID3APIC returned %d bytes, want the %d-byte JPEG", len(got), len(jpegData))
	}
	if _, format, derr := image.DecodeConfig(bytes.NewReader(got)); derr != nil || format != "jpeg" {
		t.Fatalf("extracted bytes are not a decodable jpeg: format=%q err=%v", format, derr)
	}

	// Combined public entry point.
	got2, err := extractAudioCover(fi)
	if err != nil {
		t.Fatalf("extractAudioCover: %v", err)
	}
	if !bytes.Equal(got2, jpegData) {
		t.Fatalf("extractAudioCover returned %d bytes, want %d", len(got2), len(jpegData))
	}
}

// A clean (no-cover) ID3 tag must report no cover, not a false positive.
func TestExtractID3APIC_NoCover(t *testing.T) {
	frames := id3v23Frame("TIT2", []byte{0x00, 'h', 'i'})
	tag := id3v23Tag(frames)
	dir := t.TempDir()
	p := filepath.Join(dir, "nocover.mp3")
	if err := os.WriteFile(p, tag, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	fi := &files.FileInfo{Fs: afero.NewOsFs(), Path: p}
	if _, err := extractID3APIC(fi); err == nil {
		t.Fatal("expected errNoCover for a tag with no APIC frame")
	}
}
