package audiotags

import (
	"net/http"
	"strings"

	taglib "go.senan.xyz/taglib"
)

// taglib.go is the TagLib-backed read/write path for the formats that don't
// have a dedicated native implementation in this package: MP4 / AAC / ALAC
// (.m4a) and the Ogg family (.ogg / .oga Vorbis, .opus). TagLib (compiled to
// WebAssembly and run via the pure-Go wazero runtime — no cgo) detects the
// concrete format from the file contents, so one path serves them all.
//
// MP3 and FLAC deliberately keep their dedicated native paths (bogem/id3v2 and
// go-flac) — this backend exists only to extend coverage, not replace them.

// TagLib's unified PropertyMap has no constant for the track/disc TOTAL, so we
// use the de-facto Vorbis-comment keys directly. Track/disc number+total are
// otherwise stored combined as "5/12" in the NUMBER key (the portable form
// TagLib maps correctly across MP4 trkn / disk and Ogg comments).
const (
	tlTrackTotal = "TRACKTOTAL"
	tlDiscTotal  = "DISCTOTAL"
)

func readTagLib(path string) (*Tags, error) {
	m, err := taglib.ReadTags(path)
	if err != nil {
		return nil, err
	}

	t := &Tags{
		Title:       tlFirst(m, taglib.Title),
		Artist:      tlFirst(m, taglib.Artist),
		Album:       tlFirst(m, taglib.Album),
		AlbumArtist: tlFirst(m, taglib.AlbumArtist),
		Year:        tlFirst(m, taglib.Date),
		Composer:    tlFirst(m, taglib.Composer),
		Comment:     tlFirst(m, taglib.Comment),
		Genres:      tlClean(m[taglib.Genre]),
	}
	t.Track, t.TrackTotal = tlNumTotal(m, taglib.TrackNumber, tlTrackTotal)
	t.Disc, t.DiscTotal = tlNumTotal(m, taglib.DiscNumber, tlDiscTotal)

	// Cover art: read just enough to report presence + MIME (the bytes are
	// served separately via the thumbnail endpoint, same as the other formats).
	if img, iErr := taglib.ReadImage(path); iErr == nil && len(img) > 0 {
		t.HasPicture = true
		t.PictureMIME = http.DetectContentType(img)
	}
	return t, nil
}

func writeTagLib(origPath, tmpPath string, ch Changes) error {
	// Edit a copy in place (same pattern as the MP3 path), then atomicReplace
	// renames it over the original.
	if err := copyFile(origPath, tmpPath); err != nil {
		return err
	}

	// Read the full current property map and mutate it in place, then write it
	// back with Clear so the written set is EXACTLY what we computed. Starting
	// from the full map means tags we don't model (MusicBrainz IDs, ReplayGain,
	// …) are preserved untouched. Cover art is independent of WriteTags, so it
	// survives unless we explicitly change it below.
	tags, err := taglib.ReadTags(tmpPath)
	if err != nil {
		return err
	}
	if tags == nil {
		tags = map[string][]string{}
	}

	setText := func(key string, p *string) {
		if p == nil {
			return
		}
		if *p == "" {
			delete(tags, key)
		} else {
			tags[key] = []string{*p}
		}
	}
	setText(taglib.Title, ch.Title)
	setText(taglib.Artist, ch.Artist)
	setText(taglib.Album, ch.Album)
	setText(taglib.AlbumArtist, ch.AlbumArtist)
	setText(taglib.Date, ch.Year)
	setText(taglib.Composer, ch.Composer)
	setText(taglib.Comment, ch.Comment)

	tlApplyNumTotal(tags, taglib.TrackNumber, tlTrackTotal, ch.Track, ch.TrackTotal)
	tlApplyNumTotal(tags, taglib.DiscNumber, tlDiscTotal, ch.Disc, ch.DiscTotal)

	if ch.Genres != nil {
		if g := tlNonEmpty(*ch.Genres); len(g) > 0 {
			tags[taglib.Genre] = g
		} else {
			delete(tags, taglib.Genre)
		}
	}

	if err := taglib.WriteTags(tmpPath, tags, taglib.Clear); err != nil {
		return err
	}

	switch ch.Picture {
	case PictureReplace:
		if ch.NewPicture != nil {
			if err := taglib.WriteImage(tmpPath, ch.NewPicture.Data); err != nil {
				return err
			}
		}
	case PictureRemove:
		if err := taglib.WriteImage(tmpPath, nil); err != nil {
			return err
		}
	case PictureKeep:
		// leave the existing cover art untouched
	}
	return nil
}

// ── helpers ──────────────────────────────────────────────────────────────

func tlFirst(m map[string][]string, key string) string {
	if v := m[key]; len(v) > 0 {
		return strings.TrimSpace(v[0])
	}
	return ""
}

// tlClean trims a multi-value slice and drops empties (read side). Returns nil
// when nothing remains so "not present" round-trips as an empty Genres slice.
func tlClean(vals []string) []string {
	out := tlNonEmpty(vals)
	if len(out) == 0 {
		return nil
	}
	return out
}

// tlNonEmpty trims and drops empty entries (write side); may return an empty,
// non-nil slice.
func tlNonEmpty(vals []string) []string {
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// tlNumTotal returns (number, total) for a track/disc pair, accepting either a
// combined "5/12" number field or separate number + *TOTAL fields.
func tlNumTotal(m map[string][]string, numKey, totKey string) (num, total string) {
	num = tlFirst(m, numKey)
	total = tlFirst(m, totKey)
	if total == "" {
		num, total = splitNumTotal(num)
	}
	return num, total
}

// tlApplyNumTotal applies a track/disc number+total change to the map. Only the
// half the caller changed is overwritten; the other half is preserved (read via
// tlNumTotal). The result is written as a single combined "num/total" value in
// numKey, and any stale separate *TOTAL field is dropped. A no-op (both nil)
// leaves the map untouched.
func tlApplyNumTotal(tags map[string][]string, numKey, totKey string, numP, totP *string) {
	if numP == nil && totP == nil {
		return
	}
	num, total := tlNumTotal(tags, numKey, totKey)
	if numP != nil {
		num = *numP
	}
	if totP != nil {
		total = *totP
	}
	if combined := combineNumTotal(num, total); combined != "" {
		tags[numKey] = []string{combined}
	} else {
		delete(tags, numKey)
	}
	delete(tags, totKey)
}
