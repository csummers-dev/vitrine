package fbhttp

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

// artworkReq builds a parsed multipart *http.Request carrying one "artwork"
// file part with the given declared content-type (empty = none declared).
func artworkReq(t *testing.T, declaredMIME string, data []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	hdr := make(textproto.MIMEHeader)
	hdr.Set("Content-Disposition", `form-data; name="artwork"; filename="cover"`)
	if declaredMIME != "" {
		hdr.Set("Content-Type", declaredMIME)
	}
	pw, err := mw.CreatePart(hdr)
	if err != nil {
		t.Fatalf("create part: %v", err)
	}
	if data != nil {
		if _, err := pw.Write(data); err != nil {
			t.Fatalf("write part: %v", err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	r := httptest.NewRequest("PATCH", "/api/audio-tags", &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		t.Fatalf("parse multipart: %v", err)
	}
	return r
}

func TestReadArtwork(t *testing.T) {
	cover := pngBytes(t)

	t.Run("explicit content-type is used", func(t *testing.T) {
		pic, status, err := readArtwork(artworkReq(t, "image/png", cover))
		if err != nil {
			t.Fatalf("status %d err %v", status, err)
		}
		if pic.MIME != "image/png" {
			t.Errorf("MIME = %q, want image/png", pic.MIME)
		}
		if !bytes.Equal(pic.Data, cover) {
			t.Error("data mismatch")
		}
	})

	t.Run("missing content-type is sniffed", func(t *testing.T) {
		pic, status, err := readArtwork(artworkReq(t, "", cover))
		if err != nil {
			t.Fatalf("status %d err %v", status, err)
		}
		if pic.MIME != "image/png" {
			t.Errorf("sniffed MIME = %q, want image/png", pic.MIME)
		}
	})

	t.Run("empty part is rejected", func(t *testing.T) {
		if _, _, err := readArtwork(artworkReq(t, "image/png", nil)); err == nil {
			t.Error("expected error for empty artwork")
		}
	})
}

// TestWritePayloadPartialSemantics verifies the property that makes batch
// edits correct: a JSON key that's ABSENT leaves the field untouched (nil
// pointer), while a key PRESENT with an empty string clears it (non-nil "").
func TestWritePayloadPartialSemantics(t *testing.T) {
	const js = `{"paths":["/a.mp3","/b.flac"],"set":{"album":"X","comment":""},"artwork":"keep"}`
	var pl audioTagsWritePayload
	if err := json.Unmarshal([]byte(js), &pl); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(pl.Paths) != 2 {
		t.Fatalf("paths = %v", pl.Paths)
	}
	if pl.Set.Album == nil || *pl.Set.Album != "X" {
		t.Errorf("album = %v, want ->X", pl.Set.Album)
	}
	if pl.Set.Comment == nil || *pl.Set.Comment != "" {
		t.Errorf("comment = %v, want ->\"\" (clear)", pl.Set.Comment)
	}
	if pl.Set.Title != nil {
		t.Errorf("title = %v, want nil (absent = unchanged)", *pl.Set.Title)
	}
	if pl.Artwork != "keep" {
		t.Errorf("artwork = %q, want keep", pl.Artwork)
	}
}
