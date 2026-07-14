package fbhttp

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/csummers-dev/vitrine/v3/audiotags"
	fberrors "github.com/csummers-dev/vitrine/v3/errors"
	"github.com/csummers-dev/vitrine/v3/files"
)

// Caps for the write endpoint's multipart body.
const (
	// In-memory portion of the multipart parse; the rest spills to temp files.
	audioTagsMaxMem = 1 << 20 // 1 MB
	// Hard cap on an uploaded cover image.
	audioTagsMaxArtwork = 16 << 20 // 16 MB
	// Cap on how many files one request may touch.
	audioTagsMaxPaths = 1000
)

// errNotLocalFile is returned (per file) when a path can't be resolved to a
// real on-disk file — audio tag editing needs the actual bytes, so non-osFs
// mounts are unsupported (same constraint as archive extraction).
var errNotLocalFile = errors.New("audio tags: file is not on a local filesystem")

// safeTagError maps a (possibly library/OS) error to a client-safe message.
// Raw os/id3v2/flac errors embed absolute filesystem paths, so we surface a
// known reason for the errors we recognize and a generic `fallback` for the
// rest — never the raw string.
func safeTagError(err error, fallback string) string {
	switch {
	case errors.Is(err, fberrors.ErrPermissionDenied):
		return "you don't have permission to edit this file"
	case errors.Is(err, audiotags.ErrUnsupportedFormat):
		return "unsupported audio format"
	case errors.Is(err, errNotLocalFile):
		return "this file isn't on a local filesystem"
	case errors.Is(err, os.ErrNotExist):
		return "file not found"
	case errors.Is(err, os.ErrPermission):
		return "permission denied"
	case errors.Is(err, io.ErrUnexpectedEOF):
		return "this file appears to be incomplete or corrupt"
	default:
		return fallback
	}
}

// resolveAudioPath validates a user path for tag editing and returns its real
// OS path. Failures are returned as plain errors so the batch handlers can
// record them per file instead of failing the whole request.
func resolveAudioPath(d *data, path string) (string, error) {
	if !d.Check(path) {
		return "", fberrors.ErrPermissionDenied
	}
	if !audiotags.IsSupported(path) {
		return "", audiotags.ErrUnsupportedFormat
	}
	file, err := files.NewFileInfo(&files.FileOptions{
		Fs:      d.user.Fs,
		Path:    path,
		Modify:  d.user.Perm.Modify,
		Expand:  false,
		Checker: d,
	})
	if err != nil {
		return "", err
	}
	if file.IsDir {
		return "", audiotags.ErrUnsupportedFormat
	}
	rp := file.RealPath()
	if rp == "" {
		return "", errNotLocalFile
	}
	return rp, nil
}

// ── Read: POST /api/audio-tags/read ──────────────────────────────────────

type audioTagsReadRequest struct {
	Paths []string `json:"paths"`
}

type audioTagsReadResult struct {
	Path  string          `json:"path"`
	Tags  *audiotags.Tags `json:"tags,omitempty"`
	Error string          `json:"error,omitempty"`
}

// audioTagsReadHandler returns the current tags for one or more audio files.
// It's a POST (not GET) because the file paths travel in the body so a
// multi-file selection can be read in a single request.
func audioTagsReadHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		var req audioTagsReadRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		if len(req.Paths) == 0 || len(req.Paths) > audioTagsMaxPaths {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}

		results := make([]audioTagsReadResult, 0, len(req.Paths))
		for _, p := range req.Paths {
			res := audioTagsReadResult{Path: p}
			rp, err := resolveAudioPath(d, p)
			if err != nil {
				res.Error = safeTagError(err, "couldn't read this file's tags")
				results = append(results, res)
				continue
			}
			tags, err := audiotags.Read(rp)
			if err != nil {
				res.Error = safeTagError(err, "couldn't read this file's tags")
			} else {
				res.Tags = tags
			}
			results = append(results, res)
		}

		return renderJSON(w, r, map[string]any{"results": results})
	})
}

// ── Write: PATCH /api/audio-tags ─────────────────────────────────────────

// audioTagsWritePayload is the JSON `payload` field of the multipart write
// request. A non-nil pointer in Set means "change this field" (empty string
// clears it); nil / absent means "leave it untouched" — which is what makes
// batch edits correct (only the fields the user changed are applied to all
// selected files). The cover image, when replacing, is the multipart
// `artwork` file part.
type audioTagsWritePayload struct {
	Paths []string `json:"paths"`
	Set   struct {
		Title       *string   `json:"title"`
		Artist      *string   `json:"artist"`
		Album       *string   `json:"album"`
		AlbumArtist *string   `json:"albumArtist"`
		Year        *string   `json:"year"`
		Track       *string   `json:"track"`
		TrackTotal  *string   `json:"trackTotal"`
		Disc        *string   `json:"disc"`
		DiscTotal   *string   `json:"discTotal"`
		Genres      *[]string `json:"genres"`
		Composer    *string   `json:"composer"`
		Comment     *string   `json:"comment"`
	} `json:"set"`
	// Artwork action: "keep" (default) | "replace" | "remove".
	Artwork string `json:"artwork"`
}

