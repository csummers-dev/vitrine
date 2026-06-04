package audiotags

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/bogem/id3v2/v2"
	flacvorbis "github.com/go-flac/flacvorbis/v2"
	flac "github.com/go-flac/go-flac/v2"
)

func ptr(s string) *string { return &s }

// tinyPNG returns the bytes of a valid 2×2 PNG, used as test cover art.
func tinyPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

// copyFixture copies testdata/<name> into a fresh temp dir and returns the
// path, so each test mutates its own copy and never the committed fixture.
func copyFixture(t *testing.T, name string) string {
	t.Helper()
	src := filepath.Join("testdata", name)
	in, err := os.Open(src)
	if err != nil {
		t.Fatalf("open fixture %s: %v", src, err)
	}
	defer in.Close()
	dst := filepath.Join(t.TempDir(), name)
	out, err := os.Create(dst)
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	if _, err := io.Copy(out, in); err != nil {
		t.Fatalf("copy: %v", err)
	}
	if err := out.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	return dst
}

func eq(t *testing.T, field, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("%s = %q, want %q", field, got, want)
	}
}

func TestReadWriteRoundTrip(t *testing.T) {
	for _, fixture := range []string{"sample.mp3", "sample.flac"} {
		fixture := fixture
		t.Run(fixture, func(t *testing.T) {
			path := copyFixture(t, fixture)
			cover := tinyPNG(t)

			// ── Write a full set of tags + cover art ──────────────────────
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
				Genres:      &[]string{"Rock", "Indie"},
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
			if want := []string{"Rock", "Indie"}; !reflect.DeepEqual(got.Genres, want) {
				t.Errorf("Genres = %v, want %v", got.Genres, want)
			}
			if !got.HasPicture {
				t.Error("HasPicture = false, want true")
			}
			if got.PictureMIME != "image/png" {
				t.Errorf("PictureMIME = %q, want image/png", got.PictureMIME)
			}

			// ── Partial (batch-style) write: only Album changes ───────────
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
			if !got.HasPicture {
				t.Error("picture must be preserved through a partial write")
			}

			// ── Clear a field with an empty string ────────────────────────
			if err := Write(path, Changes{Comment: ptr("")}); err != nil {
				t.Fatalf("clear comment: %v", err)
			}
			got, _ = Read(path)
			eq(t, "Comment (cleared)", got.Comment, "")
			eq(t, "Album (still set)", got.Album, "New Album")

			// ── Remove cover art ──────────────────────────────────────────
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

func TestIsSupported(t *testing.T) {
	cases := map[string]bool{
		"song.mp3":  true,
		"song.FLAC": true,
		"song.m4a":  true,
		"song.ogg":  true,
		"song.OGA":  true,
		"song.opus": true,
		"song.wav":  false,
		"song.aiff": false,
		"folder":    false,
	}
	for name, want := range cases {
		if got := IsSupported(name); got != want {
			t.Errorf("IsSupported(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestUnsupportedFormat(t *testing.T) {
	if _, err := Read("nope.wav"); err != ErrUnsupportedFormat {
		t.Errorf("Read(.wav) err = %v, want ErrUnsupportedFormat", err)
	}
	if err := Write("nope.wav", Changes{}); err != ErrUnsupportedFormat {
		t.Errorf("Write(.wav) err = %v, want ErrUnsupportedFormat", err)
	}
}

// MP3: reading surfaces the user comment (empty description), and editing it
// must preserve technical COMM frames like iTunNORM (review item #4).
func TestMP3CommentPreservesTechnicalFrames(t *testing.T) {
	path := copyFixture(t, "sample.mp3")

	// Seed a technical COMM (iTunNORM) alongside a real user comment.
	tag, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	tag.AddCommentFrame(id3v2.CommentFrame{
		Encoding: tag.DefaultEncoding(), Language: "eng",
		Description: "iTunNORM", Text: "0000ABCD",
	})
	tag.AddCommentFrame(id3v2.CommentFrame{
		Encoding: tag.DefaultEncoding(), Language: "eng",
		Description: "", Text: "user note",
	})
	if err := tag.Save(); err != nil {
		t.Fatalf("save seed: %v", err)
	}
	_ = tag.Close()

	// Read surfaces the user comment, not the technical frame.
	got, err := Read(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	eq(t, "Comment", got.Comment, "user note")

	// Editing the comment preserves the technical frame.
	if err := Write(path, Changes{Comment: ptr("edited")}); err != nil {
		t.Fatalf("write: %v", err)
	}
	tag2, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer tag2.Close()
	var foundTech, foundUser bool
	for _, f := range tag2.GetFrames(frameComment) {
		cf, ok := f.(id3v2.CommentFrame)
		if !ok {
			continue
		}
		if cf.Description == "iTunNORM" && cf.Text == "0000ABCD" {
			foundTech = true
		}
		if cf.Description == "" && cf.Text == "edited" {
			foundUser = true
		}
	}
	if !foundTech {
		t.Error("technical COMM frame (iTunNORM) was not preserved")
	}
	if !foundUser {
		t.Error("edited user comment not found")
	}
}

// FLAC: a combined "5/12" TRACKNUMBER is split on read, and changing only the
// number preserves the total (migrated to a separate field) — review item #8.
func TestFLACCombinedTrackSplitAndPreserve(t *testing.T) {
	path := copyFixture(t, "sample.flac")

	// Seed a combined "5/12" TRACKNUMBER with no separate TRACKTOTAL.
	f, err := flac.ParseFile(path)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	vc := flacvorbis.New()
	if err := vc.Add(vcTrackNumber, "5/12"); err != nil {
		t.Fatalf("seed add: %v", err)
	}
	blk := vc.Marshal()
	replaced := false
	for i, b := range f.Meta {
		if b.Type == flac.VorbisComment {
			f.Meta[i] = &blk
			replaced = true
			break
		}
	}
	if !replaced {
		f.Meta = append(f.Meta, &blk)
	}
	if err := f.Save(path); err != nil {
		t.Fatalf("save seed: %v", err)
	}

	// Read splits the combined value.
	got, err := Read(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	eq(t, "Track", got.Track, "5")
	eq(t, "TrackTotal", got.TrackTotal, "12")

	// Change only the number; the total must survive.
	if err := Write(path, Changes{Track: ptr("6")}); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err = Read(path)
	if err != nil {
		t.Fatalf("reread: %v", err)
	}
	eq(t, "Track (changed)", got.Track, "6")
	eq(t, "TrackTotal (preserved)", got.TrackTotal, "12")
}
