package users

import (
	"errors"
	"testing"

	fberrors "github.com/csummers-dev/vitrine/v3/errors"
)

func TestValidateAndHashPwd_RejectsShort(t *testing.T) {
	_, err := ValidateAndHashPwd("ab", 8)
	var short fberrors.ErrShortPassword
	if !errors.As(err, &short) {
		t.Fatalf("expected ErrShortPassword, got %v", err)
	}
}

func TestValidateAndHashPwd_RejectsCommon(t *testing.T) {
	// "password" is in the bundled NCSC common-password list, so it's rejected
	// even though it satisfies the length requirement.
	_, err := ValidateAndHashPwd("password", 4)
	if !errors.Is(err, fberrors.ErrEasyPassword) {
		t.Fatalf("expected ErrEasyPassword, got %v", err)
	}
}

func TestValidateAndHashPwd_HashesAcceptable(t *testing.T) {
	const pw = "a-Str0ng-Uncommon-passphrase!"
	hash, err := ValidateAndHashPwd(pw, 8)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hash == pw {
		t.Fatal("password must not be stored in plaintext")
	}
	if !CheckPwd(pw, hash) {
		t.Fatal("CheckPwd rejected the password it just hashed")
	}
}

func TestCheckPwd(t *testing.T) {
	hash, err := HashPwd("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPwd: %v", err)
	}
	if !CheckPwd("correct horse battery staple", hash) {
		t.Error("should accept the correct password")
	}
	if CheckPwd("wrong password", hash) {
		t.Error("should reject an incorrect password")
	}
	if CheckPwd("anything", "not-a-valid-bcrypt-hash") {
		t.Error("should reject against a malformed hash, not error out as a match")
	}
}

func TestRandomPwd(t *testing.T) {
	a, err := RandomPwd(16)
	if err != nil {
		t.Fatalf("RandomPwd: %v", err)
	}
	b, _ := RandomPwd(16)
	if a == "" {
		t.Fatal("RandomPwd returned an empty string")
	}
	if a == b {
		t.Error("two RandomPwd calls should not collide")
	}
}