type audioTagsWriteResult struct {
	Path  string `json:"path"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// audioTagsWriteHandler applies tag changes to one or more audio files. Gated
// on perm.Modify (editing files). Body is multipart/form-data: a `payload`
// JSON field plus an optional `artwork` image file part (used when
// payload.artwork == "replace"). Results are reported per file so a single
// bad file doesn't fail the batch.
func audioTagsWriteHandler() handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if !d.user.Perm.Modify {
			return http.StatusForbidden, fberrors.ErrPermissionDenied
		}

		// Bound the whole multipart body so an oversized `artwork` part can't be
		// streamed to a temp file on disk before readArtwork's cap rejects it.
		// Allow the artwork cap plus headroom for the JSON payload + framing.
		r.Body = http.MaxBytesReader(w, r.Body, audioTagsMaxArtwork+audioTagsMaxMem)

		if err := r.ParseMultipartForm(audioTagsMaxMem); err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		// Parts larger than audioTagsMaxMem spill to temp files on disk, and
		// net/http does NOT remove them automatically — clean them up when the
		// handler returns so a >1MB cover upload doesn't leak a temp file.
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()

		var pl audioTagsWritePayload
		if err := json.Unmarshal([]byte(r.FormValue("payload")), &pl); err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		if len(pl.Paths) == 0 || len(pl.Paths) > audioTagsMaxPaths {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}

		// Build the change set shared across every file.
		ch := audiotags.Changes{
			Title:       pl.Set.Title,
			Artist:      pl.Set.Artist,
			Album:       pl.Set.Album,
			AlbumArtist: pl.Set.AlbumArtist,
			Year:        pl.Set.Year,
			Track:       pl.Set.Track,
			TrackTotal:  pl.Set.TrackTotal,
			Disc:        pl.Set.Disc,
			DiscTotal:   pl.Set.DiscTotal,
			Genres:      pl.Set.Genres,
			Composer:    pl.Set.Composer,
			Comment:     pl.Set.Comment,
		}

		switch pl.Artwork {
		case "remove":
			ch.Picture = audiotags.PictureRemove
		case "replace":
			pic, status, err := readArtwork(r)
			if err != nil {
				return status, err
			}
			ch.Picture = audiotags.PictureReplace
			ch.NewPicture = pic
		default:
			ch.Picture = audiotags.PictureKeep
		}

		results := make([]audioTagsWriteResult, 0, len(pl.Paths))
		for _, p := range pl.Paths {
			res := audioTagsWriteResult{Path: p}
			rp, err := resolveAudioPath(d, p)
			if err != nil {
				res.Error = safeTagError(err, "couldn't save tags for this file")
				results = append(results, res)
				continue
			}
			if err := audiotags.Write(rp, ch); err != nil {
				res.Error = safeTagError(err, "couldn't save tags for this file")
			} else {
				res.OK = true
			}
			results = append(results, res)
		}

		return renderJSON(w, r, map[string]any{"results": results})
	})
}

// readArtwork pulls the uploaded cover image out of the multipart `artwork`
// part, size-capped, and resolves its MIME type.
func readArtwork(r *http.Request) (*audiotags.Picture, int, error) {
	f, header, err := r.FormFile("artwork")
	if err != nil {
		return nil, http.StatusBadRequest, fberrors.ErrInvalidRequestParams
	}
	defer f.Close()

	// Read with a 1-byte overrun so we can detect "too large".
	data, err := io.ReadAll(io.LimitReader(f, audioTagsMaxArtwork+1))
	if err != nil {
		return nil, http.StatusBadRequest, fberrors.ErrInvalidRequestParams
	}
	if len(data) > audioTagsMaxArtwork {
		return nil, http.StatusRequestEntityTooLarge, fberrors.ErrInvalidRequestParams
	}
	if len(data) == 0 {
		return nil, http.StatusBadRequest, fberrors.ErrInvalidRequestParams
	}

	mime := ""
	if header != nil {
		mime = header.Header.Get("Content-Type")
	}
	if mime == "" || mime == "application/octet-stream" {
		mime = http.DetectContentType(data)
	}
	// The API is the trust boundary — only embed actual images as cover art,
	// regardless of what the client claims.
	if !strings.HasPrefix(mime, "image/") {
		return nil, http.StatusUnsupportedMediaType, fberrors.ErrInvalidRequestParams
	}

	return &audiotags.Picture{MIME: mime, Data: data}, http.StatusOK, nil
}
