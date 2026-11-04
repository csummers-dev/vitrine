package fbhttp

// The size and safety checks for archive extraction (4.0). They replace the
// old fixed caps (5 GB per file, 20 GB per archive), which refused the
// multi-gigabyte disk images a NAS holds as a matter of course, with checks
// that scale with the archive and the disk:
//
//   - a free-space check before anything is written, from the sizes the
//     archive declares (zip, 7z, rar, plain tar);
//   - ratio limits, per entry where the compressed size is known (zip) and
//     for the whole archive in every format, so a bomb is stopped however
//     it's packed while near-1:1 archives of huge files pass;
//   - checks while writing, because headers can lie: an entry that grows
//     past its declared size, a total past the declared total, the ratio
//     limit, and free space running out;
//   - cleanup of everything this extraction created when it stops early,
//     with existing files only ever replaced by a finished new copy.

import (
	"archive/tar"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode/v2"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/spf13/afero"
	yzip "github.com/yeka/zip"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// Variables rather than constants so tests can scale them down.
var (
	// ratioFloor: the ratio limits only apply once an entry, or the whole
	// extraction, has written this much, so small and very compressible
	// files (text, an empty disk image) still extract.
	ratioFloor uint64 = 100 << 20
	// freeSpaceRecheck: how many bytes are written between free-space
	// checks while extracting.
	freeSpaceRecheck uint64 = 256 << 20
)

// sizeTolerance is how far an entry may run past its declared size before
// it counts as lying: 1%, at least 1 MiB.
func sizeTolerance(declared uint64) uint64 {
	if t := declared / 100; t > 1<<20 {
		return t
	}
	return 1 << 20
}

// declaredSizes is what an archive says it will unpack to, read from its
// index or headers without decompressing anything.
type declaredSizes struct {
	total uint64 // bytes of regular files
	known bool   // false when the format can't say cheaply (compressed tar)
}

// readDeclaredSizes sums the uncompressed sizes an archive declares. Formats
// with an index (zip, 7z), rar (headers listed without unpacking, across
// all volumes) and plain tar (headers, skipping file data) are read; a
// compressed tar can't be measured without decompressing it, so it reports
// known=false and relies on the checks while writing. A file that can't be
// read here also reports known=false: the extraction itself then fails with
// the real reason.
func readDeclaredSizes(realPath, password string) declaredSizes {
	base := filepath.Base(realPath)
	lower := strings.ToLower(base)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		r, err := yzip.OpenReader(realPath)
		if err != nil {
			return declaredSizes{}
		}
		defer r.Close()
		var s declaredSizes
		for _, f := range r.File {
			if !f.FileInfo().IsDir() {
				s.total += f.UncompressedSize64
			}
		}
		s.known = true
		return s

	case strings.HasSuffix(lower, ".7z"):
		r, err := sevenzip.OpenReaderWithPassword(realPath, password)
		if err != nil {
			return declaredSizes{}
		}
		defer r.Close()
		var s declaredSizes
		for _, f := range r.File {
			if !f.FileInfo().IsDir() {
				s.total += f.UncompressedSize
			}
		}
		s.known = true
		return s

	case strings.HasSuffix(lower, ".rar") || reOldRar.MatchString(base):
		first := filepath.Join(filepath.Dir(realPath), firstRarVolume(base))
		var opts []rardecode.Option
		if password != "" {
			opts = append(opts, rardecode.Password(password))
		}
		files, err := rardecode.List(first, opts...)
		if err != nil {
			return declaredSizes{}
		}
		var s declaredSizes
		for _, f := range files {
			if f.IsDir {
				continue
			}
			if f.UnKnownSize || f.UnPackedSize < 0 {
				return declaredSizes{}
			}
			s.total += uint64(f.UnPackedSize)
		}
		s.known = true
		return s

	case strings.HasSuffix(lower, ".tar"):
		f, err := os.Open(realPath)
		if err != nil {
			return declaredSizes{}
		}
		defer f.Close()
		var s declaredSizes
		tr := tar.NewReader(f)
		for {
			h, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return declaredSizes{}
			}
			if h.Typeflag == tar.TypeReg && h.Size > 0 {
				s.total += uint64(h.Size)
			}
		}
		s.known = true
		return s
	}
	return declaredSizes{}
}

var reRarPart = regexp.MustCompile(`(?i)^(.*\.part)\d+\.rar$`)

