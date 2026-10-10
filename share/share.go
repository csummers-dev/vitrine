package share

type CreateBody struct {
	Password string `json:"password"`
	Expires  string `json:"expires"`
	Unit     string `json:"unit"`
	// MaxDownloads limits how many times the shared file or folder can be
	// downloaded; 0 means unlimited and 1 makes a one-time link.
	MaxDownloads int64 `json:"maxDownloads"`
}

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
}

// Exhausted reports whether a download-limited link has been used up.
func (l *Link) Exhausted() bool {
	return l.MaxDownloads > 0 && l.Downloads >= l.MaxDownloads
}
