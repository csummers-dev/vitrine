package fbhttp

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/bodgit/sevenzip"
	"github.com/mholt/archives"
	"github.com/spf13/afero"
	yzip "github.com/yeka/zip"

	fberrors "github.com/filebrowser/filebrowser/v2/errors"
	"github.com/filebrowser/filebrowser/v2/events"
	"github.com/filebrowser/filebrowser/v2/files"
	"github.com/filebrowser/filebrowser/v2/settings"
)

// extractHandler implements POST /api/unzip{path}?destination=...&override=...
//
// Despite the legacy "/api/unzip" route name, this extracts any supported
// archive format — zip, 7z, rar (incl. RAR multi-volume), and the tar family
// (.tar / .tar.gz / .tgz / .tar.bz2 / .tar.xz / .tar.zst) — via
// github.com/mholt/archives. Split-ZIP (.z01) and multi-volume 7z (.7z.001)
// are detected and rejected.
//
// Password-protected archives ARE supported: the password rides in the
// `X-Archive-Password` request header, base64(UTF-8)-encoded (so non-ASCII
// passwords stay valid as a header value, and the secret never lands in a URL
// or the audit log, which only records paths). 7z + rar passwords are handled
// natively by mholt/archives; encrypted zip is handled by github.com/yeka/zip
// (stdlib archive/zip — which mholt wraps — can't decrypt). When an archive
// turns out to need a (correct) password the handler returns 422 with a typed
// error so the frontend can prompt and retry.
//
// Like the original zip-only handler it reads from the real OS path
// (file.RealPath()), so it only works on osFs-backed mounts. The Zip-Slip
// defenses, per-entry permission checks, and size / entry-count / decompression
// caps all live in materializeEntry, shared between the mholt and yeka walks.
func extractHandler() handleFunc {
	return withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
		// Decode percent-escapes so names with spaces / special chars resolve
		// to their real on-disk name (mirrors the old handler).
		src, err := url.PathUnescape(r.URL.Path)
		if err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		dst, err := url.QueryUnescape(r.URL.Query().Get("destination"))
		if err != nil {
			return http.StatusBadRequest, fberrors.ErrInvalidRequestParams
		}
		dst = filepath.Clean(dst)
		override := r.URL.Query().Get("override") == "true"
		password := archivePassword(r)

		// Permission + feature gates.
		if !d.server.UnzipEnabled || !d.user.Perm.Create || !d.Check(src) || !d.Check(dst) {
			return http.StatusForbidden, nil
		}

		// Resolve source archive metadata.
		file, err := files.NewFileInfo(&files.FileOptions{
			Fs:         d.user.Fs,
			Path:       src,
			Modify:     d.user.Perm.Modify,
			Expand:     false,
			ReadHeader: d.server.TypeDetectionByHeader,
			Checker:    d,
		})
		if err != nil {
			if errors.Is(err, afero.ErrFileNotFound) {
				return http.StatusNotFound, err
			}
			return errToStatus(err), err
		}

		// Outer archive size cap (pre-open). For a multi-volume set this only
		// caps the clicked volume — a cheap pre-filter, not the real defense.
		if file.Size > d.server.MaxZipFileSize {
			return http.StatusBadRequest, fberrors.ErrZipFileIsTooLarge
		}

		dirMode := d.settings.DirMode
		if dirMode == 0 {
			dirMode = settings.DefaultDirMode
		}
		fileMode := d.settings.FileMode
		if fileMode == 0 {
			fileMode = settings.DefaultFileMode
		}

		opts := extractOpts{
			Fs:                      d.user.Fs,
			Check:                   d.Check,
			Override:                override,
			DirMode:                 dirMode,
			FileMode:                fileMode,
			MaxEntries:              d.server.MaxZipFileEntries,
			MaxUncompressedFileSize: d.server.MaxUncompressedFileSize,
			MaxTotalUncompressed:    d.server.MaxTotalUncompressedSize,
			MaxUncompressedRate:     d.server.MaxUncompressedSizeRate,
		}

		if err := extractArchive(r.Context(), file.RealPath(), filepath.Clean(dst), password, opts); err != nil {
			return errToStatus(err), err
		}
		// Extraction added content under the destination folder. Emit FileCreated
		// for that dir so size-tracking subscribers (the folder-size cache, 2.4.0
		// Stage 4) invalidate it + its ancestors; also gives the audit log a
		// record that an archive was unpacked here.
		events.Publish(events.FileCreated{
			Base:  eventBase(r, d),
			Path:  path.Clean("/" + filepath.ToSlash(dst)),
			IsDir: true,
		})
		return http.StatusOK, nil
	})
}

