package files

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"hash"
	"image"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/spf13/afero"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/rules"
)

var (
	reSubDirs = regexp.MustCompile("(?i)^sub(s|titles)$")
	reSubExts = regexp.MustCompile("(?i)(.vtt|.srt|.ass|.ssa)$")
)

// FileInfo describes a file.
type FileInfo struct {
	*Listing
	Fs         afero.Fs          `json:"-"`
	Path       string            `json:"path"`
	Name       string            `json:"name"`
	Size       int64             `json:"size"`
	Extension  string            `json:"extension"`
	ModTime    time.Time         `json:"modified"`
	Mode       os.FileMode       `json:"mode"`
	IsDir      bool              `json:"isDir"`
	IsSymlink  bool              `json:"isSymlink"`
	Type       string            `json:"type"`
	Subtitles  []string          `json:"subtitles,omitempty"`
	Content    string            `json:"content,omitempty"`
	Checksums  map[string]string `json:"checksums,omitempty"`
	Token      string            `json:"token,omitempty"`
	currentDir []os.FileInfo     `json:"-"`
	Resolution *ImageResolution  `json:"resolution,omitempty"`
}

// FileOptions are the options when getting a file info.
type FileOptions struct {
	Fs         afero.Fs
	Path       string
	Modify     bool
	Expand     bool
	ReadHeader bool
	CalcImgRes bool
	Token      string
	Checker    rules.Checker
	Content    bool
}

type ImageResolution struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// NewFileInfo creates a File object from a path and a given user. This File
// object will be automatically filled depending on if it is a directory
// or a file. If it's a video file, it will also detect any subtitles.
func NewFileInfo(opts *FileOptions) (*FileInfo, error) {
	if !opts.Checker.Check(opts.Path) {
		return nil, os.ErrPermission
	}

	file, err := stat(opts)
	if err != nil {
		return nil, err
	}

	// Do not expose the name of root directory.
	if file.Path == "/" {
		file.Name = ""
	}

	if opts.Expand {
		if file.IsDir {
			if err := file.readListing(opts.Checker, opts.ReadHeader, opts.CalcImgRes); err != nil {
				return nil, err
			}
			return file, nil
		}

		err = file.detectType(opts.Modify, opts.Content, true, opts.CalcImgRes)
		if err != nil {
			return nil, err
		}
	}

	return file, err
}

func stat(opts *FileOptions) (*FileInfo, error) {
	var file *FileInfo

	if lstaterFs, ok := opts.Fs.(afero.Lstater); ok {
		info, _, err := lstaterFs.LstatIfPossible(opts.Path)
		if err != nil {
			return nil, err
		}
		file = &FileInfo{
			Fs:        opts.Fs,
			Path:      opts.Path,
			Name:      info.Name(),
			ModTime:   info.ModTime(),
			Mode:      info.Mode(),
			IsDir:     info.IsDir(),
			IsSymlink: IsSymlink(info.Mode()),
			Size:      info.Size(),
			Extension: filepath.Ext(info.Name()),
			Token:     opts.Token,
		}
	}

	// regular file
	if file != nil && !file.IsSymlink {
		return file, nil
	}

	// fs doesn't support afero.Lstater interface or the file is a symlink
	info, err := opts.Fs.Stat(opts.Path)
	if err != nil {
		// can't follow symlink
		if file != nil && file.IsSymlink {
			return file, nil
		}
		return nil, err
	}

	// set correct file size in case of symlink
	if file != nil && file.IsSymlink {
		file.Size = info.Size()
		file.IsDir = info.IsDir()
		return file, nil
	}

	file = &FileInfo{
		Fs:        opts.Fs,
		Path:      opts.Path,
		Name:      info.Name(),
		ModTime:   info.ModTime(),
		Mode:      info.Mode(),
		IsDir:     info.IsDir(),
		Size:      info.Size(),
		Extension: filepath.Ext(info.Name()),
		Token:     opts.Token,
	}

	return file, nil
}

