package fbhttp

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/dhowden/tag"

	"github.com/csummers-dev/vitrine/v3/files"
	"github.com/csummers-dev/vitrine/v3/img"
)

// Server-side cover-art thumbnails for audio, EPUB, and PDF (row icons).
//
// These ride the SAME /api/preview/thumb endpoint, disk cache (S1-7), and
// imgSvc resize pipeline as image + video thumbnails. Each format yields a
// raw cover image which we resize to a 256² JPEG and cache (keyed by real
// path + mtime). Any failure — no embedded art, parse error, missing
// rasterizer — degrades to HTTP 501 so the row keeps its generic colored
// icon. Nothing here is ever a hard dependency:
//
//   - audio: embedded picture via dhowden/tag (pure Go; always available)
//   - epub:  cover image pulled out of the zip via the OPF (stdlib; always)
//   - pdf:   first page rendered by `pdftoppm` (poppler) — runtime-detected,
//            absent → generic icon, exactly like ffmpeg for video.
//
// Only the "thumb" size is produced; the "big" preview for these formats is
// the real viewer (AudioViewer / EpubViewer / PdfViewer), and the details
// pane extracts its own full-size cover client-side.

const (
	// Cap how much of an embedded/zip cover we read before resizing, so a
	// malformed file can't stream gigabytes into memory.
	maxCoverBytes = 16 * 1024 * 1024 // 16 MB

	pdfThumbTimeout     = 20 * time.Second
	pdfThumbConcurrency = 2
)

var errNoCover = errors.New("no embedded cover art")

var (
	pdftoppmOnce sync.Once
	pdftoppmBin  string

	pdfThumbSem = make(chan struct{}, pdfThumbConcurrency)
)

// pdftoppmPath resolves the poppler `pdftoppm` binary once and caches it.
// Returns "" when it isn't on PATH (→ PDF rows keep the generic icon).
func pdftoppmPath() string {
	pdftoppmOnce.Do(func() {
		if p, err := exec.LookPath("pdftoppm"); err == nil {
			pdftoppmBin = p
		}
	})
	return pdftoppmBin
}

// pdfThumbnailsEnabled reports whether the server can rasterize PDF covers
// (i.e. pdftoppm is available). Surfaced to the frontend so PDF rows request
// a thumb only when one can actually be served.
func pdfThumbnailsEnabled() bool {
	return pdftoppmPath() != ""
}

func mediaThumbCacheKey(f *files.FileInfo, kind string) string {
	return fmt.Sprintf("%s_thumb_%x%x", kind, f.RealPath(), f.ModTime.Unix())
}

// serveThumbJPEG writes a cached/freshly-built JPEG thumbnail.
func serveThumbJPEG(w http.ResponseWriter, r *http.Request, file *files.FileInfo, thumb []byte) {
	w.Header().Set("Cache-Control", "private")
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeContent(w, r, "thumb.jpg", file.ModTime, bytes.NewReader(thumb))
}

func storeThumbAsync(fileCache FileCache, key string, data []byte) {
	go func() {
		if err := fileCache.Store(context.Background(), key, data); err != nil {
			log.Printf("failed to cache thumbnail %s: %v", key, err)
		}
	}()
}