// archivePassword pulls the (base64-encoded, UTF-8) password from the request
// header. An empty / malformed header yields the empty string (treated as "no
// password supplied").
func archivePassword(r *http.Request) string {
	raw := r.Header.Get("X-Archive-Password")
	if raw == "" {
		return ""
	}
	if b, err := base64.StdEncoding.DecodeString(raw); err == nil {
		return string(b)
	}
	return ""
}

// extractOpts carries everything the extraction walk needs, decoupled from the
// HTTP *data so the core is unit-testable with a plain afero.Fs + temp dir.
type extractOpts struct {
	Fs       afero.Fs
	Check    func(string) bool
	Override bool
	DirMode  fs.FileMode
	FileMode fs.FileMode

	MaxEntries              int
	MaxUncompressedFileSize uint64
	MaxTotalUncompressed    uint64
	MaxUncompressedRate     float64
}

// extractCounters are the running zip-bomb guards (no pre-scan; archives stream).
type extractCounters struct {
	entryCount int
	totalBytes uint64
}

// normalizedEntry abstracts a single archive member over both the mholt
// (archives.FileInfo) and yeka (*yzip.File) readers so materializeEntry can be
// shared verbatim.
type normalizedEntry struct {
	name         string // NameInArchive
	isDir        bool
	mode         fs.FileMode
	linkTarget   string
	declaredSize int64 // declared uncompressed size; 0 when unknown

	hasZipSizes     bool // zipCompressed/zipUncompressed are meaningful (zip only)
	zipCompressed   uint64
	zipUncompressed uint64

	open func() (io.ReadCloser, error)
}

// extractArchive is the format dispatcher + walk core.
//
//   - Encrypted ZIP (detected via a cheap central-directory probe) → yeka path,
//     which decrypts; a missing password short-circuits to PasswordRequired
//     before anything is written, and a wrong password is validated against the
//     first encrypted entry (all-or-nothing).
//   - Everything else (incl. UNENCRYPTED zip) → the mholt streaming walk,
//     unchanged, with the password threaded into 7z / rar.
func extractArchive(ctx context.Context, realPath, cleanDst, password string, opts extractOpts) error {
	if isZipPath(realPath) {
		if encrypted, _ := zipIsEncrypted(realPath); encrypted {
			return extractEncryptedZip(realPath, cleanDst, password, opts)
		}
	}

	// 7z / rar can be password-protected, and the streaming mholt walk below
	// writes each entry straight to disk — so a wrong password would otherwise
	// leave partial output (at minimum the first entry's file + parent dirs).
	// Validate the password up front and fail before writing anything, matching
	// the zip path's all-or-nothing guarantee. (tar/gz/etc. can't be encrypted,
	// so we skip the extra open for them.)
	if archiveMayBeEncrypted(realPath) {
		if vErr := validateArchivePassword(ctx, realPath, password); vErr != nil {
			return vErr
		}
	}

	extractor, reader, closeFn, err := detectArchive(ctx, realPath, password)
	if err != nil {
		return err
	}
	defer closeFn()

	c := &extractCounters{}
	walkErr := extractor.Extract(ctx, reader, func(_ context.Context, entry archives.FileInfo) error {
		entryRef := entry // capture for the open closure
		e := normalizedEntry{
			name:         entry.NameInArchive,
			isDir:        entry.IsDir(),
			mode:         entry.Mode(),
			linkTarget:   entry.LinkTarget,
			declaredSize: entry.Size(),
			// archives.FileInfo.Open returns (fs.File, error); fs.File satisfies
			// io.ReadCloser, so the interface conversion on return is implicit.
			open: func() (io.ReadCloser, error) { return entryRef.Open() },
		}
		// Only zip exposes per-entry compressed size uniformly (zip-bomb ratio).
		if zh, ok := entry.Header.(zip.FileHeader); ok {
			e.hasZipSizes = true
			e.zipCompressed = zh.CompressedSize64
			e.zipUncompressed = zh.UncompressedSize64
		}
		return materializeEntry(e, cleanDst, c, opts)
	})
	if walkErr != nil {
		// A password / encryption failure (7z / rar) → friendly typed error.
		if isEncryptionErr(walkErr) {
			return passwordErr(password)
		}
		return walkErr
	}
	return nil
}

