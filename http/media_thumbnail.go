package fbhttp

import (
	"archive/zip"
	"bytes"
	"context"
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

	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/filebrowser/filebrowser/v2/img"
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
// covr) out of an audio file via dhowden/tag. Reads through the afero Fs so
// it works on any mount.
func extractAudioCover(file *files.FileInfo) ([]byte, error) {
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