// resizeCoverThumb resizes raw cover bytes (any decodable image format) into
// a 256² JPEG, matching the image-thumbnail dimensions exactly.
func resizeCoverThumb(imgSvc ImgService, raw []byte) ([]byte, error) {
	buf := &bytes.Buffer{}
	opts := []img.Option{
		img.WithMode(img.ResizeModeFill),
		img.WithQuality(img.QualityLow),
		img.WithFormat(img.FormatJpeg),
	}
	if err := imgSvc.Resize(context.Background(), bytes.NewReader(raw), 256, 256, buf, opts...); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// genericCoverPreview is the shared flow for audio + epub: load-from-cache
// or (extract → resize → cache). `extract` returns the raw cover image.
func genericCoverPreview(
	w http.ResponseWriter,
	r *http.Request,
	imgSvc ImgService,
	fileCache FileCache,
	file *files.FileInfo,
	previewSize PreviewSize,
	enableThumbnails bool,
	kind string,
	extract func(*files.FileInfo) ([]byte, error),
) (int, error) {
	if previewSize != PreviewSizeThumb || !enableThumbnails {
		return http.StatusNotImplemented, nil
	}

	cacheKey := mediaThumbCacheKey(file, kind)
	thumb, ok, err := fileCache.Load(r.Context(), cacheKey)
	if err != nil {
		return errToStatus(err), err
	}
	if !ok {
		raw, exErr := extract(file)
		if exErr != nil {
			// No cover / parse failure — generic icon, never a 500.
			return http.StatusNotImplemented, nil
		}
		thumb, err = resizeCoverThumb(imgSvc, raw)
		if err != nil {
			log.Printf("%s thumbnail resize %q: %v", kind, file.Name, err)
			return http.StatusNotImplemented, nil
		}
		storeThumbAsync(fileCache, cacheKey, thumb)
	}

	serveThumbJPEG(w, r, file, thumb)
	return 0, nil
}

// ── Audio ───────────────────────────────────────────────────────────────

func handleAudioPreview(w http.ResponseWriter, r *http.Request, imgSvc ImgService,
	fileCache FileCache, file *files.FileInfo, previewSize PreviewSize, enableThumbnails bool) (int, error) {
	return genericCoverPreview(w, r, imgSvc, fileCache, file, previewSize, enableThumbnails, "audio", extractAudioCover)
}

// extractAudioCover pulls the embedded picture (APIC / FLAC PICTURE / MP4
// covr) out of an audio file. Reads through the afero Fs so it works on any
// mount.
//
// dhowden/tag is the primary path (it also covers FLAC, MP4, OGG). But it
// aborts the *entire* parse the moment it hits a single malformed frame —
// commonly a UTF-16 text frame with an odd byte count ("invalid encoding:
// expected even number of bytes") that real-world taggers emit — and returns
// before it ever reaches the picture. So when it yields nothing we fall back to
// a lenient ID3v2 scan that walks frames by their declared size (never parsing
// their text) and lifts the cover out by hand.
func extractAudioCover(file *files.FileInfo) ([]byte, error) {
	if data, err := extractAudioCoverViaTag(file); err == nil {
		return data, nil
	}
	return extractID3APIC(file)
}

func extractAudioCoverViaTag(file *files.FileInfo) ([]byte, error) {
	fd, err := file.Fs.Open(file.Path)
	if err != nil {
		return nil, err
	}
	defer fd.Close()

	m, err := tag.ReadFrom(fd)
	if err != nil {
		return nil, err
	}
	pic := m.Picture()
	if pic == nil || len(pic.Data) == 0 {
		return nil, errNoCover
	}
	// Guard against a pathological embedded picture (a lying/oversized APIC
	// frame) before handing it to the image decoder — mirrors the epub
	// cover's LimitReader cap.
	if len(pic.Data) > maxCoverBytes {
		return nil, errNoCover
	}
	return pic.Data, nil
}

// extractID3APIC is a lenient fallback that walks an ID3v2 tag frame-by-frame
// looking only for the embedded picture (APIC in v2.3/v2.4, PIC in v2.2). It
// skips every other frame by its declared size *without* decoding its content,
// so a malformed text frame that derails dhowden/tag can't derail us. The
// picture payload is located inside its frame by image magic bytes, which
// sidesteps the encoding-dependent MIME + description fields. Whole-tag
// unsynchronisation (rare) is not handled and simply yields no cover.
func extractID3APIC(file *files.FileInfo) ([]byte, error) {
	fd, err := file.Fs.Open(file.Path)
	if err != nil {
		return nil, err
	}
	defer fd.Close()

	var hdr [10]byte
	if _, err := io.ReadFull(fd, hdr[:]); err != nil || string(hdr[0:3]) != "ID3" {
		return nil, errNoCover
	}
	major := hdr[3]
	flags := hdr[5]
	if flags&0x80 != 0 { // whole-tag unsynchronisation — skip
		return nil, errNoCover
	}
	tagSize := synchsafe7(hdr[6:10])
	if tagSize <= 0 || tagSize > maxCoverBytes+(1<<20) {
		return nil, errNoCover
	}
	body := make([]byte, tagSize)
	n, _ := io.ReadFull(fd, body)
	body = body[:n]

	pos := 0
	// Skip an extended header if present (v2.3/v2.4 only; flags bit 6).
	if major >= 3 && flags&0x40 != 0 && pos+4 <= len(body) {
		if major == 4 {
			pos += synchsafe7(body[pos : pos+4]) // size includes its own 4 bytes
		} else {
			pos += int(binary.BigEndian.Uint32(body[pos:pos+4])) + 4
		}
	}

	for {
		if major == 2 { // v2.2: 3-byte id + 3-byte size, no flags
			if pos+6 > len(body) {
				break
			}
			id := string(body[pos : pos+3])
			size := int(body[pos+3])<<16 | int(body[pos+4])<<8 | int(body[pos+5])
			pos += 6
			if size <= 0 || pos+size > len(body) {
				break
			}
			if id == "PIC" {
				if img, ok := apicImage(body[pos : pos+size]); ok {
					return img, nil
				}
			}
			pos += size
			continue
		}
		// v2.3 / v2.4: 4-byte id + 4-byte size + 2 flag bytes
		if pos+10 > len(body) {
			break
		}
		id := string(body[pos : pos+4])
		var size int
		if major == 4 {
			size = synchsafe7(body[pos+4 : pos+8])
		} else {
			size = int(binary.BigEndian.Uint32(body[pos+4 : pos+8]))
		}
		pos += 10
		if size <= 0 || pos+size > len(body) { // padding / lying size — stop
			break
		}
		if id == "APIC" {
			if img, ok := apicImage(body[pos : pos+size]); ok {
				return img, nil
			}
		}
		pos += size
	}

	// Last resort: some encoders write wrong frame sizes (the classic v2.3
	// "synchsafe" bug), derailing the walk. Scan the whole tag for the first
	// image magic — almost certainly the cover.
	if img, ok := apicImage(body); ok {
		return img, nil
	}
	return nil, errNoCover
}

// apicImage returns the embedded image inside an APIC/PIC frame body, located
// by its magic bytes (JPEG / PNG / GIF), from the magic to the end of the
// frame. Image decoders stop at their own end-marker, so trailing frame bytes
// are harmless.
func apicImage(frame []byte) ([]byte, bool) {
	for i := 0; i+4 <= len(frame); i++ {
		switch {
		case frame[i] == 0xFF && frame[i+1] == 0xD8 && frame[i+2] == 0xFF, // JPEG
			frame[i] == 0x89 && frame[i+1] == 'P' && frame[i+2] == 'N' && frame[i+3] == 'G', // PNG
			frame[i] == 'G' && frame[i+1] == 'I' && frame[i+2] == 'F' && frame[i+3] == '8':  // GIF
			data := frame[i:]
			if len(data) == 0 || len(data) > maxCoverBytes {
				return nil, false
			}
			return data, true
		}
	}
	return nil, false
}

// synchsafe7 decodes a 4-byte synchsafe integer (7 significant bits per byte),
// as used by the ID3v2 tag header and v2.4 frame sizes.
func synchsafe7(b []byte) int {
	return int(b[0]&0x7f)<<21 | int(b[1]&0x7f)<<14 | int(b[2]&0x7f)<<7 | int(b[3]&0x7f)
}

// ── EPUB ────────────────────────────────────────────────────────────────

func handleEpubPreview(w http.ResponseWriter, r *http.Request, imgSvc ImgService,
	fileCache FileCache, file *files.FileInfo, previewSize PreviewSize, enableThumbnails bool) (int, error) {
	return genericCoverPreview(w, r, imgSvc, fileCache, file, previewSize, enableThumbnails, "epub", extractEpubCover)
}

type epubContainer struct {
	Rootfiles []struct {
		FullPath string `xml:"full-path,attr"`
	} `xml:"rootfiles>rootfile"`
}

type epubPackage struct {
	Metadata struct {
		Metas []struct {
			Name    string `xml:"name,attr"`
			Content string `xml:"content,attr"`
		} `xml:"meta"`
	} `xml:"metadata"`
	Manifest struct {
		Items []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		} `xml:"item"`
	} `xml:"manifest"`
}

