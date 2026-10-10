package twofactor

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
	"time"
)

// ChallengeTTL is how long the code step may follow the password step.
const ChallengeTTL = 5 * time.Minute

// ErrChallenge means a challenge token is malformed, forged or expired.
var ErrChallenge = errors.New("twofactor: invalid or expired challenge")

var b64 = base64.RawURLEncoding

// IssueChallenge returns a token proving userID passed the password step,
// valid for ChallengeTTL. It is signed with key (the server's signing key).
func IssueChallenge(key []byte, userID uint, now time.Time) (string, error) {
	payload := make([]byte, 24)
	binary.BigEndian.PutUint64(payload[0:], uint64(userID))
	binary.BigEndian.PutUint64(payload[8:], uint64(now.Add(ChallengeTTL).Unix()))
	if _, err := rand.Read(payload[16:]); err != nil {
		return "", err
	}
	return b64.EncodeToString(payload) + "." + b64.EncodeToString(sign(key, payload)), nil
}

// ParseChallenge verifies a token and returns its user ID.
func ParseChallenge(key []byte, token string, now time.Time) (uint, error) {
	p, s, ok := strings.Cut(token, ".")
	if !ok {
		return 0, ErrChallenge
	}
	payload, err1 := b64.DecodeString(p)
	mac, err2 := b64.DecodeString(s)
	if err1 != nil || err2 != nil || len(payload) != 24 || !hmac.Equal(mac, sign(key, payload)) {
		return 0, ErrChallenge
	}
	if now.Unix() > int64(binary.BigEndian.Uint64(payload[8:])) {
		return 0, ErrChallenge
	}
	return uint(binary.BigEndian.Uint64(payload[0:])), nil
}

func sign(key, payload []byte) []byte {
	mac := hmac.New(sha256.New, append([]byte("vitrine-2fa-challenge:"), key...))
	mac.Write(payload)
	return mac.Sum(nil)
}
