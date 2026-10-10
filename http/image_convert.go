package fbhttp

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/csummers-dev/vitrine/v4/files"
	"github.com/csummers-dev/vitrine/v4/img"
)

// HEIC / HEIF / AVIF previews (4.0 Phase 3.1).
//
// Go has no decoders for these, and most browsers can't show HEIC at all, so
// both the thumbnail and the "big" preview are converted to JPEG by an
// external tool and cached like any other preview:
//
//   - ffmpeg (bundled in the Docker image; 7.1+ reads HEIF tile grids and
//     AVIF through libdav1d), else
//   - heif-convert from libheif, for HEIC/HEIF (and AVIF when libheif was
//     built with an AV1 decoder).
//
// With neither available the row keeps its generic image icon (501), the
// same degradation as video thumbnails without ffmpeg.

const (
	convertTimeout     = 30 * time.Second
	convertConcurrency = 2
	convertBigSize     = 1080
)

var (
	heifConvertOnce sync.Once
	heifConvertBin  string

	convertSem = make(chan struct{}, convertConcurrency)
)

func heifConvertPath() string {
	heifConvertOnce.Do(func() {
		if p, err := exec.LookPath("heif-convert"); err == nil {
			heifConvertBin = p
		}
	})
	return heifConvertBin
}

// isConvertedImageExt reports whether an image extension needs an external
// converter for previews.
func isConvertedImageExt(ext string) bool {
	return convertedImageExts[strings.ToLower(ext)]
}

var convertedImageExts = map[string]bool{".heic": true, ".heif": true, ".avif": true}

func convertedPreviewCacheKey(f *files.FileInfo, size PreviewSize) string {
	return fmt.Sprintf("conv_%s_%x%x", size, f.RealPath(), f.ModTime.Unix())
}

func handleConvertedImagePreview(
	w http.ResponseWriter,
	r *http.Request,
	imgSvc ImgService,
	fileCache FileCache,
	file *files.FileInfo,
	previewSize PreviewSize,
	enableThumbnails bool,
) (int, error) {
	if previewSize == PreviewSizeThumb && !enableThumbnails {
		return http.StatusNotImplemented, nil
	}
	if ffmpegPath() == "" && heifConvertPath() == "" {
		return http.StatusNotImplemented, nil
	}

	key := convertedPreviewCacheKey(file, previewSize)
	out, ok, err := fileCache.Load(r.Context(), key)
	if err != nil {
		return errToStatus(err), err
	}
	if !ok {
		convertSem <- struct{}{}
		thumb := previewSize == PreviewSizeThumb
		out, err = convertImageToJPEG(file.RealPath(), file.Name, thumb, func(full []byte) ([]byte, error) {
			return resizeConverted(imgSvc, full, thumb)
		})
		<-convertSem
		if err != nil {
			log.Printf("image preview: %v", err)
			return http.StatusNotImplemented, nil
		}
		storeThumbAsync(fileCache, key, out)
	}

	serveThumbJPEG(w, r, file, out)
	return 0, nil
}

// resizeConverted scales a full-size JPEG (from heif-convert) the way
// ffmpeg would have: 256² fill for a thumbnail, else fit within
// convertBigSize.
func resizeConverted(imgSvc ImgService, full []byte, thumb bool) ([]byte, error) {
	if thumb {
		return resizeCoverThumb(imgSvc, full)
	}
	buf := &bytes.Buffer{}
	err := imgSvc.Resize(context.Background(), bytes.NewReader(full), convertBigSize, convertBigSize, buf,
		img.WithMode(img.ResizeModeFit), img.WithQuality(img.QualityMedium), img.WithFormat(img.FormatJpeg))
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// convertImageToJPEG converts inputPath to a JPEG: a 256² fill for a
// thumbnail, else fitted within convertBigSize. ffmpeg is tried first, then
// heif-convert (whose full-size output goes through `resize`).
func convertImageToJPEG(inputPath, label string, thumb bool, resize func([]byte) ([]byte, error)) ([]byte, error) {
	var errs []error
	if bin := ffmpegPath(); bin != "" {
		out, err := ffmpegConvertImage(bin, inputPath, thumb)
		if err == nil {
			return out, nil
		}
		errs = append(errs, err)
	}
	if bin := heifConvertPath(); bin != "" {
		full, err := heifConvertImage(bin, inputPath)
		if err == nil {
			out, rerr := resize(full)
			if rerr == nil {
				return out, nil
			}
			err = rerr
		}
		errs = append(errs, err)
	}
	if len(errs) == 0 {
		return nil, fmt.Errorf("%q: no image converter available", label)
	}
	return nil, fmt.Errorf("%q: %w", label, errors.Join(errs...))
}

// ffmpegScaleFilter is the -vf chain for a preview of the given kind.
func ffmpegScaleFilter(thumb bool) string {
	if thumb {
		return "scale=256:256:force_original_aspect_ratio=increase,crop=256:256"
	}
	// Fit within the box, never upscale.
	return fmt.Sprintf("scale='min(%[1]d,iw)':'min(%[1]d,ih)':force_original_aspect_ratio=decrease", convertBigSize)
}

func ffmpegConvertImage(bin, inputPath string, thumb bool) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), convertTimeout)
	defer cancel()
	q := "3"
	if thumb {
		q = "4"
	}
	cmd := exec.CommandContext(ctx, bin,
		"-loglevel", "error",
		"-i", inputPath,
		"-vf", ffmpegScaleFilter(thumb),
		"-frames:v", "1",
		"-f", "mjpeg",
		"-q:v", q,
		"pipe:1",
	)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg: %w (%s)", err, strings.TrimSpace(stderr.String()))
	}
	if out.Len() == 0 {
		return nil, errors.New("ffmpeg produced no image")
	}
	return out.Bytes(), nil
}

// heifConvertImage decodes with libheif to a full-size JPEG (via a temp dir,
// since heif-convert only writes files).
func heifConvertImage(bin, inputPath string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), convertTimeout)
	defer cancel()
	dir, err := os.MkdirTemp("", "vitrine-heif-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	outPath := filepath.Join(dir, "out.jpg")
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, bin, "-q", "90", inputPath, outPath)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("heif-convert: %w (%s)", err, strings.TrimSpace(stderr.String()))
	}
	return os.ReadFile(outPath)
}