// extractEpubCover opens the epub (a zip) from its real path, walks the OPF
// to find the cover image, and returns its bytes. osFs-only (uses RealPath +
// zip.OpenReader so it streams entries instead of slurping the whole book).
func extractEpubCover(file *files.FileInfo) ([]byte, error) {
	rc, err := zip.OpenReader(file.RealPath())
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	byName := make(map[string]*zip.File, len(rc.File))
	for _, f := range rc.File {
		byName[f.Name] = f
	}

	opfPath, err := epubOPFPath(byName)
	if err != nil {
		return nil, err
	}

	pkg, err := readEpubPackage(byName, opfPath)
	if err != nil {
		return nil, err
	}

	href := findEpubCoverHref(pkg)
	if href == "" {
		return nil, errNoCover
	}
	if dec, decErr := url.PathUnescape(href); decErr == nil {
		href = dec
	}

	// Cover href is relative to the OPF's directory.
	coverName := path.Join(path.Dir(opfPath), href)
	cf, ok := byName[coverName]
	if !ok {
		return nil, errNoCover
	}
	cr, err := cf.Open()
	if err != nil {
		return nil, err
	}
	defer cr.Close()
	return io.ReadAll(io.LimitReader(cr, maxCoverBytes))
}

func epubOPFPath(byName map[string]*zip.File) (string, error) {
	cf, ok := byName["META-INF/container.xml"]
	if !ok {
		return "", errNoCover
	}
	cr, err := cf.Open()
	if err != nil {
		return "", err
	}
	defer cr.Close()

	var c epubContainer
	if err := xml.NewDecoder(io.LimitReader(cr, 256*1024)).Decode(&c); err != nil {
		return "", err
	}
	if len(c.Rootfiles) == 0 || c.Rootfiles[0].FullPath == "" {
		return "", errNoCover
	}
	full := c.Rootfiles[0].FullPath
	if dec, decErr := url.PathUnescape(full); decErr == nil {
		full = dec
	}
	return full, nil
}