// archiveMayBeEncrypted reports whether the format at realPath can carry a
// password (7z / rar, including old-style multi-volume rar names). zip is
// handled by its own pre-validated path; the tar family can't be encrypted.
func archiveMayBeEncrypted(realPath string) bool {
	base := filepath.Base(realPath)
	lower := strings.ToLower(base)
	return strings.HasSuffix(lower, ".7z") ||
		strings.HasSuffix(lower, ".rar") ||
		reOldRar.MatchString(base)
}

// validateArchivePassword dry-runs the mholt extractor far enough to prove the
// password opens the archive — it reads the first regular file's first bytes,
// which is enough to trip the decode failure a wrong/missing password causes
// (7z surfaces it via sevenzip.ReadError, rar via rardecode's "encrypted"
// error). It writes nothing. A password failure returns the friendly typed
// error; any other problem returns nil so the real walk reports it as before.
func validateArchivePassword(ctx context.Context, realPath, password string) error {
	extractor, reader, closeFn, err := detectArchive(ctx, realPath, password)
	if err != nil {
		// Open/detect failure (e.g. a missing rar first volume) isn't a password
		// problem — let the real extract walk surface it with the right error.
		return nil
	}
	defer closeFn()

	var probeErr error
	walkErr := extractor.Extract(ctx, reader, func(_ context.Context, entry archives.FileInfo) error {
		// Skip dirs / links / specials — find the first real file to read.
		if entry.IsDir() || entry.LinkTarget != "" || !entry.Mode().IsRegular() {
			return nil
		}
		rc, openErr := entry.Open()
		if openErr != nil {
			probeErr = openErr
			return fs.SkipAll
		}
		_, probeErr = io.Copy(io.Discard, io.LimitReader(rc, 1024))
		rc.Close()
		return fs.SkipAll
	})
	if walkErr != nil {
		if isEncryptionErr(walkErr) {
			return passwordErr(password)
		}
		// Non-password failure: defer to the real walk to report it.
		return nil
	}
	if probeErr != nil && !errors.Is(probeErr, io.EOF) && isEncryptionErr(probeErr) {
		return passwordErr(password)
	}
	return nil
}

