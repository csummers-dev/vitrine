package share

import (
	"errors"
	"fmt"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Errors for drop-box uploads (4.0 Phase 4.1).
var (
	ErrBadName       = errors.New("file name not allowed")
	ErrExtension     = errors.New("file type not allowed")
	ErrFileTooLarge  = errors.New("file is larger than this link allows")
	ErrQuotaExceeded = errors.New("this link has no space left for that file")
)

const maxNameBytes = 255

// CleanUploadName validates a visitor-supplied file name: one path
// element, no control characters, not "." or "..", at most 255 bytes.
// Surrounding spaces are trimmed.
func CleanUploadName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "", name == ".", name == "..",
		len(name) > maxNameBytes,
		!utf8.ValidString(name),
		strings.ContainsAny(name, `/\`),
		strings.IndexFunc(name, unicode.IsControl) >= 0:
		return "", ErrBadName
	}
	return name, nil
}

// CleanUploaderName turns a visitor's name into a safe folder name:
// path-like and control characters removed, length capped, and
// "Anonymous" when nothing is left.
func CleanUploaderName(name string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(name) {
		if r == '/' || r == '\\' || unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
	}
	out := strings.Trim(b.String(), ". ")
	for len(out) > 64 {
		_, size := utf8.DecodeLastRuneInString(out)
		out = out[:len(out)-size]
	}
	if out == "" {
		return "Anonymous"
	}
	return out
}

// CheckUpload applies the link's per-file limits to a file of size bytes.
// Remaining space is checked separately, under the link's lock.
func (l *Link) CheckUpload(name string, size int64) error {
	if len(l.AllowedExtensions) > 0 {
		ext := strings.ToLower(path.Ext(name))
		ok := false
		for _, a := range l.AllowedExtensions {
			if ext == a {
				ok = true
				break
			}
		}
		if !ok {
			return ErrExtension
		}
	}
	if l.MaxFileSize > 0 && size > l.MaxFileSize {
		return ErrFileTooLarge
	}
	if l.MaxTotalSize > 0 && l.UploadedBytes+size > l.MaxTotalSize {
		return ErrQuotaExceeded
	}
	return nil
}

// NormalizeExtensions turns "JPG, .png  pdf" style input into
// [".jpg", ".png", ".pdf"], dropping duplicates and junk.
func NormalizeExtensions(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, item := range in {
		for _, e := range strings.FieldsFunc(item, func(r rune) bool { return r == ',' || unicode.IsSpace(r) }) {
			e = "." + strings.TrimLeft(strings.ToLower(e), ".")
			if e == "." || strings.ContainsAny(e, `/\`) || len(e) > 16 || seen[e] {
				continue
			}
			seen[e] = true
			out = append(out, e)
		}
	}
	return out
}

// UniqueName returns name, or "name (2).ext", "name (3).ext", … — the first
// that exists() reports free. Uploads never overwrite.
func UniqueName(name string, exists func(string) bool) (string, error) {
	if !exists(name) {
		return name, nil
	}
	ext := path.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if base == "" { // ".bashrc"
		base, ext = name, ""
	}
	for i := 2; i < 10000; i++ {
		c := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if !exists(c) {
			return c, nil
		}
	}
	return "", errors.New("too many files with this name")
}
