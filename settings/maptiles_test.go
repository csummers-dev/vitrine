package settings

import "testing"

func TestMapTileURL(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", DefaultMapTiles},
		{"off", ""},
		{" OFF ", ""},
		{"none", ""},
		{"https://t.example/{z}/{x}/{y}.png", "https://t.example/{z}/{x}/{y}.png"},
	}
	for _, c := range cases {
		s := &Server{MapTiles: c.in}
		if got := s.MapTileURL(); got != c.want {
			t.Errorf("MapTileURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
