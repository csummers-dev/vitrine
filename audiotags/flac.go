package audiotags

import (
	"strings"

	flacpicture "github.com/go-flac/flacpicture/v2"
	flacvorbis "github.com/go-flac/flacvorbis/v2"
	flac "github.com/go-flac/go-flac/v2"
)

// Standard Vorbis-comment field keys. Keys are case-insensitive per spec; we
// always write them uppercased.
const (
	vcTitle       = "TITLE"
	vcArtist      = "ARTIST"
	vcAlbum       = "ALBUM"
	vcAlbumArtist = "ALBUMARTIST"
	vcDate        = "DATE"
	vcGenre       = "GENRE"
	vcComposer    = "COMPOSER"
	vcComment     = "COMMENT"
	vcTrackNumber = "TRACKNUMBER"
	vcTrackTotal  = "TRACKTOTAL"
	vcDiscNumber  = "DISCNUMBER"
	vcDiscTotal   = "DISCTOTAL"
)

func readFLAC(path string) (*Tags, error) {
	f, err := flac.ParseFile(path)
	if err != nil {
		return nil, err
	}

	t := &Tags{}
	for _, b := range f.Meta {
		switch b.Type {
		case flac.VorbisComment:
			vc, err := flacvorbis.ParseFromMetaDataBlock(*b)
			if err != nil || vc == nil {
				continue
			}
			t.Title = vcFirst(vc, vcTitle)
			t.Artist = vcFirst(vc, vcArtist)
			t.Album = vcFirst(vc, vcAlbum)
			t.AlbumArtist = vcFirst(vc, vcAlbumArtist)
			t.Year = vcFirst(vc, vcDate)
			t.Composer = vcFirst(vc, vcComposer)
			t.Comment = vcFirst(vc, vcComment)
			// Track/Disc may be stored as separate *TOTAL fields OR packed
			// into the number field as "5/12" (the ID3 convention some taggers
			// carry into FLAC). Normalize to separate number + total so the
			// editor presents them the same way MP3 does.
			t.Track, t.TrackTotal = vcNumTotal(vc, vcTrackNumber, vcTrackTotal)
			t.Disc, t.DiscTotal = vcNumTotal(vc, vcDiscNumber, vcDiscTotal)
			if g, gErr := vc.Get(vcGenre); gErr == nil && len(g) > 0 {
				t.Genres = g
			}
		case flac.Picture:
			if pic, pErr := flacpicture.ParseFromMetaDataBlock(*b); pErr == nil && pic != nil {
				t.HasPicture = true
				t.PictureMIME = pic.MIME
			}
		}
	}
	return t, nil
}

func writeFLAC(origPath, tmpPath string, ch Changes) error {
	f, err := flac.ParseFile(origPath)
	if err != nil {
		return err
	}

	// Find the existing VORBIS_COMMENT block (if any).
	var vc *flacvorbis.MetaDataBlockVorbisComment
	vcIdx := -1
	for i, b := range f.Meta {
		if b.Type == flac.VorbisComment {
			parsed, pErr := flacvorbis.ParseFromMetaDataBlock(*b)
			if pErr != nil {
				return pErr
			}
			vc, vcIdx = parsed, i
			break
		}
	}

	// Whether the change set touches any vorbis-comment field. If not — and the
	// file has no existing block — we must NOT add an empty one (e.g. an
	// artwork-only change to a FLAC that carries no comments).
	hasVC := ch.Title != nil || ch.Artist != nil || ch.Album != nil ||
		ch.AlbumArtist != nil || ch.Year != nil || ch.Composer != nil ||
		ch.Comment != nil || ch.Track != nil || ch.TrackTotal != nil ||
		ch.Disc != nil || ch.DiscTotal != nil || ch.Genres != nil

	if vc != nil || hasVC {
		if vc == nil {
			vc = flacvorbis.New()
		}

		// Single-valued text fields.
		for _, fld := range []struct {
			key string
			p   *string
		}{
			{vcTitle, ch.Title},
			{vcArtist, ch.Artist},
			{vcAlbum, ch.Album},
			{vcAlbumArtist, ch.AlbumArtist},
			{vcDate, ch.Year},
			{vcComposer, ch.Composer},
			{vcComment, ch.Comment},
		} {
			if err := vcSet(vc, fld.key, fld.p); err != nil {
				return err
			}
		}

		// Track / Disc: apply only the changed half, preserving the other —
		// including a total that was packed into a combined "5/12" number
		// field — and always write back as separate fields.
		if err := vcApplyNumTotal(vc, vcTrackNumber, vcTrackTotal, ch.Track, ch.TrackTotal); err != nil {
			return err
		}
		if err := vcApplyNumTotal(vc, vcDiscNumber, vcDiscTotal, ch.Disc, ch.DiscTotal); err != nil {
			return err
		}

		// Genre is multi-valued in Vorbis: clear, then add one entry each.
		if ch.Genres != nil {
			vcClear(vc, vcGenre)
			for _, g := range *ch.Genres {
				if strings.TrimSpace(g) == "" {
					continue
				}
				if err := vc.Add(vcGenre, g); err != nil {
					return err
				}
			}
		}

		vcBlock := vc.Marshal()
		if vcIdx >= 0 {
			f.Meta[vcIdx] = &vcBlock
		} else {
			f.Meta = append(f.Meta, &vcBlock)
		}
	}

	switch ch.Picture {
	case PictureRemove:
		f.Meta = dropBlocks(f.Meta, flac.Picture)
	case PictureReplace:
		f.Meta = dropBlocks(f.Meta, flac.Picture)
		if ch.NewPicture != nil {
			pic, pErr := flacpicture.NewFromImageData(
				flacpicture.PictureTypeFrontCover, "", ch.NewPicture.Data, ch.NewPicture.MIME,
			)
			if pErr != nil {
				return pErr
			}
			pb := pic.Marshal()
			f.Meta = append(f.Meta, &pb)
		}
	case PictureKeep:
		// leave existing PICTURE block(s) untouched
	}

	return f.Save(tmpPath)
}

