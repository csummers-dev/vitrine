package twofactor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// RFC 6238 appendix B test vectors (SHA-1, secret "12345678901234567890").
func TestCodeRFC6238(t *testing.T) {
	secret := b32.EncodeToString([]byte("12345678901234567890"))
	cases := map[int64]string{
		59:          "287082",
		1111111109:  "081804",
		1111111111:  "050471",
		1234567890:  "005924",
		2000000000:  "279037",
		20000000000: "353130",
	}
	for unix, want := range cases {
		got, err := Code(secret, time.Unix(unix, 0))
		if err != nil || got != want {
			t.Errorf("Code(%d) = %q, %v; want %q", unix, got, err, want)
		}
	}
}

func TestValidateSkewAndReplay(t *testing.T) {
	secret, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_800_000_000, 0)
	prev, _ := Code(secret, now.Add(-Period))
	cur, _ := Code(secret, now)
	old, _ := Code(secret, now.Add(-3*Period))

	st, ok := Validate(secret, prev, now, 0)
	if !ok {
		t.Fatal("previous step should pass (clock skew)")
	}
	if _, ok := Validate(secret, prev, now, st); ok {
		t.Error("a code must not be accepted twice")
	}
	if _, ok := Validate(secret, cur[:3]+" "+cur[3:], now, st); !ok {
		t.Error("current code with a space should pass")
	}
	if _, ok := Validate(secret, old, now, 0); ok && old != cur && old != prev {
		t.Error("a code three steps old should fail")
	}
	if _, ok := Validate(secret, "12345", now, 0); ok {
		t.Error("short code accepted")
	}
}

func TestURI(t *testing.T) {
	u := URI("vitrine", "cory", "ABC")
	if !strings.HasPrefix(u, "otpauth://totp/vitrine:cory?") || !strings.Contains(u, "secret=ABC") || !strings.Contains(u, "issuer=vitrine") {
		t.Errorf("URI = %q", u)
	}
}

func TestSealer(t *testing.T) {
	key := make([]byte, KeySize)
	key[0] = 1
	s, err := NewSealer(key)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := s.Seal("JBSWY3DPEHPK3PXP")
	if err != nil || strings.Contains(sealed, "JBSWY3DP") {
		t.Fatalf("sealed = %q, %v", sealed, err)
	}
	if got, err := s.Open(sealed); err != nil || got != "JBSWY3DPEHPK3PXP" {
		t.Fatalf("Open = %q, %v", got, err)
	}
	key[0] = 2
	other, _ := NewSealer(key)
	if _, err := other.Open(sealed); err == nil {
		t.Error("wrong key opened the secret")
	}
	if _, err := NewSealer(key[:16]); err == nil {
		t.Error("short key accepted")
	}
}

func TestLoadOrCreateKey(t *testing.T) {
	p := filepath.Join(t.TempDir(), "2fa.key")
	k1, err := LoadOrCreateKey(p)
	if err != nil || len(k1) != KeySize {
		t.Fatalf("create: %v", err)
	}
	if fi, _ := os.Stat(p); fi.Mode().Perm() != 0o600 {
		t.Errorf("mode = %v", fi.Mode().Perm())
	}
	k2, err := LoadOrCreateKey(p)
	if err != nil || string(k1) != string(k2) {
		t.Fatal("reload returned a different key")
	}
	_ = os.WriteFile(p, []byte("short"), 0o600)
	if _, err := LoadOrCreateKey(p); err == nil {
		t.Error("a damaged key file must not be used")
	}
}

func TestRecoveryCodes(t *testing.T) {
	r := &Factor{}
	codes, err := r.NewRecoveryCodes()
	if err != nil || len(codes) != RecoveryCodeCount || len(r.Recovery) != RecoveryCodeCount {
		t.Fatalf("codes = %v, %v", codes, err)
	}
	if strings.Contains(strings.Join(r.Recovery, ""), codes[0]) {
		t.Error("plain codes must not be stored")
	}
	if !r.UseRecoveryCode(strings.ToLower(strings.ReplaceAll(codes[3], "-", " "))) {
		t.Fatal("recovery code (lower case, spaces) rejected")
	}
	if r.UseRecoveryCode(codes[3]) {
		t.Error("recovery code used twice")
	}
	if len(r.Recovery) != RecoveryCodeCount-1 {
		t.Errorf("left = %d", len(r.Recovery))
	}
	if r.UseRecoveryCode("AAAAA-AAAAA") {
		t.Error("made-up code accepted")
	}
}

func TestChallenge(t *testing.T) {
	key := []byte("server-signing-key")
	now := time.Unix(1_800_000_000, 0)
	tok, err := IssueChallenge(key, 42, now)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := ParseChallenge(key, tok, now.Add(4*time.Minute)); err != nil || id != 42 {
		t.Fatalf("parse = %d, %v", id, err)
	}
	if _, err := ParseChallenge(key, tok, now.Add(6*time.Minute)); err == nil {
		t.Error("expired challenge accepted")
	}
	if _, err := ParseChallenge([]byte("other"), tok, now); err == nil {
		t.Error("challenge signed with another key accepted")
	}
	if _, err := ParseChallenge(key, tok[:len(tok)-2]+"AA", now); err == nil {
		t.Error("tampered challenge accepted")
	}
}
