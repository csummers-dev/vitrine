package fbhttp

import (
	"fmt"
	"log"
	"net/http"
	"path"
	"sort"
	"strings"
	"sync"

	"github.com/csummers-dev/vitrine/v4/files"
)

// Folder cover art (4.0 Phase 3.2).
//
// GET /api/preview/thumb/<folder> answers with the folder's cover: the first
// of poster / folder / cover / fanart (.jpg, .jpeg, .png, .webp, any case)
// inside it, else the embedded album art of one of its first audio tracks.
// No cover is a 404, so the tile keeps its folder icon.
//
// The lookup reads the folder's names (not a full listing with stats), and
// misses are remembered per user, folder and folder mtime, so a grid full of
// plain folders costs one directory read each until something changes.

var (
	folderCoverStems = []string{"poster", "folder", "cover", "fanart"}
	folderCoverExts  = []string{".jpg", ".jpeg", ".png", ".webp"}
	folderAudioExts  = map[string]bool{
		".mp3": true, ".flac": true, ".m4a": true, ".ogg": true, ".opus": true,
	}
)

// folderAudioTries is how many audio tracks are tried for embedded art.
const folderAudioTries = 3

// pickFolderCover chooses the cover image among a folder's entry names, and
// lists audio tracks (sorted) to fall back on. Both respect `allowed`.
func pickFolderCover(names []string, allowed func(string) bool) (cover string, audio []string) {
	byLower := make(map[string]string, len(names))
	for _, n := range names {
		l := strings.ToLower(n)
		if _, dup := byLower[l]; !dup {
			byLower[l] = n
		}
		if folderAudioExts[path.Ext(l)] && allowed(n) {
			audio = append(audio, n)
		}
	}
	for _, stem := range folderCoverStems {
		for _, ext := range folderCoverExts {
			if n, ok := byLower[stem+ext]; ok && allowed(n) {
				cover = n
				break
			}
		}
		if cover != "" {
			break
		}
	}
	sort.Slice(audio, func(i, j int) bool {
		return strings.ToLower(audio[i]) < strings.ToLower(audio[j])
	})
	if len(audio) > folderAudioTries {
		audio = audio[:folderAudioTries]
	}
	return cover, audio
}

// folderCoverMisses remembers folders without a cover. Keys include the
// folder's mtime, so adding a cover file (which changes it) is seen at once.
type coverMissCache struct {
	mu   sync.Mutex
	keys map[string]struct{}
}

const coverMissCap = 4096

func (c *coverMissCache) has(k string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, ok := c.keys[k]
	return ok
}

func (c *coverMissCache) add(k string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.keys == nil || len(c.keys) >= coverMissCap {
		c.keys = map[string]struct{}{}
	}
	c.keys[k] = struct{}{}
}

var folderCoverMisses coverMissCache

func handleFolderCover(
	w http.ResponseWriter,
	r *http.Request,
	imgSvc ImgService,
	fileCache FileCache,
	d *data,
	dir *files.FileInfo,
	previewSize PreviewSize,
	enableThumbnails bool,
) (int, error) {
	if previewSize != PreviewSizeThumb || !enableThumbnails {
		return http.StatusNotFound, nil
	}
	missKey := fmt.Sprintf("%d\x00%s\x00%d", d.user.ID, dir.RealPath(), dir.ModTime.UnixNano())
	if folderCoverMisses.has(missKey) {
		return http.StatusNotFound, nil
	}

	fd, err := dir.Fs.Open(dir.Path)
	if err != nil {
		return errToStatus(err), err
	}
	names, err := fd.Readdirnames(-1)
	fd.Close()
	if err != nil {
		return errToStatus(err), err
	}

	allowed := func(n string) bool { return d.Check(path.Join(dir.Path, n)) }
	cover, audio := pickFolderCover(names, allowed)

	stat := func(n string) *files.FileInfo {
		fi, err := files.NewFileInfo(&files.FileOptions{
			Fs:      dir.Fs,
			Path:    path.Join(dir.Path, n),
			Checker: d,
		})
		if err != nil || fi.IsDir {
			return nil
		}
		return fi
	}

	if cover != "" {
		if fi := stat(cover); fi != nil {
			key := previewCacheKey(fi, PreviewSizeThumb)
			thumb, ok, err := fileCache.Load(r.Context(), key)
			if err == nil && !ok {
				thumb, err = createPreview(imgSvc, fileCache, fi, PreviewSizeThumb)
			}
			if err == nil {
				serveThumbJPEG(w, r, fi, thumb)
				return 0, nil
			}
			log.Printf("folder cover %q: %v", path.Join(dir.Path, cover), err)
		}
	}

	for _, n := range audio {
		fi := stat(n)
		if fi == nil {
			continue
		}
		key := mediaThumbCacheKey(fi, "audio")
		thumb, ok, err := fileCache.Load(r.Context(), key)
		if err != nil {
			continue
		}
		if !ok {
			raw, err := extractAudioCover(fi)
			if err != nil {
				continue
			}
			if thumb, err = resizeCoverThumb(imgSvc, raw); err != nil {
				continue
			}
			storeThumbAsync(fileCache, key, thumb)
		}
		serveThumbJPEG(w, r, fi, thumb)
		return 0, nil
	}

	folderCoverMisses.add(missKey)
	return http.StatusNotFound, nil
}
