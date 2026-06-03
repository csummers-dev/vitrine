package audiotags

import (
	"strings"

	"github.com/bogem/id3v2/v2"
)

// Frame IDs that are identical across ID3v2.3 and v2.4. Title/Artist/Album/
// Year/Genre go through tag.CommonID(...) instead, since their frame ID
// differs by version (e.g. Year is TYER in 2.3, TDRC in 2.4).
const (
	frameAlbumArtist = "TPE2"
	frameComposer    = "TCOM"
	frameTrack       = "TRCK"
	frameDisc        = "TPOS"
	frameComment     = "COMM"
	framePicture     = "APIC"
)

func readMP3(path string) (*Tags, error) {
	tag, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		return nil, err
	}
	defer tag.Close()

	t := &Tags{
		Title:       tag.Title(),
		Artist:      tag.Artist(),
		Album:       tag.Album(),
		AlbumArtist: tag.GetTextFrame(frameAlbumArtist).Text,
		Year:        tag.Year(),
		Composer:    tag.GetTextFrame(frameComposer).Text,
	}
	t.Track, t.TrackTotal = splitNumTotal(tag.GetTextFrame(frameTrack).Text)
	t.Disc, t.DiscTotal = splitNumTotal(tag.GetTextFrame(frameDisc).Text)
	t.Genres = splitGenres(tag.Genre())

	// Surface the user comment — the COMM frame with an empty description.
	// Files from iTunes / streaming carry technical COMM frames (iTunNORM,
	// iTunSMPB) that have non-empty descriptions; those are not user comments
	// and must not be shown (or clobbered on write).
	for _, f := range tag.GetFrames(frameComment) {
		if cf, ok := f.(id3v2.CommentFrame); ok && cf.Description == "" {
			t.Comment = cf.Text
			break
		}
	}
	if pf, ok := tag.GetLastFrame(framePicture).(id3v2.PictureFrame); ok {
		t.HasPicture = true
		t.PictureMIME = pf.MimeType
	}
	return t, nil
}

func writeMP3(origPath, tmpPath string, ch Changes) error {
	// id3v2 can only Save() back to the file it opened, so we edit a COPY and
	// let the caller's atomicReplace rename it over the original.
	if err := copyFile(origPath, tmpPath); err != nil {
		return err
	}
	tag, err := id3v2.Open(tmpPath, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	enc := tag.DefaultEncoding()

	// Text frames replace cleanly: AddTextFrame overwrites the single frame
	// for that ID (non-sequence frames are stored 1-per-ID). Empty clears it.
	setText := func(id string, p *string) {
		if p == nil {
			return
		}
		if *p == "" {
			tag.DeleteFrames(id)
			return
		}
		tag.AddTextFrame(id, enc, *p)
	}
	setText(tag.CommonID("Title"), ch.Title)
	setText(tag.CommonID("Artist"), ch.Artist)
	setText(tag.CommonID("Album/Movie/Show title"), ch.Album)
	setText(tag.CommonID("Year"), ch.Year)
	setText(frameAlbumArtist, ch.AlbumArtist)
	setText(frameComposer, ch.Composer)

	// Track / Disc carry number + total in one "n/total" frame; apply whichever
	// of the two the caller changed on top of the current value.
	applyNumTotal := func(id string, numP, totP *string) {
		if numP == nil && totP == nil {
			return
		}
		num, tot := splitNumTotal(tag.GetTextFrame(id).Text)
		if numP != nil {
			num = *numP
		}
		if totP != nil {
			tot = *totP
		}
		if v := combineNumTotal(num, tot); v == "" {
			tag.DeleteFrames(id)
		} else {
			tag.AddTextFrame(id, enc, v)
		}
	}
	applyNumTotal(frameTrack, ch.Track, ch.TrackTotal)
	applyNumTotal(frameDisc, ch.Disc, ch.DiscTotal)

	// Genre (TCON). Multiple genres are joined with "; " — split back out on
	// read. Replaces cleanly (single text frame).
	if ch.Genres != nil {
		gid := tag.CommonID("Content type")
		if joined := strings.Join(*ch.Genres, "; "); strings.TrimSpace(joined) == "" {
			tag.DeleteFrames(gid)
		} else {
			tag.AddTextFrame(gid, enc, joined)
		}
	}

	// Comment is a sequence frame. Replace ONLY the user comment (empty
	// description), preserving technical COMM frames (iTunNORM/iTunSMPB, which
	// carry a non-empty description). id3v2 can only delete all frames of an
	// ID at once, so we re-add the ones we want to keep.
	if ch.Comment != nil {
		var keep []id3v2.CommentFrame
		lang := "eng"
		for _, f := range tag.GetFrames(frameComment) {
			cf, ok := f.(id3v2.CommentFrame)
			if !ok {
				continue
			}
			if cf.Description == "" {
				if cf.Language != "" {
					lang = cf.Language // preserve the user comment's language
				}
				continue // drop the old user comment; replaced below
			}
			keep = append(keep, cf) // technical frame — preserve verbatim
		}
		tag.DeleteFrames(frameComment)
		for _, cf := range keep {
			tag.AddCommentFrame(cf)
		}
		if *ch.Comment != "" {
			tag.AddCommentFrame(id3v2.CommentFrame{
				Encoding:    enc,
				Language:    lang,
				Description: "",
				Text:        *ch.Comment,
			})
		}
	}

	// Cover art (APIC) is also a sequence frame.
	switch ch.Picture {
	case PictureRemove:
		tag.DeleteFrames(framePicture)
	case PictureReplace:
		tag.DeleteFrames(framePicture)
		if ch.NewPicture != nil {
			tag.AddAttachedPicture(id3v2.PictureFrame{
				Encoding:    enc,
				MimeType:    ch.NewPicture.MIME,
				PictureType: id3v2.PTFrontCover,
				Description: "",
				Picture:     ch.NewPicture.Data,
			})
		}
	case PictureKeep:
		// leave the existing APIC frame(s) untouched
	}

	if err := tag.Save(); err != nil {
		_ = tag.Close()
		return err
	}
	return tag.Close()
}