// archiveDiskSize is the archive's size on disk, all volumes of a rar set
// together (the whole-archive ratio is measured against it).
func archiveDiskSize(realPath string) uint64 {
	dir, base := filepath.Split(realPath)
	var match func(name string) bool
	switch {
	case reRarPart.MatchString(base):
		prefix := strings.ToLower(reRarPart.FindStringSubmatch(base)[1])
		match = func(n string) bool {
			return reRarPart.MatchString(n) && strings.ToLower(reRarPart.FindStringSubmatch(n)[1]) == prefix
		}
	case strings.HasSuffix(strings.ToLower(base), ".rar") || reOldRar.MatchString(base):
		stem := strings.ToLower(strings.TrimSuffix(firstRarVolume(base), filepath.Ext(firstRarVolume(base))))
		match = func(n string) bool {
			l := strings.ToLower(n)
			return l == stem+".rar" || (reOldRar.MatchString(n) && strings.ToLower(reOldRar.FindStringSubmatch(n)[1]) == stem)
		}
	default:
		if fi, err := os.Stat(realPath); err == nil {
			return uint64(fi.Size())
		}
		return 0
	}
	entries, err := os.ReadDir(filepath.Clean(dir))
	if err != nil {
		return 0
	}
	var total uint64
	for _, e := range entries {
		if e.IsDir() || !match(e.Name()) {
			continue
		}
		if fi, err := e.Info(); err == nil {
			total += uint64(fi.Size())
		}
	}
	return total
}

// preflight runs before anything is written: the archive must fit in the
// destination's free space (keeping the margin), stay under the optional
// total cap, and not expand beyond the ratio limit as a whole.
func preflight(sizes declaredSizes, opts extractOpts) error {
	if !sizes.known {
		return nil
	}
	if opts.MaxTotal > 0 && sizes.total > opts.MaxTotal {
		return &fberrors.UnsafeArchiveError{Reason: fmt.Sprintf(
			"unpacks to %s, over this server's limit of %s",
			fberrors.HumanBytes(sizes.total), fberrors.HumanBytes(opts.MaxTotal))}
	}
	if opts.MaxRatio > 0 && opts.ArchiveSize > 0 && sizes.total > ratioFloor &&
		float64(sizes.total) > opts.MaxRatio*float64(opts.ArchiveSize) {
		return &fberrors.UnsafeArchiveError{Reason: "exceeds safe compression ratio"}
	}
	return checkFreeSpace(sizes.total, opts)
}

// checkFreeSpace fails when `need` more bytes wouldn't fit while keeping the
// safety margin free. Without a free-space source (tests, other platforms)
// it passes.
func checkFreeSpace(need uint64, opts extractOpts) error {
	if opts.FreeSpace == nil {
		return nil
	}
	free, err := opts.FreeSpace()
	if err != nil {
		return nil // can't tell: don't block on it
	}
	var usable uint64
	if free > opts.FreeMargin {
		usable = free - opts.FreeMargin
	}
	if need > usable {
		return &fberrors.InsufficientSpaceError{Need: need, Free: usable}
	}
	return nil
}

// extractJob is one extraction's running state: counters for the checks
// while writing, and what it created, for cleanup if it stops early.
type extractJob struct {
	opts extractOpts

	entryCount int
	written    uint64 // bytes written so far, all entries
	declared   declaredSizes
	sinceCheck uint64 // bytes written since free space was last read

	createdFiles []string // final paths of new files (not replaced ones)
	createdDirs  []string // directories this job made, outermost first
	tempFiles    []string // in-progress temporary files
}

// mkdirAll creates dir and its missing parents, remembering which ones it
// made so cleanup can remove exactly those.
func (j *extractJob) mkdirAll(dir string) error {
	var missing []string
	for d := dir; ; d = filepath.Dir(d) {
		if _, err := j.opts.Fs.Stat(d); err == nil {
			break
		}
		missing = append(missing, d)
		if parent := filepath.Dir(d); parent == d {
			break
		}
	}
	if err := j.opts.Fs.MkdirAll(dir, j.opts.DirMode); err != nil {
		return err
	}
	for i := len(missing) - 1; i >= 0; i-- {
		j.createdDirs = append(j.createdDirs, missing[i])
	}
	return nil
}

// cleanup removes what this extraction created: temporary files, new files,
// then new directories innermost first (only if empty, so nothing else is
// ever removed). Files that existed before are never touched: overwrites only
// happen by renaming a finished copy over them.
func (j *extractJob) cleanup() {
	for _, p := range j.tempFiles {
		_ = j.opts.Fs.Remove(p)
	}
	for _, p := range j.createdFiles {
		_ = j.opts.Fs.Remove(p)
	}
	for i := len(j.createdDirs) - 1; i >= 0; i-- {
		_ = j.opts.Fs.Remove(j.createdDirs[i])
	}
	j.tempFiles, j.createdFiles, j.createdDirs = nil, nil, nil
}

// entryGuard checks one entry's bytes as they are written.
type entryGuard struct {
	job        *extractJob
	name       string
	declared   uint64 // 0 when unknown
	compressed uint64 // 0 when unknown
	n          uint64
}

