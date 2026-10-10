package fbhttp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseTileCoords(t *testing.T) {
	cases := []struct {
		z, x, y string
		ok      bool
	}{
		{"0", "0", "0", true},
		{"3", "7", "7.png", true},
		{"19", "524287", "1", true},
		{"20", "0", "0", false},
		{"3", "8", "0", false},
		{"3", "0", "-1", false},
		{"a", "0", "0", false},
	}
	for _, c := range cases {
		_, _, _, err := parseTileCoords(c.z, c.x, c.y)
		if (err == nil) != c.ok {
			t.Errorf("parseTileCoords(%s,%s,%s) err=%v, want ok=%v", c.z, c.x, c.y, err, c.ok)
		}
	}
}

func TestTileURL(t *testing.T) {
	got := tileURL("https://{s}.tiles.example/{z}/{x}/{y}.png", 4, 3, 2)
	if got != "https://a.tiles.example/4/3/2.png" {
		t.Errorf("tileURL = %q", got)
	}
}

func TestFetchTile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("User-Agent"), "vitrine/") {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/ok.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("png-bytes"))
		case "/html":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html>"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	body, ct, err := fetchTile(context.Background(), srv.URL+"/ok.png")
	if err != nil || string(body) != "png-bytes" || ct != "image/png" {
		t.Fatalf("ok tile: %q %q %v", body, ct, err)
	}
	if _, _, err := fetchTile(context.Background(), srv.URL+"/html"); err == nil {
		t.Error("non-image response should fail")
	}
	if _, _, err := fetchTile(context.Background(), srv.URL+"/missing"); err == nil {
		t.Error("404 should fail")
	}
}
