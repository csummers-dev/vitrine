package twofactor

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // RFC 6238 TOTP uses HMAC-SHA1; authenticator apps expect it.
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	// Period is the TOTP time step.
	Period = 30 * time.Second
	// Digits is the code length.
	Digits = 6
	// Skew is how many steps either side of now are accepted.
	Skew = 1
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewSecret returns a random 160-bit secret, base32 without padding.
func NewSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return b32.EncodeToString(b), nil
}

func decodeSecret(secret string) ([]byte, error) {
	s := strings.ToUpper(strings.ReplaceAll(secret, " ", ""))
	return b32.DecodeString(strings.TrimRight(s, "="))
}

func step(t time.Time) int64 { return t.Unix() / int64(Period/time.Second) }

func codeAt(key []byte, counter int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	v := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", v%1_000_000)
}

// Code returns the code for secret at t.
func Code(secret string, t time.Time) (string, error) {
	key, err := decodeSecret(secret)
	if err != nil {
		return "", err
	}
	return codeAt(key, step(t)), nil
}

// Validate checks code against secret around now, refusing steps at or
// before lastStep (so a code can't be replayed). It returns the matched
// step.
func Validate(secret, code string, now time.Time, lastStep int64) (int64, bool) {
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != Digits {
		return 0, false
	}
	key, err := decodeSecret(secret)
	if err != nil {
		return 0, false
	}
	cur := step(now)
	for s := cur - Skew; s <= cur+Skew; s++ {
		if s <= lastStep {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(codeAt(key, s)), []byte(code)) == 1 {
			return s, true
		}
	}
	return 0, false
}

// URI is the otpauth:// link authenticator apps scan as a QR code.
func URI(issuer, account, secret string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprint(Digits))
	q.Set("period", fmt.Sprint(int(Period/time.Second)))
	return "otpauth://totp/" + label + "?" + q.Encode()
}
