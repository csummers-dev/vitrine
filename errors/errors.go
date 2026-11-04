package fberrors

import (
	"errors"
	"fmt"
)

var (
	ErrEmptyKey                 = errors.New("empty key")
	ErrExist                    = errors.New("the resource already exists")
	ErrNotExist                 = errors.New("the resource does not exist")
	ErrEmptyPassword            = errors.New("password is empty")
	ErrEasyPassword             = errors.New("password is too easy")
	ErrEmptyUsername            = errors.New("username is empty")
	ErrEmptyRequest             = errors.New("empty request")
	ErrScopeIsRelative          = errors.New("scope is a relative path")
	ErrInvalidDataType          = errors.New("invalid data type")
	ErrIsDirectory              = errors.New("file is directory")
	ErrInvalidOption            = errors.New("invalid option")
	ErrInvalidAuthMethod        = errors.New("invalid auth method")
	ErrPermissionDenied         = errors.New("permission denied")
	ErrInvalidRequestParams     = errors.New("invalid request params")
	ErrSourceIsParent           = errors.New("source is parent")
	ErrRootUserDeletion         = errors.New("the sole admin can't be deleted")
	ErrCurrentPasswordIncorrect = errors.New("the current password is incorrect")
	ErrShareRequiresDownload    = errors.New("permission to share requires permission to download")

	// Archive-extraction errors. Originally zip-only (PR #5746); the names
	// are kept generic-enough and now apply to every supported archive
	// format (zip / 7z / rar / tar family).
	ErrZipFileIsTooLarge         = errors.New("the archive is too large")
	ErrCompressionRateIsTooLarge = errors.New("one of the files has too high a decompression rate")
	ErrInvalidZipFilePath        = errors.New("invalid path in some files of the archive")
	ErrUncompressSizeIsTooLarge  = errors.New("one of the files has too high a decompression size")
	ErrInvalidZipEntry           = errors.New("some files are invalid in the archive")

	// Generalized extract errors (zip/7z/rar + tar family).
	ErrUnsupportedArchive          = errors.New("this archive format isn't supported")
	ErrMultiVolumeUnsupported      = errors.New("split or multi-volume archives of this format aren't supported")
	ErrEncryptedArchiveUnsupported = errors.New("password-protected archives aren't supported")

	// Password-protected extraction (the comic reader still uses the
	// "unsupported" error above; extraction now accepts a password). Required
	// = the archive is encrypted and no password was supplied; Incorrect = a
	// password was supplied but it didn't open the archive. Both map to HTTP
	// 422 so the frontend can prompt without tripping the 401 auto-logout.
	ErrArchivePasswordRequired  = errors.New("this archive is password-protected")
	ErrArchivePasswordIncorrect = errors.New("the archive password is incorrect")
)

type ErrShortPassword struct {
	MinimumLength uint
}

func (e ErrShortPassword) Error() string {
	return fmt.Sprintf("password is too short, minimum length is %d", e.MinimumLength)
}

// InsufficientSpaceError means an extraction would not fit on the
// destination's disk (4.0). Need and Free are bytes; Free is what's left
// after the configured safety margin.
type InsufficientSpaceError struct {
	Need uint64
	Free uint64
}

func (e *InsufficientSpaceError) Error() string {
	return fmt.Sprintf("not enough space: needs %s, %s free", HumanBytes(e.Need), HumanBytes(e.Free))
}

// UnsafeArchiveError means an archive was refused as unsafe: an entry, or
// the archive as a whole, expands far beyond its compressed size, an entry
// is bigger than its header says, or a path points outside the destination.
// Entry is the archive member, "" for the archive as a whole.
type UnsafeArchiveError struct {
	Entry  string
	Reason string
}

func (e *UnsafeArchiveError) Error() string {
	if e.Entry == "" {
		return "archive " + e.Reason
	}
	return fmt.Sprintf("archive entry %q %s", e.Entry, e.Reason)
}

// HumanBytes formats a byte count in decimal units, as disks are sold:
// 48200000000 → "48.2 GB".
func HumanBytes(n uint64) string {
	const unit = 1000
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := uint64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "kMGTPE"[exp])
}