// Checksum checksums a given File for a given User, using a specific
// algorithm. The checksums data is saved on File object.
func (i *FileInfo) Checksum(algo string) error {
	if i.IsDir {
		return fberrors.ErrIsDirectory
	}

	if i.Checksums == nil {
		i.Checksums = map[string]string{}
	}

	reader, err := i.Fs.Open(i.Path)
	if err != nil {
		return err
	}
	defer reader.Close()

	var h hash.Hash

	switch algo {
	case "md5":
		h = md5.New()
	case "sha1":
		h = sha1.New()
	case "sha256":
		h = sha256.New()
	case "sha512":
		h = sha512.New()
	default:
		return fberrors.ErrInvalidOption
	}

	_, err = io.Copy(h, reader)
	if err != nil {
		return err
	}

	i.Checksums[algo] = hex.EncodeToString(h.Sum(nil))
	return nil
}

func (i *FileInfo) RealPath() string {
	if realPathFs, ok := i.Fs.(interface {
		RealPath(name string) (fPath string, err error)
	}); ok {
		realPath, err := realPathFs.RealPath(i.Path)
		if err == nil {
			return realPath
		}
	}

	return i.Path
}

func (i *FileInfo) detectType(modify, saveContent, readHeader bool, calcImgRes bool) error {
	if IsNamedPipe(i.Mode) {
		i.Type = "blob"
		return nil
	}
	// failing to detect the type should not return error.
	// imagine the situation where a file in a dir with thousands
	// of files couldn't be opened: we'd have immediately
	// a 500 even though it doesn't matter. So we just log it.

	extMime := mime.TypeByExtension(i.Extension)
	mimetype := extMime

	// The header buffer is read LAZILY — only when a classification branch
	// actually needs it. For files whose extension already yields a definitive
	// type (image / video / audio / pdf / text-*), we never open the file at
	// all. That's the difference between a fast listing and one that opens
	// every single file in the directory just to sniff its type — painfully
	// slow on network/NAS mounts, where each open is a round-trip. Behavior is
	// unchanged: the buffer is still only consulted in the exact same spots,
	// and still only when `readHeader` is set.
	var buffer []byte
	var bufferRead bool
	header := func() []byte {
		if !bufferRead && readHeader {
			buffer = i.readFirstBytes()
			bufferRead = true
		}
		return buffer
	}

	if readHeader && mimetype == "" {
		mimetype = http.DetectContentType(header())
	}

	switch {
	case strings.HasPrefix(mimetype, "video"):
		i.Type = "video"
		i.detectSubtitles()
		return nil
	case strings.HasPrefix(mimetype, "audio"):
		i.Type = "audio"
		return nil
	case strings.HasPrefix(mimetype, "image"):
		i.Type = "image"
		if calcImgRes {
			resolution, err := calculateImageResolution(i.Fs, i.Path)
			if err != nil {
				log.Printf("Error calculating image resolution: %v", err)
			} else {
				i.Resolution = resolution
			}
		}
		return nil
	case strings.HasSuffix(mimetype, "pdf"):
		i.Type = "pdf"
		return nil
	// Text classification. The `!isBinary(header())` clause is a fallback that
	// rescues text files whose MIME isn't `text/*` (e.g. application/json).
	// It MUST call `header()` (the lazy reader), not the bare `buffer` var:
	// `buffer` is only populated when `header()` was already invoked, and that
	// only happens above when `mimetype == ""` (the DetectContentType branch).
	// A registered non-text `application/*` MIME (zip, 7z, tar, gzip, rar…)
	// skips that branch, so `buffer` would still be nil here and `isBinary(nil)`
	// returns false — which previously mis-classified every such archive as
	// "text" and dumped raw bytes into the text viewer (WS3). `header()` reads
	// the real first bytes (when readHeader is set) so archives fall through to
	// the blob/no-preview card instead.
	// But when the content sniff returned "application/octet-stream" — Go's
	// explicit "this is unknown/binary" verdict — trust it and fall through
	// to the blob (download) card instead of letting the heuristic force a
	// text preview on an unknown file. `text/*` MIMEs (incl. extensionless
	// files DetectContentType reads as text/plain) still preview as text.
	// An empty file with an UNKNOWN extension otherwise sniffs as text/plain
	// (Go's DetectContentType verdict for empty input) and wrongly opens the
	// text editor — `file.nothing` / `file.fjksf` are blobs, not text. Empty
	// files with a known text extension (e.g. a fresh `.txt`) stay editable.
	case extMime == "" && i.Size == 0:
		i.Type = "blob"
	case mimetype != "application/octet-stream" &&
		(strings.HasPrefix(mimetype, "text") || !isBinary(header())) &&
		i.Size <= 10*1024*1024: // 10 MB
		i.Type = "text"

		if !modify {
			i.Type = "textImmutable"
		}

		if saveContent {
			afs := &afero.Afero{Fs: i.Fs}
			content, err := afs.ReadFile(i.Path)
			if err != nil {
				return err
			}

			i.Content = string(content)
		}
		return nil
	default:
		i.Type = "blob"
	}

	return nil
}

