package share

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestCleanUploadName(t *testing.T) {
	ok := []string{"photo.jpg", " report final.pdf ", ".bashrc", "naïve résumé.docx"}
	for _, n := range ok {
		if _, err := CleanUploadName(n); err != nil {
			t.Errorf("%q rejected: %v", n, err)
		}
	}
	bad := []string{"", ".", "..", "../etc/passwd", `..\\win.ini`, "a/b", "x\x00y", "tab\tname", strings.Repeat("a", 256), "\xff\xfe"}
	for _, n := range bad {
		if _, err := CleanUploadName(n); !errors.Is(err, ErrBadName) {
			t.Errorf("%q accepted", n)
		}
	}
}

func TestCleanUploaderName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Alice", "Alice"},
		{"  ../../Bob  ", "Bob"},
		{"", "Anonymous"},
		{"..", "Anonymous"},
		{"Eve\x00/\\", "Eve"},
		{strings.Repeat("é", 70), strings.Repeat("é", 32)},
	}
	for _, c := range cases {
		if got := CleanUploaderName(c.in); got != c.want {
			t.Errorf("CleanUploaderName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestCheckUpload(t *testing.T) {
	l := &Link{AllowedExtensions: []string{".jpg", ".pdf"}, MaxFileSize: 100, MaxTotalSize: 250, UploadedBytes: 200}
	if err := l.CheckUpload("a.JPG", 40); err != nil {
		t.Errorf("allowed upload: %v", err)
	}
	if err := l.CheckUpload("a.exe", 1); !errors.Is(err, ErrExtension) {
		t.Errorf("extension: %v", err)
	}
	if err := l.CheckUpload("a.pdf", 101); !errors.Is(err, ErrFileTooLarge) {
		t.Errorf("file size: %v", err)
	}
	if err := l.CheckUpload("a.pdf", 60); !errors.Is(err, ErrQuotaExceeded) {
		t.Errorf("quota: %v", err)
	}
	if err := (&Link{}).CheckUpload("anything", 1<<40); err != nil {
		t.Errorf("no limits: %v", err)
	}
}

func TestNormalizeExtensions(t *testing.T) {
	got := NormalizeExtensions([]string{"JPG, .png  pdf", ".jpg", "a/b", ""})
	if want := []string{".jpg", ".png", ".pdf"}; !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestUniqueName(t *testing.T) {
	taken := map[string]bool{"a.txt": true, "a (2).txt": true, ".env": true}
	exists := func(n string) bool { return taken[n] }
	cases := []struct{ in, want string }{
		{"b.txt", "b.txt"},
		{"a.txt", "a (3).txt"},
		{".env", ".env (2)"},
	}
	for _, c := range cases {
		if got, err := UniqueName(c.in, exists); err != nil || got != c.want {
			t.Errorf("UniqueName(%q) = %q, %v; want %q", c.in, got, err, c.want)
		}
	}
}