func (g *entryGuard) Write(p []byte) (int, error) {
	if err := g.admit(uint64(len(p))); err != nil {
		return 0, err
	}
	return len(p), nil
}

// admit accounts for the next k bytes and fails before they are written if
// they would break a limit.
func (g *entryGuard) admit(k uint64) error {
	j, o := g.job, g.job.opts
	n := g.n + k
	total := j.written + k
	switch {
	case g.declared > 0 && n > g.declared+sizeTolerance(g.declared):
		return &fberrors.UnsafeArchiveError{Entry: g.name, Reason: "is larger than its header says"}
	case o.MaxFileSize > 0 && n > o.MaxFileSize:
		return &fberrors.UnsafeArchiveError{Entry: g.name, Reason: fmt.Sprintf(
			"is over this server's per-file limit of %s", fberrors.HumanBytes(o.MaxFileSize))}
	case o.MaxRatio > 0 && g.compressed > 0 && n > ratioFloor &&
		float64(n) > o.MaxRatio*float64(g.compressed):
		return &fberrors.UnsafeArchiveError{Entry: g.name, Reason: "exceeds safe compression ratio"}
	case o.MaxRatio > 0 && o.ArchiveSize > 0 && total > ratioFloor &&
		float64(total) > o.MaxRatio*float64(o.ArchiveSize):
		return &fberrors.UnsafeArchiveError{Reason: "exceeds safe compression ratio"}
	case j.declared.known && total > j.declared.total+sizeTolerance(j.declared.total):
		return &fberrors.UnsafeArchiveError{Reason: "unpacks to more than its headers say"}
	case o.MaxTotal > 0 && total > o.MaxTotal:
		return &fberrors.UnsafeArchiveError{Reason: fmt.Sprintf(
			"unpacks to more than this server's limit of %s", fberrors.HumanBytes(o.MaxTotal))}
	}
	g.n = n
	j.written = total
	j.sinceCheck += k
	if j.sinceCheck >= freeSpaceRecheck {
		j.sinceCheck = 0
		if err := checkFreeSpace(0, o); err != nil {
			return err
		}
	}
	return nil
}

// writeEntry streams one entry into a temporary file beside its final path,
// under the guard, then renames it into place. A failure leaves no partial
// file, and an existing file is only ever replaced by a complete copy.
func (j *extractJob) writeEntry(outPath string, e normalizedEntry, existed bool) error {
	declared := uint64(0)
	if e.declaredSize > 0 {
		declared = uint64(e.declaredSize)
	}
	// Without a declared total for the archive, check each entry's own
	// declared size against free space before writing it.
	if !j.declared.known && declared > 0 {
		if err := checkFreeSpace(declared, j.opts); err != nil {
			return err
		}
	}

	rc, err := e.open()
	if err != nil {
		return err
	}
	defer rc.Close()

	tmp, err := afero.TempFile(j.opts.Fs, filepath.Dir(outPath), ".vitrine-extract-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	j.tempFiles = append(j.tempFiles, tmpName)
	dropTemp := func() {
		_ = j.opts.Fs.Remove(tmpName)
		j.tempFiles = j.tempFiles[:len(j.tempFiles)-1]
	}

	g := &entryGuard{job: j, name: e.name, declared: declared}
	if e.hasZipSizes {
		g.compressed = e.zipCompressed
	}
	_, copyErr := io.Copy(tmp, io.TeeReader(rc, g))
	closeErr := tmp.Close()
	if copyErr != nil {
		dropTemp()
		return copyErr
	}
	if closeErr != nil {
		dropTemp()
		return closeErr
	}
	if err := j.opts.Fs.Chmod(tmpName, j.opts.FileMode); err != nil {
		dropTemp()
		return err
	}
	if err := j.opts.Fs.Rename(tmpName, outPath); err != nil {
		dropTemp()
		return err
	}
	j.tempFiles = j.tempFiles[:len(j.tempFiles)-1]
	if !existed {
		j.createdFiles = append(j.createdFiles, outPath)
	}
	return nil
}

// destFreeSpace reads free space on the disk that holds dst (a path inside
// the user's file system): the nearest folder that exists, since dst itself
// may not yet.
func destFreeSpace(fsys afero.Fs, dst string) func() (uint64, error) {
	return func() (uint64, error) {
		p := dst
		if rp, ok := fsys.(interface {
			RealPath(name string) (string, error)
		}); ok {
			realDst, err := rp.RealPath(dst)
			if err != nil {
				return 0, err
			}
			p = realDst
		}
		for {
			if _, err := os.Stat(p); err == nil {
				break
			}
			parent := filepath.Dir(p)
			if parent == p {
				break
			}
			p = parent
		}
		u, err := disk.Usage(p)
		if err != nil {
			return 0, err
		}
		return u.Free, nil
	}
}