func calculateImageResolution(fSys afero.Fs, filePath string) (*ImageResolution, error) {
	file, err := fSys.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cErr := file.Close(); cErr != nil {
			log.Printf("Failed to close file: %v", cErr)
		}
	}()

	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return nil, err
	}

	return &ImageResolution{
		Width:  config.Width,
		Height: config.Height,
	}, nil
}

func (i *FileInfo) readFirstBytes() []byte {
	reader, err := i.Fs.Open(i.Path)
	if err != nil {
		log.Print(err)
		i.Type = "blob"
		return nil
	}
	defer reader.Close()

	buffer := make([]byte, 512)
	n, err := reader.Read(buffer)
	if err != nil && !errors.Is(err, io.EOF) {
		log.Print(err)
		i.Type = "blob"
		return nil
	}

	return buffer[:n]
}

func (i *FileInfo) detectSubtitles() {
	if i.Type != "video" {
		return
	}

	i.Subtitles = []string{}
	ext := filepath.Ext(i.Path)

	// detect multiple languages. Base*.vtt
	parentDir := strings.TrimRight(i.Path, i.Name)
	var dir []os.FileInfo
	if len(i.currentDir) > 0 {
		dir = i.currentDir
	} else {
		var err error
		dir, err = afero.ReadDir(i.Fs, parentDir)
		if err != nil {
			return
		}
	}

	base := strings.TrimSuffix(i.Name, ext)
	for _, f := range dir {
		// load all supported subtitles from subs directories
		// should cover all instances of subtitle distributions
		// like tv-shows with multiple episodes in single dir
		if f.IsDir() && reSubDirs.MatchString(f.Name()) {
			subsDir := path.Join(parentDir, f.Name())
			i.loadSubtitles(subsDir, base, true)
		} else if isSubtitleMatch(f, base) {
			i.addSubtitle(path.Join(parentDir, f.Name()))
		}
	}
}

func (i *FileInfo) loadSubtitles(subsPath, baseName string, recursive bool) {
	dir, err := afero.ReadDir(i.Fs, subsPath)
	if err == nil {
		for _, f := range dir {
			if isSubtitleMatch(f, "") {
				i.addSubtitle(path.Join(subsPath, f.Name()))
			} else if f.IsDir() && recursive && strings.HasPrefix(f.Name(), baseName) {
				subsDir := path.Join(subsPath, f.Name())
				i.loadSubtitles(subsDir, baseName, false)
			}
		}
	}
}

func IsSupportedSubtitle(fileName string) bool {
	return reSubExts.MatchString(fileName)
}

func isSubtitleMatch(f fs.FileInfo, baseName string) bool {
	return !f.IsDir() && strings.HasPrefix(f.Name(), baseName) &&
		IsSupportedSubtitle(f.Name())
}

func (i *FileInfo) addSubtitle(fPath string) {
	i.Subtitles = append(i.Subtitles, fPath)
}