// ── Vorbis-comment helpers ───────────────────────────────────────────────

func vcFirst(vc *flacvorbis.MetaDataBlockVorbisComment, key string) string {
	vals, err := vc.Get(key)
	if err != nil || len(vals) == 0 {
		return ""
	}
	return vals[0]
}

// vcNumTotal returns the (number, total) for a track/disc pair, accepting
// either separate fields (e.g. TRACKNUMBER + TRACKTOTAL) or a combined "5/12"
// number field when no explicit *TOTAL field is present.
func vcNumTotal(vc *flacvorbis.MetaDataBlockVorbisComment, numKey, totKey string) (num, total string) {
	num = vcFirst(vc, numKey)
	total = vcFirst(vc, totKey)
	if total == "" {
		num, total = splitNumTotal(num)
	}
	return num, total
}

// vcApplyNumTotal applies a track/disc number+total change. Only the half the
// caller actually changed is overwritten; the other half is preserved (read
// via vcNumTotal, so a total packed into a combined "5/12" number field is kept
// even when only the number changes). The result is always written back as
// separate number + total fields. A no-op (both pointers nil) leaves the file
// untouched, so a combined value survives unrelated edits.
func vcApplyNumTotal(vc *flacvorbis.MetaDataBlockVorbisComment, numKey, totKey string, numP, totP *string) error {
	if numP == nil && totP == nil {
		return nil
	}
	num, total := vcNumTotal(vc, numKey, totKey)
	if numP != nil {
		num = *numP
	}
	if totP != nil {
		total = *totP
	}
	if err := vcSet(vc, numKey, &num); err != nil {
		return err
	}
	return vcSet(vc, totKey, &total)
}

// vcClear removes every entry for a key (Vorbis keys are case-insensitive, so
// match case-insensitively on the "KEY=" prefix).
func vcClear(vc *flacvorbis.MetaDataBlockVorbisComment, key string) {
	prefix := strings.ToUpper(key) + "="
	kept := make([]string, 0, len(vc.Comments))
	for _, c := range vc.Comments {
		if !strings.HasPrefix(strings.ToUpper(c), prefix) {
			kept = append(kept, c)
		}
	}
	vc.Comments = kept
}

func vcSet(vc *flacvorbis.MetaDataBlockVorbisComment, key string, p *string) error {
	if p == nil {
		return nil
	}
	vcClear(vc, key)
	if *p == "" {
		return nil
	}
	return vc.Add(key, *p)
}

func dropBlocks(meta []*flac.MetaDataBlock, typ flac.BlockType) []*flac.MetaDataBlock {
	out := make([]*flac.MetaDataBlock, 0, len(meta))
	for _, b := range meta {
		if b.Type != typ {
			out = append(out, b)
		}
	}
	return out
}
