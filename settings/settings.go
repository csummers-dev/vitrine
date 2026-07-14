package settings

import (
	"crypto/rand"
	"io/fs"
	"log"
	"strings"
	"time"

	"github.com/csummers-dev/vitrine/v3/rules"
)

const DefaultUsersHomeBasePath = "/users"
const DefaultLogoutPage = "/login"
const DefaultMinimumPasswordLength = 12
const DefaultFileMode = 0640
const DefaultDirMode = 0750

// Archive-extraction safety limits (PR #5746, fork variant). Originally
// zip-only; now apply to every supported archive format (zip / 7z / rar /
// tar family) — the field names keep the historical "Zip" spelling so config
// keys / CLI flags stay backward-compatible. Surfaces in the admin Server
// settings; operators may override via `--unzipEnabled=false` / config to
// disable extraction entirely.
//   - MaxZipFileSize: pre-open cap on the archive itself (5 GB). For a
//     multi-volume set this caps the clicked volume only.
//   - MaxZipFileEntries: refuses archives with more than ~100k entries
//     (enforced as a running count during the streaming walk).
//   - MaxTotalUncompressedSize: cumulative cap across all entries (20 GB).
//   - MaxUncompressedSizeRate: zip-bomb defense — rejects entries whose
//     compression ratio (compressed/uncompressed) is below this floor.
//     0.01 means "compressed must be at least 1% of declared uncompressed".
//     Zip-only: other formats don't expose per-entry compressed size, so they
//     rely on the total / per-file / entry-count / outer-size caps instead.
//   - MaxUncompressedFileSize: per-entry decompressed cap (5 GB).
const DefaultMaxZipFileSize = 5 * 1024 * 1024 * 1024            // 5GB
const DefaultMaxZipFileEntries = 100000                         // 100k files
const DefaultMaxTotalUncompressedSize = 20 * 1024 * 1024 * 1024 // 20GB
const DefaultMaxUncompressedSizeRate = 0.01                     // 1%
const DefaultMaxUncompressedFileSize = 5 * 1024 * 1024 * 1024   // 5GB

// AuthMethod describes an authentication method.
type AuthMethod string

// Settings contain the main settings of the application.
type Settings struct {
	Key             []byte `json:"key"`
	Signup          bool   `json:"signup"`
	HideLoginButton bool   `json:"hideLoginButton"`
	CreateUserDir   bool   `json:"createUserDir"`
	// When true, the frontend remembers the last /files path a user had open
	// and redirects there on next successful login. When false (default),
	// login always lands on /files/.
	RememberLastPage      bool                `json:"rememberLastPage"`
	UserHomeBasePath      string              `json:"userHomeBasePath"`
	Defaults              UserDefaults        `json:"defaults"`
	AuthMethod            AuthMethod          `json:"authMethod"`
	LogoutPage            string              `json:"logoutPage"`
	Branding              Branding            `json:"branding"`
	Tus                   Tus                 `json:"tus"`
	Commands              map[string][]string `json:"commands"`
	Shell                 []string            `json:"shell"`
	Rules                 []rules.Rule        `json:"rules"`
	MinimumPasswordLength uint                `json:"minimumPasswordLength"`
	FileMode              fs.FileMode         `json:"fileMode"`
	DirMode               fs.FileMode         `json:"dirMode"`
	HideDotfiles          bool                `json:"hideDotfiles"`
	// TrashRetentionDays auto-purges trash entries older than this many days
	// (2.4.0 Stage 2). 0 disables auto-purge — trashed items stay until
	// restored, deleted forever, or the trash is emptied by hand. Existing
	// databases unmarshal to 0, so enabling retention is always an explicit
	// admin choice in Global settings.
	TrashRetentionDays uint `json:"trashRetentionDays"`
	// VerifyTransfers turns on an integrity check after every background copy
	// (and after the copy phase of a cross-volume move): the source and the new
	// destination are re-read and compared by xxhash64, and a mismatch fails the
	// transfer with the SOURCE KEPT (2.4.0 Stage 4). Off by default — it roughly
	// doubles I/O, so it's an explicit admin opt-in. Existing databases unmarshal
	// to false.
	VerifyTransfers bool `json:"verifyTransfers"`
}

// GetRules implements rules.Provider.
func (s *Settings) GetRules() []rules.Rule {
	return s.Rules
}

// Server specific settings.
type Server struct {
	Root                     string  `json:"root"`
	BaseURL                  string  `json:"baseURL"`
	Socket                   string  `json:"socket"`
	TLSKey                   string  `json:"tlsKey"`
	TLSCert                  string  `json:"tlsCert"`
	Port                     string  `json:"port"`
	Address                  string  `json:"address"`
	Log                      string  `json:"log"`
	EnableThumbnails         bool    `json:"enableThumbnails"`
	ResizePreview            bool    `json:"resizePreview"`
	EnableExec               bool    `json:"enableExec"`
	TypeDetectionByHeader    bool    `json:"typeDetectionByHeader"`
	ImageResolutionCal       bool    `json:"imageResolutionCalculation"`
	AuthHook                 string  `json:"authHook"`
	TokenExpirationTime      string  `json:"tokenExpirationTime"`
	UnzipEnabled             bool    `json:"unzipEnabled"`
	MaxZipFileSize           int64   `json:"maxZipFileSize"`
	MaxZipFileEntries        int     `json:"maxZipFileEntries"`
	MaxTotalUncompressedSize uint64  `json:"maxTotalUncompressedSize"`
	MaxUncompressedSizeRate  float64 `json:"maxUncompressedSizeRate"`
	MaxUncompressedFileSize  uint64  `json:"maxUncompressedFileSize"`
}

// Clean cleans any variables that might need cleaning.
func (s *Server) Clean() {
	s.BaseURL = strings.TrimSuffix(s.BaseURL, "/")
}

func (s *Server) GetTokenExpirationTime(fallback time.Duration) time.Duration {
	if s.TokenExpirationTime == "" {
		return fallback
	}

	duration, err := time.ParseDuration(s.TokenExpirationTime)
	if err != nil {
		log.Printf("[WARN] Failed to parse tokenExpirationTime: %v", err)
		return fallback
	}
	return duration
}

// GenerateKey generates a key of 512 bits.
func GenerateKey() ([]byte, error) {
	b := make([]byte, 64)
	_, err := rand.Read(b)
	// Note that err == nil only if we read len(b) bytes.
	if err != nil {
		return nil, err
	}

	return b, nil
}
