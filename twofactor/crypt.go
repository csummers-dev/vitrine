package twofactor

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
)

// KeySize is the length of the key that seals secrets (AES-256).
const KeySize = 32

// Sealer encrypts secrets at rest with AES-256-GCM.
type Sealer struct{ aead cipher.AEAD }

// NewSealer returns a Sealer for a KeySize key.
func NewSealer(key []byte) (*Sealer, error) {
	if len(key) != KeySize {
		return nil, fmt.Errorf("twofactor: key must be %d bytes", KeySize)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Sealer{aead: aead}, nil
}

// Seal encrypts plain, returning base64(nonce || ciphertext).
func (s *Sealer) Seal(plain string) (string, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := s.aead.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

// ErrSealed means a sealed value couldn't be opened (wrong key or damage).
var ErrSealed = errors.New("twofactor: can't decrypt secret")

// Open reverses Seal.
func (s *Sealer) Open(sealed string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return "", ErrSealed
	}
	n := s.aead.NonceSize()
	plain, err := s.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", ErrSealed
	}
	return string(plain), nil
}

// LoadOrCreateKey reads the key file at path, creating it (mode 0600) with
// a random key when it doesn't exist. Keep it with the database's backups:
// without it, enrolled users can't sign in until an admin resets them.
func LoadOrCreateKey(path string) ([]byte, error) {
	key, err := os.ReadFile(path)
	if err == nil {
		if len(key) != KeySize {
			return nil, fmt.Errorf("twofactor: %s is not a %d-byte key", path, KeySize)
		}
		return key, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	key = make([]byte, KeySize)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) { // created concurrently: use theirs
			return LoadOrCreateKey(path)
		}
		return nil, err
	}
	if _, err := f.Write(key); err != nil {
		_ = f.Close()
		return nil, err
	}
	return key, f.Close()
}
