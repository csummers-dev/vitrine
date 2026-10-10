package fbhttp

import (
	"net/http/httptest"
	"testing"
)

func TestIsCountedDownload(t *testing.T) {
	cases := []struct {
		url, rng string
		want     bool
	}{
		{"/api/public/dl/h/f.zip", "", true},
		{"/api/public/dl/h/f.mp4", "bytes=0-", true},
		{"/api/public/dl/h/f.mp4", "bytes=1048576-", false},
		{"/api/public/dl/h/f.jpg?inline=true", "", false},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", c.url, nil)
		if c.rng != "" {
			r.Header.Set("Range", c.rng)
		}
		if got := isCountedDownload(r); got != c.want {
			t.Errorf("isCountedDownload(%s, %q) = %v, want %v", c.url, c.rng, got, c.want)
		}
	}
}
