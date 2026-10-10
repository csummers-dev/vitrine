package twofactor

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strings"
)

// RecoveryCodeCount is how many recovery codes a user gets.
const RecoveryCodeCount = 10

// Recovery codes are 10 characters from an unambiguous alphabet (~50 bits),
// shown as "XXXXX-XXXXX".
const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func hashRecovery(salt, code string) string {
	sum := sha256.Sum256([]byte(salt + ":" + normalizeRecovery(code)))
	return hex.EncodeToString(sum[:])
}

func normalizeRecovery(code string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r == '-' || r == ' ':
			return -1
		case r >= 'a' && r <= 'z':
			return r - 'a' + 'A'
		}
		return r
	}, code)
}

// NewRecoveryCodes replaces the record's recovery codes and returns the
// new plain codes (show once: only hashes are kept).
func (r *Factor) NewRecoveryCodes() ([]string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	r.Salt = hex.EncodeToString(salt)
	codes := make([]string, RecoveryCodeCount)
	r.Recovery = make([]string, RecoveryCodeCount)
	buf := make([]byte, 10)
	for i := range codes {
		if _, err := rand.Read(buf); err != nil {
			return nil, err
		}
		var b strings.Builder
		for j, c := range buf {
			if j == 5 {
				b.WriteByte('-')
			}
			b.WriteByte(recoveryAlphabet[int(c)%len(recoveryAlphabet)])
		}
		codes[i] = b.String()
		r.Recovery[i] = hashRecovery(r.Salt, codes[i])
	}
	return codes, nil
}

// UseRecoveryCode consumes a matching recovery code. The caller saves the
// record when it returns true.
func (r *Factor) UseRecoveryCode(code string) bool {
	if len(normalizeRecovery(code)) != 10 {
		return false
	}
	h := hashRecovery(r.Salt, code)
	for i, stored := range r.Recovery {
		if subtle.ConstantTimeCompare([]byte(stored), []byte(h)) == 1 {
			r.Recovery = append(r.Recovery[:i], r.Recovery[i+1:]...)
			return true
		}
	}
	return false
}