func readEpubPackage(byName map[string]*zip.File, opfPath string) (*epubPackage, error) {
	of, ok := byName[opfPath]
	if !ok {
		return nil, errNoCover
	}
	or, err := of.Open()
	if err != nil {
		return nil, err
	}
	defer or.Close()

	var pkg epubPackage
	if err := xml.NewDecoder(io.LimitReader(or, 2*1024*1024)).Decode(&pkg); err != nil {
		return nil, err
	}
	return &pkg, nil
}

// findEpubCoverHref resolves the cover image href across EPUB 2 + 3
// conventions, with a name-hint fallback.
func findEpubCoverHref(pkg *epubPackage) string {
	// EPUB 3: manifest item flagged properties="cover-image".
	for _, it := range pkg.Manifest.Items {
		if strings.Contains(it.Properties, "cover-image") {
			return it.Href
		}
	}
	// EPUB 2: <meta name="cover" content="manifest-item-id">.
	coverID := ""
	for _, m := range pkg.Metadata.Metas {
		if strings.EqualFold(m.Name, "cover") {
			coverID = m.Content
			break
		}
	}
	if coverID != "" {
		for _, it := range pkg.Manifest.Items {
			if it.ID == coverID {
				return it.Href
			}
		}
	}
	// Fallback: an image item whose id/href hints at "cover".
	for _, it := range pkg.Manifest.Items {
		if !strings.HasPrefix(it.MediaType, "image/") {
			continue
		}
		if strings.Contains(strings.ToLower(it.ID), "cover") ||
			strings.Contains(strings.ToLower(it.Href), "cover") {
			return it.Href
		}
	}
	return ""
}

// ── Comic (CBZ + CBR) ─────────────────────────────────────────────────────

