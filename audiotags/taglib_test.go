package audiotags

import (
	"reflect"
	"testing"
)

// TagLib-backed formats. We commit a `.m4a` (MP4 atoms) and a `.opus` fixture;
// `.ogg`/`.oga` Vorbis share the identical readTagLib/writeTagLib path. A true
// Ogg Vorbis fixture isn't committed only because the build machine's ffmpeg
// has no Vorbis encoder — `.opus` exercises the same Ogg-container +
// Vorbis-comment + METADATA_BLOCK_PICTURE machinery TagLib uses for `.ogg`.
func TestTagLibReadWriteRoundTrip(t *testing.T) {
	for _, fixture := range []string{"sample.m4a", "sample.opus"} {
		fixture := fixture
		t.Run(fixture, func(t *testing.T) {
			path := copyFixture(t, fixture)
			cover := tinyPNG(t)

			full := Changes{
				Title:       ptr("My Title"),
				Artist:      ptr("My Artist"),
				Album:       ptr("My Album"),
				AlbumArtist: ptr("Various Artists"),
				Year:        ptr("2021"),
				Track:       ptr("3"),
				TrackTotal:  ptr("12"),
				Disc:        ptr("1"),
				DiscTotal:   ptr("2"),
				Genres:      &[]string{"Jazz"},
				Composer:    ptr("A. Composer"),
				Comment:     ptr("Nice tune"),
				Picture:     PictureReplace,
				NewPicture:  &Picture{MIME: "image/png", Data: cover},
			}
			if err := Write(path, full); err != nil {
				t.Fatalf("write full: %v", err)
			}

			got, err := Read(path)
			if err != nil {
				t.Fatalf("read after full: %v", err)
			}
			eq(t, "Title", got.Title, "My Title")
			eq(t, "Artist", got.Artist, "My Artist")
			eq(t, "Album", got.Album, "My Album")
			eq(t, "AlbumArtist", got.AlbumArtist, "Various Artists")
			eq(t, "Year", got.Year, "2021")
			eq(t, "Track", got.Track, "3")
			eq(t, "TrackTotal", got.TrackTotal, "12")
			eq(t, "Disc", got.Disc, "1")
			eq(t, "DiscTotal", got.DiscTotal, "2")
			eq(t, "Composer", got.Composer, "A. Composer")
			eq(t, "Comment", got.Comment, "Nice tune")
			if want := []string{"Jazz"}; !reflect.DeepEqual(got.Genres, want) {
				t.Errorf("Genres = %v, want %v", got.Genres, want)
			}
			if !got.HasPicture {
				t.Error("HasPicture = false, want true")
			}
			eq(t, "PictureMIME", got.PictureMIME, "image/png")

			// Partial (batch-style) write: only Album changes; everything else,
			// including the cover, must survive.
			if err := Write(path, Changes{Album: ptr("New Album")}); err != nil {
				t.Fatalf("partial write: %v", err)
			}
			got, err = Read(path)
			if err != nil {
				t.Fatalf("read after partial: %v", err)
			}
			eq(t, "Album (changed)", got.Album, "New Album")
			eq(t, "Artist (preserved)", got.Artist, "My Artist")
			eq(t, "Title (preserved)", got.Title, "My Title")
			eq(t, "Track (preserved)", got.Track, "3")
			if !got.HasPicture {
				t.Error("picture must be preserved through a partial write")
			}

			// Clear a field with an empty string.
			if err := Write(path, Changes{Comment: ptr("")}); err != nil {
				t.Fatalf("clear comment: %v", err)
			}
			got, _ = Read(path)
			eq(t, "Comment (cleared)", got.Comment, "")
			eq(t, "Album (still set)", got.Album, "New Album")

			// Remove cover art.
			if err := Write(path, Changes{Picture: PictureRemove}); err != nil {
				t.Fatalf("remove picture: %v", err)
			}
			got, _ = Read(path)
			if got.HasPicture {
				t.Error("HasPicture = true after remove, want false")
			}
			eq(t, "Album (after pic remove)", got.Album, "New Album")
		})
	}
}

// Ogg/Vorbis comments are multi-valued, so several genres round-trip.
func TestTagLibMultiGenre(t *testing.T) {
	path := copyFixture(t, "sample.opus")
	if err := Write(path, Changes{Genres: &[]string{"Rock", "Indie"}}); err != nil {
		t.Fatalf("write genres: %v", err)
	}
	got, err := Read(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if want := []string{"Rock", "Indie"}; !reflect.DeepEqual(got.Genres, want) {
		t.Errorf("Genres = %v, want %v", got.Genres, want)
	}
}
