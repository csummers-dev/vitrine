// Package audiotags reads and writes the common metadata tags (and embedded
// cover art) of audio files. It supports MP3 (ID3v2) and FLAC (Vorbis
// comments) via dedicated native libraries, plus MP4/AAC/ALAC (.m4a) and the
// Ogg family (.ogg/.oga Vorbis, .opus) via TagLib (compiled to WebAssembly,
// run through the pure-Go wazero runtime — no cgo).
//
// Writes are ATOMIC: the new file is built in a sibling temp file and
// rename()d over the original, so a crash or error mid-write can never
// corrupt the user's file. The package operates on real OS paths (osFs only),
// just like the archive-extract handler.
package audiotags

import (
	"errors"
	"path/filepath"
	"strings"
)

// ErrUnsupportedFormat is returned for a file whose extension isn't an editable
// audio format.
var ErrUnsupportedFormat = errors.New("audiotags: unsupported audio format")

// Picture is an embedded cover image.
type Picture struct {
	MIME string
	Data []byte
}

// Tags is the normalized, editable tag set. Empty strings / nil slices mean
// "not present". The numeric-ish fields (Year, Track, Disc) are kept as
// strings so we round-trip exactly what's in the file rather than guessing a
// format. JSON tags drive the HTTP read endpoint.
type Tags struct {
	Title       string   `json:"title"`
	Artist      string   `json:"artist"`
	Album       string   `json:"album"`
	AlbumArtist string   `json:"albumArtist"`
	Year        string   `json:"year"`
	Track       string   `json:"track"`
	TrackTotal  string   `json:"trackTotal"`
	Disc        string   `json:"disc"`
	DiscTotal   string   `json:"discTotal"`
	Genres      []string `json:"genres"`
	Composer    string   `json:"composer"`
	Comment     string   `json:"comment"`
	HasPicture  bool     `json:"hasPicture"`
	PictureMIME string   `json:"pictureMime,omitempty"`
}

// PictureAction tells Write what to do with the embedded cover art.
type PictureAction int

const (
	// PictureKeep leaves the existing cover art untouched.
	PictureKeep PictureAction = iota
	// PictureReplace replaces (or adds) the cover art with NewPicture.
	PictureReplace
	// PictureRemove strips all embedded cover art.
	PictureRemove
)

// Changes is a PARTIAL update. A non-nil pointer means "set this field to this
// value" (an empty string clears the field); nil means "leave it exactly as
// it is". That distinction is what makes the batch editor correct: only the
// fields the user actually touched are sent, and they're applied to every
// selected file while everything else is preserved per file.
type Changes struct {
	Title       *string
	Artist      *string
	Album       *string
	AlbumArtist *string
	Year        *string
	Track       *string
	TrackTotal  *string
	Disc        *string
	DiscTotal   *string
	Genres      *[]string
	Composer    *string
	Comment     *string

	Picture    PictureAction
	NewPicture *Picture // required when Picture == PictureReplace
}

// IsSupported reports whether the file (by extension) is an editable format.
func IsSupported(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".mp3", ".flac", ".m4a", ".ogg", ".oga", ".opus":
		return true
	}
	return false
}

// Read returns the current tags of the file at realPath. The embedded cover
// art bytes are NOT included (only HasPicture / PictureMIME) to keep reads
// cheap — the front end shows the current cover via the thumbnail endpoint.
func Read(realPath string) (*Tags, error) {
	switch strings.ToLower(filepath.Ext(realPath)) {
	case ".mp3":
		return readMP3(realPath)
	case ".flac":
		return readFLAC(realPath)
	case ".m4a", ".ogg", ".oga", ".opus":
		return readTagLib(realPath)
	default:
		return nil, ErrUnsupportedFormat
	}
}

// Write applies ch to the file at realPath, atomically.
func Write(realPath string, ch Changes) error {
	switch strings.ToLower(filepath.Ext(realPath)) {
	case ".mp3":
		return atomicReplace(realPath, func(tmp string) error {
			return writeMP3(realPath, tmp, ch)
		})
	case ".flac":
		return atomicReplace(realPath, func(tmp string) error {
			return writeFLAC(realPath, tmp, ch)
		})
	case ".m4a", ".ogg", ".oga", ".opus":
		return atomicReplace(realPath, func(tmp string) error {
			return writeTagLib(realPath, tmp, ch)
		})
	default:
		return ErrUnsupportedFormat
	}
}

// ── small shared helpers ─────────────────────────────────────────────────

// splitNumTotal splits a "5/12" style value into ("5", "12"). A bare "5"
// yields ("5", "").
func splitNumTotal(s string) (num, total string) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ""
	}
	if i := strings.IndexByte(s, '/'); i >= 0 {
		return strings.TrimSpace(s[:i]), strings.TrimSpace(s[i+1:])
	}
	return s, ""
}

// combineNumTotal recombines a number + total into the "5/12" form ID3 uses.
func combineNumTotal(num, total string) string {
	num, total = strings.TrimSpace(num), strings.TrimSpace(total)
	switch {
	case num == "" && total == "":
		return ""
	case total == "":
		return num
	default:
		return num + "/" + total
	}
}

// splitGenres splits a single MP3 genre string (which may carry several
// genres) into a clean list. Separators are ';' and the NUL that ID3v2.4 uses
// between multiple values — matching how the editor joins genres on write and
// how the frontend parses them. We deliberately do NOT split on '/', so a
// genre that legitimately contains a slash (e.g. "Folk/Rock") survives intact.
func splitGenres(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return r == ';' || r == '\x00'
	})
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if f = strings.TrimSpace(f); f != "" {
			out = append(out, f)
		}
	}
	return out
}
