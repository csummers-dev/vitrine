package share

type CreateBody struct {
	Password string `json:"password"`
	Expires  string `json:"expires"`
	Unit     string `json:"unit"`
	// MaxDownloads limits how many times the shared file or folder can be
	// downloaded; 0 means unlimited and 1 makes a one-time link.
	MaxDownloads int64 `json:"maxDownloads"`

	// Upload ("drop-box") shares, 4.0 Phase 4.1.
	Mode              string   `json:"mode"`
	MaxFileSize       int64    `json:"maxFileSize"`
	MaxTotalSize      int64    `json:"maxTotalSize"`
	AllowedExtensions []string `json:"allowedExtensions"`
	PerUploaderFolder bool     `json:"perUploaderFolder"`
}

// MaxUploadLimit caps the byte limits a drop-box can be created with (1 PiB).
const MaxUploadLimit = 1 << 50

// Link is the information needed to build a shareable link.
type Link struct {
	Hash         string `json:"hash" storm:"id,index"`
	Path         string `json:"path" storm:"index"`
	UserID       uint   `json:"userID"`
	Expire       int64  `json:"expire"`
	PasswordHash string `json:"password_hash,omitempty"`
	// Token is a random value that will only be set when PasswordHash is set. It is
	// URL-Safe and is used to download links in password-protected shares via a
	// query arg.
	Token string `json:"token,omitempty"`

	// Usage (4.0 Phase 4.2). Views counts opens of the share page,
	// Downloads full downloads; LastAccessAt is a unix time.
	Views        int64 `json:"views"`
	Downloads    int64 `json:"downloads"`
	LastAccessAt int64 `json:"lastAccessAt,omitempty"`
	// MaxDownloads > 0 ends the link after that many downloads.
	MaxDownloads int64 `json:"maxDownloads,omitempty"`

	// Mode is ModeDownload ("", every link before 4.0) or ModeUpload: a
	// drop-box where visitors can add files to the shared folder but never
	// see what's in it.
	Mode string `json:"mode,omitempty"`
	// Upload limits: bytes per file and in total (0 = no limit), allowed
	// extensions (lower case, with dot; empty = any), and whether each
	// upload goes into a subfolder named after the uploader.
	MaxFileSize       int64    `json:"maxFileSize,omitempty"`
	MaxTotalSize      int64    `json:"maxTotalSize,omitempty"`
	AllowedExtensions []string `json:"allowedExtensions,omitempty"`
	PerUploaderFolder bool     `json:"perUploaderFolder,omitempty"`
	// UploadedBytes and Uploads count what has been received.
	UploadedBytes int64 `json:"uploadedBytes,omitempty"`
	Uploads       int64 `json:"uploads,omitempty"`
}

// Share modes.
const (
	ModeDownload = ""
	ModeUpload   = "upload"
)

// IsUpload reports whether the link is a drop-box.
func (l *Link) IsUpload() bool { return l.Mode == ModeUpload }

// Exhausted reports whether a download-limited link has been used up.
func (l *Link) Exhausted() bool {
	return l.MaxDownloads > 0 && l.Downloads >= l.MaxDownloads
}
