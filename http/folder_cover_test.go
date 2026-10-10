package fbhttp

import (
	"context"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/spf13/afero"

	"github.com/csummers-dev/vitrine/v4/files"
	"github.com/csummers-dev/vitrine/v4/img"
	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/users"
)

func TestPickFolderCover(t *testing.T) {
	all := func(string) bool { return true }
	cases := []struct {
		name      string
		names     []string
		allowed   func(string) bool
		wantCover string
		wantAudio []string
	}{
		{"none", []string{"a.txt", "b.mkv"}, all, "", nil},
		{"poster beats folder", []string{"folder.jpg", "poster.png"}, all, "poster.png", nil},
		{"case-insensitive", []string{"Folder.JPG"}, all, "Folder.JPG", nil},
		{"jpg beats png for one stem", []string{"cover.png", "cover.jpg"}, all, "cover.jpg", nil},
		{"webp counts", []string{"fanart.webp"}, all, "fanart.webp", nil},
		{"other images don't", []string{"photo.jpg", "covers.jpg"}, all, "", nil},
		{
			"audio sorted and capped", []string{"04.flac", "01.MP3", "03.m4a", "02.ogg", "notes.txt"}, all,
			"", []string{"01.MP3", "02.ogg", "03.m4a"},
		},
		{
			"rules hide a cover", []string{"poster.jpg", "folder.jpg"},
			func(n string) bool { return n != "poster.jpg" }, "folder.jpg", nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cover, audio := pickFolderCover(tc.names, tc.allowed)
			if cover != tc.wantCover {
				t.Errorf("cover = %q, want %q", cover, tc.wantCover)
			}
			if strings.Join(audio, ",") != strings.Join(tc.wantAudio, ",") {
				t.Errorf("audio = %v, want %v", audio, tc.wantAudio)
			}
		})
	}
}

type memFileCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *memFileCache) Store(_ context.Context, k string, v []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string][]byte{}
	}
	c.m[k] = v
	return nil
}

func (c *memFileCache) Load(_ context.Context, k string) ([]byte, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	return v, ok, nil
}

func (c *memFileCache) Delete(_ context.Context, k string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.m, k)
	return nil
}

func TestHandleFolderCover(t *testing.T) {
	fs := afero.NewMemMapFs()
	if err := afero.WriteFile(fs, "/Movies/Heat/Poster.JPG", tinyJPEG(t), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := afero.WriteFile(fs, "/Movies/Plain/readme.txt", []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	d := &data{
		settings: &settings.Settings{},
		user:     &users.User{ID: 1, Fs: fs},
	}
	svc := img.New(1)
	cache := &memFileCache{}

	serve := func(p string) *httptest.ResponseRecorder {
		t.Helper()
		dir, err := files.NewFileInfo(&files.FileOptions{Fs: fs, Path: p, Checker: d})
		if err != nil {
			t.Fatal(err)
		}
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/preview/thumb"+p, nil)
		status, err := handleFolderCover(rec, req, svc, cache, d, dir, PreviewSizeThumb, true)
		if err != nil {
			t.Fatal(err)
		}
		if status != 0 {
			rec.Code = status
		}
		return rec
	}

	rec := serve("/Movies/Heat")
	if rec.Code != http.StatusOK {
		t.Fatalf("cover folder: status %d", rec.Code)
	}
	if _, err := jpeg.DecodeConfig(rec.Body); err != nil {
		t.Fatalf("cover is not a JPEG: %v", err)
	}

	if rec := serve("/Movies/Plain"); rec.Code != http.StatusNotFound {
		t.Fatalf("plain folder: status %d, want 404", rec.Code)
	}
	if rec := serve("/Movies/Plain"); rec.Code != http.StatusNotFound {
		t.Fatalf("plain folder (cached miss): status %d, want 404", rec.Code)
	}
}