func (i *FileInfo) readListing(checker rules.Checker, readHeader bool, calcImgRes bool) error {
	dir, err := readDir(i.Fs, i.Path)
	if err != nil {
		return err
	}

	listing := &Listing{
		Items:    []*FileInfo{},
		NumDirs:  0,
		NumFiles: 0,
	}

	// Phase 1 — build the FileInfo entries (cheap: ReadDir already stat'd
	// them; this loop does no per-file I/O beyond resolving symlinks).
	type entry struct {
		file          *FileInfo
		isInvalidLink bool
	}
	entries := make([]entry, 0, len(dir))
	for _, f := range dir {
		name := f.Name()
		fPath := path.Join(i.Path, name)

		if !checker.Check(fPath) {
			continue
		}

		isSymlink, isInvalidLink := false, false
		if IsSymlink(f.Mode()) {
			isSymlink = true
			// It's a symbolic link. We try to follow it. If it doesn't work,
			// we stay with the link information instead of the target's.
			info, err := i.Fs.Stat(fPath)
			if err == nil {
				f = info
			} else {
				isInvalidLink = true
			}
		}

		file := &FileInfo{
			Fs:         i.Fs,
			Name:       name,
			Size:       f.Size(),
			ModTime:    f.ModTime(),
			Mode:       f.Mode(),
			IsDir:      f.IsDir(),
			IsSymlink:  isSymlink,
			Extension:  filepath.Ext(name),
			Path:       fPath,
			currentDir: dir,
		}

		if !file.IsDir && strings.HasPrefix(mime.TypeByExtension(file.Extension), "image/") && calcImgRes {
			resolution, err := calculateImageResolution(file.Fs, file.Path)
			if err != nil {
				log.Printf("Error calculating resolution for image %s: %v", file.Path, err)
			} else {
				file.Resolution = resolution
			}
		}

		entries = append(entries, entry{file: file, isInvalidLink: isInvalidLink})
	}

	// Phase 2 — detect file types CONCURRENTLY. Per-file detection is
	// dominated by readFirstBytes() opening the file to sniff its header,
	// which is a network round-trip on remote/NAS mounts — so a directory
	// with thousands of files used to be thousands of *sequential* opens
	// (15 s+ for ~2k files). A bounded worker pool turns that into N/workers
	// of wall-clock time. Each goroutine mutates only its own FileInfo and
	// its own slot in `dropped`, so there's no shared mutable state and no
	// lock is needed; the listing is assembled in deterministic order below.
	dropped := make([]bool, len(entries))
	const maxWorkers = 16
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup
	for idx := range entries {
		e := entries[idx]
		if e.file.IsDir {
			continue
		}
		if e.isInvalidLink {
			e.file.Type = "invalid_link"
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, file *FileInfo) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := file.detectType(true, false, readHeader, calcImgRes); err != nil {
				// RC-17: a single file failing type detection must NOT 500
				// the whole listing. The common trigger is the file being
				// moved/deleted between readdir and now (detectType opens
				// it to sniff the MIME type). Drop a vanished file; keep
				// any other failure in the listing with no detected type.
				if errors.Is(err, fs.ErrNotExist) {
					dropped[idx] = true
					return
				}
				log.Printf("Skipping type detection for %s: %v", file.Path, err)
			}
		}(idx, e.file)
	}
	wg.Wait()

	// Phase 3 — assemble the listing in the original (deterministic) order;
	// ApplySort orders it afterward.
	for idx := range entries {
		if dropped[idx] {
			continue
		}
		file := entries[idx].file
		if file.IsDir {
			listing.NumDirs++
		} else {
			listing.NumFiles++
		}
		listing.Items = append(listing.Items, file)
	}

	i.Listing = listing
	return nil
}

func readDir(afs afero.Fs, dirname string) ([]os.FileInfo, error) {
	dir, err := afero.ReadDir(afs, dirname)
	if err == nil {
		return dir, nil
	}

	dir, fallbackErr := readDirNames(afs, dirname)
	if fallbackErr != nil {
		return nil, err
	}

	return dir, nil
}

func readDirNames(afs afero.Fs, dirname string) ([]os.FileInfo, error) {
	file, err := afs.Open(dirname)
	if err != nil {
		return nil, err
	}

	names, err := file.Readdirnames(-1)
	if closeErr := file.Close(); err == nil && closeErr != nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}

	sort.Strings(names)
	dir := make([]os.FileInfo, 0, len(names))
	for _, name := range names {
		fPath := path.Join(dirname, name)
		info, err := lstatIfPossible(afs, fPath)
		if err != nil {
			log.Printf("Skipping inaccessible file %s: %v", fPath, err)
			continue
		}

		dir = append(dir, info)
	}

	return dir, nil
}

func lstatIfPossible(afs afero.Fs, name string) (os.FileInfo, error) {
	if lstaterFs, ok := afs.(afero.Lstater); ok {
		info, _, err := lstaterFs.LstatIfPossible(name)
		return info, err
	}

	return afs.Stat(name)
}