// handleComicPreview serves a comic's cover — its first image, in natural-sort
// order — resized + cached like the other media covers. It reuses the comic
// reader's page cache (comicPages / comicPageBytes keyed by realPath + mtime),
// so the thumbnail and the in-app reader share the same extracted bytes. Any
// failure (no images, encrypted, oversize, decode error) returns 501 → the
// generic icon, never a 500. Routed for the comic extensions only
// (isComicPreviewExt): V2 #6 shipped `.cbr`; `.cbz` joined in v2.7 (the
// original exclusion was reversed on request).
func handleComicPreview(w http.ResponseWriter, r *http.Request, imgSvc ImgService,
	fileCache FileCache, file *files.FileInfo, previewSize PreviewSize, enableThumbnails bool, maxEntries int) (int, error) {
	if previewSize != PreviewSizeThumb || !enableThumbnails {
		return http.StatusNotImplemented, nil
	}

	cacheKey := mediaThumbCacheKey(file, "comic")
	thumb, ok, err := fileCache.Load(r.Context(), cacheKey)
	if err != nil {
		return errToStatus(err), err
	}
	if !ok {
		realPath := file.RealPath()
		names, _, pErr := comicPages(r.Context(), fileCache, realPath, file.ModTime, maxEntries)
		if pErr != nil || len(names) == 0 {
			return http.StatusNotImplemented, nil
		}
		raw, _, bErr := comicPageBytes(r.Context(), fileCache, realPath, file.ModTime, names[0], maxCoverBytes)
		if bErr != nil {
			return http.StatusNotImplemented, nil
		}
		thumb, err = resizeCoverThumb(imgSvc, raw)
		if err != nil {
			log.Printf("comic thumbnail resize %q: %v", file.Name, err)
			return http.StatusNotImplemented, nil
		}
		storeThumbAsync(fileCache, cacheKey, thumb)
	}

	serveThumbJPEG(w, r, file, thumb)
	return 0, nil
}

// ── PDF ─────────────────────────────────────────────────────────────────

func handlePdfPreview(w http.ResponseWriter, r *http.Request, imgSvc ImgService,
	fileCache FileCache, file *files.FileInfo, previewSize PreviewSize, enableThumbnails bool) (int, error) {
	if previewSize != PreviewSizeThumb || !enableThumbnails || !pdfThumbnailsEnabled() {
		return http.StatusNotImplemented, nil
	}

	cacheKey := mediaThumbCacheKey(file, "pdf")
	thumb, ok, err := fileCache.Load(r.Context(), cacheKey)
	if err != nil {
		return errToStatus(err), err
	}
	if !ok {
		raw, rErr := renderPdfFirstPage(file.RealPath(), file.Name)
		if rErr != nil {
			log.Printf("pdf thumbnail: %v", rErr)
			return http.StatusNotImplemented, nil
		}
		thumb, err = resizeCoverThumb(imgSvc, raw)
		if err != nil {
			log.Printf("pdf thumbnail resize %q: %v", file.Name, err)
			return http.StatusNotImplemented, nil
		}
		storeThumbAsync(fileCache, cacheKey, thumb)
	}

	serveThumbJPEG(w, r, file, thumb)
	return 0, nil
}

// renderPdfFirstPage rasterizes page 1 of a PDF to a PNG via pdftoppm.
// Concurrency-bounded + time-bounded, like the ffmpeg path.
func renderPdfFirstPage(inputPath, label string) ([]byte, error) {
	bin := pdftoppmPath()
	if bin == "" {
		return nil, errors.New("pdftoppm not available")
	}

	pdfThumbSem <- struct{}{}
	defer func() { <-pdfThumbSem }()

	ctx, cancel := context.WithTimeout(context.Background(), pdfThumbTimeout)
	defer cancel()

	// pdftoppm's "-" (stdout) output is unreliable across poppler builds: with
	// -singlefile it treats "-" as a filename ROOT and tries to write a literal
	// "-.png" into the working directory (which fails when the cwd isn't
	// writable — exactly what we saw in the wild). Render to a unique temp file
	// and read it back instead, which is portable and avoids the cwd entirely.
	tmpDir, err := os.MkdirTemp("", "pdfthumb")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)
	outRoot := path.Join(tmpDir, "page") // pdftoppm appends ".png"

	// -singlefile renders only the first page; -scale-to caps the long edge
	// at 512 px (plenty for a 256² thumb).
	cmd := exec.CommandContext(ctx, bin,
		"-png",
		"-singlefile",
		"-scale-to", "512",
		inputPath,
		outRoot,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdftoppm %q: %w (%s)", label, err, strings.TrimSpace(stderr.String()))
	}
	data, err := os.ReadFile(outRoot + ".png")
	if err != nil {
		return nil, fmt.Errorf("pdftoppm %q produced no image: %w", label, err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("pdftoppm %q produced no image", label)
	}
	return data, nil
}