// extractEncryptedZip handles a confirmed-encrypted .zip via yeka/zip.
func extractEncryptedZip(realPath, cleanDst, password string, opts extractOpts) error {
	if password == "" {
		return fberrors.ErrArchivePasswordRequired
	}

	r, err := yzip.OpenReader(realPath)
	if err != nil {
		return err
	}
	defer r.Close()

	// Validate the password against the FIRST encrypted entry before writing
	// anything — a wrong password leaves no partial output (all-or-nothing).
	// A wrong password fails at Open() (AES verifier / ZipCrypto check byte) or
	// within the first bytes, so the read is bounded to the per-file cap: that
	// keeps a zip-bomb first entry from turning validation into an unbounded
	// inflate, without weakening detection. (An over-cap entry is rejected by
	// materializeEntry's declared-size check before any write anyway.)
	for _, f := range r.File {
		if !f.IsEncrypted() {
			continue
		}
		f.SetPassword(password)
		rc, openErr := f.Open()
		if openErr != nil {
			return classifyZipPasswordErr(openErr)
		}
		_, copyErr := io.Copy(io.Discard, io.LimitReader(rc, int64(opts.MaxUncompressedFileSize)))
		rc.Close()
		if copyErr != nil {
			return classifyZipPasswordErr(copyErr)
		}
		break
	}

	c := &extractCounters{}
	for _, f := range r.File {
		fileRef := f // capture for the open closure
		e := normalizedEntry{
			name:            fileRef.Name,
			isDir:           fileRef.FileInfo().IsDir(),
			mode:            fileRef.Mode(),
			declaredSize:    int64(fileRef.UncompressedSize64),
			hasZipSizes:     true,
			zipCompressed:   fileRef.CompressedSize64,
			zipUncompressed: fileRef.UncompressedSize64,
			open: func() (io.ReadCloser, error) {
				if fileRef.IsEncrypted() {
					fileRef.SetPassword(password)
				}
				return fileRef.Open()
			},
		}
		if err := materializeEntry(e, cleanDst, c, opts); err != nil {
			return err
		}
	}
	return nil
}

// materializeEntry writes one archive member to disk, enforcing every security
// guard: link/device skip, zip-bomb ratio, both Zip-Slip passes, per-entry
// permission, per-file + cumulative size caps, bounded copy, and the
// lying-header check. Shared by the mholt and yeka walks.
func materializeEntry(e normalizedEntry, cleanDst string, c *extractCounters, opts extractOpts) error {
	// Entry-count cap.
	c.entryCount++
	if c.entryCount > opts.MaxEntries {
		return fberrors.ErrZipFileIsTooLarge
	}

	// Skip symlinks / hard links / devices / fifos / sockets — only plain
	// files and directories are materialized. Closes link-based escape vectors.
	if e.linkTarget != "" || e.mode&fs.ModeSymlink != 0 ||
		(!e.isDir && !e.mode.IsRegular()) {
		return nil
	}

	// Zip-only compression-ratio (zip-bomb) check.
	if e.hasZipSizes {
		if e.zipUncompressed == 0 {
			if e.zipCompressed > 0 {
				return fberrors.ErrInvalidZipEntry
			}
		} else {
			ratio := float64(e.zipCompressed) / float64(e.zipUncompressed)
			if ratio < opts.MaxUncompressedRate {
				return fberrors.ErrCompressionRateIsTooLarge
			}
		}
	}

	// Zip-Slip defense — string-prefix pass first.
	cleanName := filepath.Clean(e.name)
	if strings.HasPrefix(cleanName, "/") ||
		strings.HasPrefix(cleanName, "../") ||
		strings.Contains(cleanName, "/../") {
		return fberrors.ErrInvalidZipFilePath
	}
	outPath := filepath.Join(cleanDst, cleanName)

	// Zip-Slip defense — second pass via filepath.Rel (mixed separators, etc.).
	rel, relErr := filepath.Rel(cleanDst, outPath)
	if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fberrors.ErrInvalidZipFilePath
	}

	// Per-entry destination permission check.
	if !opts.Check(outPath) {
		return fberrors.ErrInvalidZipFilePath
	}

	// Directory entry.
	if e.isDir {
		if mkErr := opts.Fs.MkdirAll(outPath, opts.DirMode); mkErr != nil {
			return mkErr
		}
		return nil
	}

	// Ensure parent dirs exist.
	if mkErr := opts.Fs.MkdirAll(filepath.Dir(outPath), opts.DirMode); mkErr != nil {
		return mkErr
	}

	// Honor override flag for file collisions.
	if !opts.Override {
		if exists, _ := afero.Exists(opts.Fs, outPath); exists {
			return nil
		}
	}

	// Per-file uncompressed size cap (declared size, when known).
	if e.declaredSize > 0 && uint64(e.declaredSize) > opts.MaxUncompressedFileSize {
		return fberrors.ErrUncompressSizeIsTooLarge
	}

	// Open the archive entry.
	rc, openErr := e.open()
	if openErr != nil {
		return openErr
	}

	outFile, outErr := opts.Fs.OpenFile(outPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, opts.FileMode)
	if outErr != nil {
		rc.Close()
		return outErr
	}

	// Bounded copy — caps written bytes even if the entry streams more than its
	// declared size.
	limited := io.LimitReader(rc, int64(opts.MaxUncompressedFileSize))
	n, copyErr := io.Copy(outFile, limited)

	closeOutErr := outFile.Close()
	rc.Close()

	if copyErr != nil {
		return copyErr
	}
	if closeOutErr != nil {
		return closeOutErr
	}

	// "Lying header" check — entry declared N bytes but streamed more.
	if e.declaredSize > 0 && n > e.declaredSize {
		return fberrors.ErrInvalidZipEntry
	}

	// Cumulative uncompressed cap.
	c.totalBytes += uint64(n)
	if c.totalBytes > opts.MaxTotalUncompressed {
		return fberrors.ErrUncompressSizeIsTooLarge
	}

	return nil
}

