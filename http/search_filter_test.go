package fbhttp

import (
	"net/url"
	"testing"
	"time"
)

func TestSearchFilterMatch(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	week := now.Add(-7 * 24 * time.Hour)
	v := url.Values{}
	v.Set("type", "Video")
	v.Set("minSize", "1000")
	v.Set("maxSize", "5000")
	v.Set("newer", "1799395200") // now - 7 days
	f := parseSearchFilter(v)

	cases := []struct {
		label string
		name  string
		dir   bool
		size  int64
		mod   time.Time
		want  bool
	}{
		{"fits", "Trip.MKV", false, 2000, now, true},
		{"edge sizes", "a.mp4", false, 1000, week, true},
		{"upper edge", "a.mp4", false, 5000, now, true},
		{"too small", "a.mp4", false, 999, now, false},
		{"too big", "a.mp4", false, 5001, now, false},
		{"too old", "a.mp4", false, 2000, week.Add(-time.Second), false},
		{"wrong kind", "a.jpg", false, 2000, now, false},
		{"folder", "Videos.mp4", true, 2000, now, false},
	}
	for _, c := range cases {
		if got := f.match(c.name, c.dir, c.size, c.mod); got != c.want {
			t.Errorf("%s: match = %v, want %v", c.label, got, c.want)
		}
	}
}

func TestSearchFilterLenient(t *testing.T) {
	v := url.Values{}
	v.Set("minSize", "lots")
	v.Set("maxSize", "-4")
	v.Set("newer", "yesterday")
	v.Set("q", " Draft ")
	f := parseSearchFilter(v)
	if f.minSize != -1 || f.maxSize != -1 || !f.newer.IsZero() {
		t.Fatalf("bad numbers parsed: %+v", f)
	}
	// Name-only filters keep folders.
	if !f.match("Drafts", true, 0, time.Time{}) {
		t.Error("folder dropped by a name-only filter")
	}
	if f.match("final.txt", false, 1, time.Time{}) {
		t.Error("name filter ignored")
	}
}

func TestSearchKind(t *testing.T) {
	cases := []struct{ name, kind, typ string }{
		{"IMG_1.HEIC", "image", "image"},
		{"song.flac", "audio", "audio"},
		{"film.ts", "video", "video"},
		{"notes.md", "text", "text"},
		{"book.pdf", "pdf", "pdf"},
		{"backup.tar.gz", "archive", "blob"},
		{"Makefile", "", "blob"},
	}
	for _, c := range cases {
		if got := searchKind(c.name); got != c.kind {
			t.Errorf("searchKind(%q) = %q, want %q", c.name, got, c.kind)
		}
		if got := listingType(c.name, false); got != c.typ {
			t.Errorf("listingType(%q) = %q, want %q", c.name, got, c.typ)
		}
	}
	if listingType("x.mp4", true) != "dir" {
		t.Error("folder type")
	}
}