// passwordErr distinguishes "encrypted, no password given" (Required) from
// "password given but it didn't work" (Incorrect). sevenzip / rardecode don't
// cleanly separate the two, so we infer from whether a password was supplied.
func passwordErr(password string) error {
	if password == "" {
		return fberrors.ErrArchivePasswordRequired
	}
	return fberrors.ErrArchivePasswordIncorrect
}

// classifyZipPasswordErr maps a yeka decryption failure (only reached with a
// non-empty password on an encrypted entry) to the friendly Incorrect error;
// anything else propagates as-is.
func classifyZipPasswordErr(err error) error {
	if errors.Is(err, yzip.ErrPassword) ||
		errors.Is(err, yzip.ErrAuthentication) ||
		errors.Is(err, yzip.ErrDecryption) ||
		isEncryptionErr(err) {
		return fberrors.ErrArchivePasswordIncorrect
	}
	return err
}

func isZipPath(realPath string) bool {
	return strings.HasSuffix(strings.ToLower(realPath), ".zip")
}

// zipIsEncrypted reports whether any entry in the zip at realPath is encrypted.
// It reads the central directory only (no decompression). An unreadable file
// yields (false, nil) so the canonical error comes from the mholt path.
func zipIsEncrypted(realPath string) (bool, error) {
	r, err := yzip.OpenReader(realPath)
	if err != nil {
		return false, nil
	}
	defer r.Close()
	for _, f := range r.File {
		if f.IsEncrypted() {
			return true, nil
		}
	}
	return false, nil
}

// Archive name patterns. Compiled once.
var (
	reSplitZip   = regexp.MustCompile(`(?i)\.z\d+$`)    // foo.z01, foo.z02 …
	reMultiVol7z = regexp.MustCompile(`(?i)\.7z\.\d+$`) // foo.7z.001 …
	rePartRar    = regexp.MustCompile(`(?i)^(.*\.part)(\d+)(\.rar)$`)
	reOldRar     = regexp.MustCompile(`(?i)^(.*)\.r\d+$`) // foo.r00, foo.r01 …
)

// detectArchive selects the extractor for the archive at realPath, threading
// `password` into the formats that support it (7z, rar). It returns the
// extractor, the source reader to feed Extract (nil for the RAR multi-volume
// path, which opens via its own fs.FS), and a cleanup func the caller must
// defer. Unsupported / split / multi-volume-7z formats yield a typed error.
func detectArchive(ctx context.Context, realPath, password string) (archives.Extractor, io.Reader, func(), error) {
	base := filepath.Base(realPath)
	lower := strings.ToLower(base)
	noop := func() {}

	// Reject split / multi-volume formats we don't support (by name).
	if reSplitZip.MatchString(lower) || reMultiVol7z.MatchString(lower) {
		return nil, nil, noop, fberrors.ErrMultiVolumeUnsupported
	}

	// RAR (single or multi-volume): rardecode derives sibling volumes itself
	// when given the FIRST volume name + an fs.FS over the directory.
	if strings.HasSuffix(lower, ".rar") || reOldRar.MatchString(base) {
		dir := filepath.Dir(realPath)
		first := firstRarVolume(base)
		// The first volume must be present to start the set.
		if _, statErr := os.Stat(filepath.Join(dir, first)); statErr != nil {
			return nil, nil, noop, fmt.Errorf("opening rar volume %q: %w", first, fs.ErrNotExist)
		}
		ex := archives.Rar{Name: first, FS: os.DirFS(dir), Password: password}
		return ex, nil, noop, nil
	}

	// Everything else: sniff by header+name and use the identified format.
	f, err := os.Open(realPath)
	if err != nil {
		return nil, nil, noop, err
	}
	format, _, idErr := archives.Identify(ctx, base, f)
	if idErr != nil {
		f.Close()
		if errors.Is(idErr, archives.NoMatch) {
			return nil, nil, noop, fberrors.ErrUnsupportedArchive
		}
		return nil, nil, noop, idErr
	}
	ex, ok := format.(archives.Extractor)
	if !ok {
		// e.g. a lone compressed file (.gz) with no archive inside — nothing
		// to "extract" into a folder.
		f.Close()
		return nil, nil, noop, fberrors.ErrUnsupportedArchive
	}
	// Identify returns a zero-value format; inject the password for the formats
	// that take one (7z; rar normally takes the explicit branch above).
	switch v := ex.(type) {
	case archives.SevenZip:
		v.Password = password
		ex = v
	case archives.Rar:
		v.Password = password
		ex = v
	}
	// Identify may have advanced the stream; rewind before extracting.
	if _, seekErr := f.Seek(0, io.SeekStart); seekErr != nil {
		f.Close()
		return nil, nil, noop, seekErr
	}
	return ex, f, func() { f.Close() }, nil
}

// firstRarVolume returns the first-volume filename for a RAR set so rardecode
// can start from the beginning regardless of which part the user clicked.
//   - new-style:  name.partNN.rar -> name.part0…1.rar (preserving digit width)
//   - old-style:  name.rNN        -> name.rar
//   - single rar / .rar:           -> itself
func firstRarVolume(base string) string {
	if m := rePartRar.FindStringSubmatch(base); m != nil {
		width := len(m[2])
		return fmt.Sprintf("%s%0*d%s", m[1], width, 1, m[3])
	}
	if strings.HasSuffix(strings.ToLower(base), ".rar") {
		return base
	}
	if m := reOldRar.FindStringSubmatch(base); m != nil {
		return m[1] + ".rar"
	}
	return base
}

// isEncryptionErr reports whether an extraction error is due to the archive
// being password-protected.
//
// 7z is the tricky one: bodgit/sevenzip surfaces a bad/missing password as an
// opaque LZMA decode failure (the AES-decrypted bytes are garbage), but it
// wraps it in a sevenzip.ReadError whose Encrypted flag is the reliable signal
// — for both content-encrypted and header-encrypted (-mhe) archives. We check
// that first, then fall back to text matching for rar (rardecode) and anything
// else that words its error with "password"/"encrypt".
func isEncryptionErr(err error) bool {
	// bodgit/sevenzip returns its ReadError by pointer (*ReadError).
	var re *sevenzip.ReadError
	if errors.As(err, &re) && re.Encrypted {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "password") || strings.Contains(msg, "encrypt")
}
