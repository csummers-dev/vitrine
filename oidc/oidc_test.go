package oidc

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type fakeIdP struct {
	t      *testing.T
	srv    *httptest.Server
	mu     sync.Mutex
	rsa    *rsa.PrivateKey
	kid    string
	ec     *ecdsa.PrivateKey
	codes  map[string]string // code -> PKCE challenge
	claims jwt.MapClaims
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()
	rk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	ek, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeIdP{t: t, rsa: rk, kid: "k1", ec: ek, codes: map[string]string{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 f.srv.URL,
			"authorization_endpoint": f.srv.URL + "/authorize",
			"token_endpoint":         f.srv.URL + "/token",
			"jwks_uri":               f.srv.URL + "/jwks",
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		b := func(i *big.Int) string { return base64.RawURLEncoding.EncodeToString(i.Bytes()) }
		ecPub, _ := f.ec.PublicKey.ECDH()
		raw := ecPub.Bytes() // 0x04 || X || Y
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{
			{"kty": "RSA", "kid": f.kid, "use": "sig", "n": b(f.rsa.N), "e": b(big.NewInt(int64(f.rsa.E)))},
			{
				"kty": "EC", "kid": "ec1", "crv": "P-256",
				"x": base64.RawURLEncoding.EncodeToString(raw[1:33]),
				"y": base64.RawURLEncoding.EncodeToString(raw[33:]),
			},
			{"kty": "oct", "kid": "junk"},
		}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		user, pass, _ := r.BasicAuth()
		f.mu.Lock()
		ch, ok := f.codes[r.Form.Get("code")]
		delete(f.codes, r.Form.Get("code"))
		claims := f.claims
		f.mu.Unlock()
		if !ok || user != "vitrine" || pass != "s3cret" || Challenge(r.Form.Get("code_verifier")) != ch {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id_token": f.sign(claims, "RS256")})
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeIdP) sign(c jwt.MapClaims, alg string) string {
	var tok *jwt.Token
	var key any
	if alg == "ES256" {
		tok = jwt.NewWithClaims(jwt.SigningMethodES256, c)
		tok.Header["kid"] = "ec1"
		key = f.ec
	} else {
		tok = jwt.NewWithClaims(jwt.SigningMethodRS256, c)
		f.mu.Lock()
		tok.Header["kid"] = f.kid
		key = f.rsa
		f.mu.Unlock()
	}
	s, err := tok.SignedString(key)
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}

func (f *fakeIdP) baseClaims(nonce string) jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss": f.srv.URL, "aud": "vitrine", "sub": "u1", "nonce": nonce,
		"preferred_username": "cory", "groups": []string{"family", "admins"},
		"iat": now.Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	}
}

func TestFlowAndVerify(t *testing.T) {
	idp := newFakeIdP(t)
	p := NewProvider(Config{Issuer: idp.srv.URL, ClientID: "vitrine", ClientSecret: "s3cret"}, nil)
	ctx := context.Background()

	verifier, err := RandomString(32)
	if err != nil {
		t.Fatal(err)
	}
	u, err := p.AuthURL(ctx, "https://files.example/api/auth/oidc/callback", "st", "n1", verifier)
	if err != nil {
		t.Fatal(err)
	}
	q, _ := url.ParseQuery(u[strings.Index(u, "?")+1:])
	if q.Get("code_challenge") != Challenge(verifier) || q.Get("code_challenge_method") != "S256" ||
		q.Get("scope") != "openid profile email" || q.Get("state") != "st" || q.Get("nonce") != "n1" {
		t.Fatalf("auth URL = %s", u)
	}

	idp.mu.Lock()
	idp.codes["c1"] = Challenge(verifier)
	idp.claims = idp.baseClaims("n1")
	idp.mu.Unlock()
	raw, err := p.Exchange(ctx, "c1", verifier, "https://files.example/api/auth/oidc/callback")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := p.Verify(ctx, raw, "n1")
	if err != nil {
		t.Fatal(err)
	}
	if StringClaim(claims, "preferred_username") != "cory" || !HasGroup(claims, "groups", "admins") || HasGroup(claims, "groups", "x") {
		t.Errorf("claims = %v", claims)
	}

	// A code works once, and only with its verifier.
	if _, err := p.Exchange(ctx, "c1", verifier, "x"); err == nil {
		t.Error("code reused")
	}
	idp.mu.Lock()
	idp.codes["c2"] = Challenge(verifier)
	idp.mu.Unlock()
	if _, err := p.Exchange(ctx, "c2", "wrong-verifier", "x"); err == nil {
		t.Error("PKCE verifier not checked")
	}
}

func TestVerifyRejects(t *testing.T) {
	idp := newFakeIdP(t)
	p := NewProvider(Config{Issuer: idp.srv.URL, ClientID: "vitrine"}, nil)
	ctx := context.Background()
	mod := func(f func(jwt.MapClaims)) string {
		c := idp.baseClaims("n1")
		f(c)
		return idp.sign(c, "RS256")
	}
	cases := []struct{ name, raw string }{
		{"wrong nonce", mod(func(c jwt.MapClaims) { c["nonce"] = "other" })},
		{"wrong audience", mod(func(c jwt.MapClaims) { c["aud"] = "someone-else" })},
		{"wrong issuer", mod(func(c jwt.MapClaims) { c["iss"] = "https://evil.example" })},
		{"expired", mod(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() })},
		{"no expiry", mod(func(c jwt.MapClaims) { delete(c, "exp") })},
		{"other azp", mod(func(c jwt.MapClaims) { c["aud"] = []string{"vitrine", "x"}; c["azp"] = "x" })},
	}
	for _, c := range cases {
		if _, err := p.Verify(ctx, c.raw, "n1"); err == nil {
			t.Errorf("%s: accepted", c.name)
		}
	}
	// HS256 signed with the public modulus as the secret (alg confusion).
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, idp.baseClaims("n1"))
	hs.Header["kid"] = "k1"
	forged, _ := hs.SignedString(idp.rsa.N.Bytes())
	if _, err := p.Verify(ctx, forged, "n1"); err == nil {
		t.Error("HS256 token accepted")
	}
	none := jwt.NewWithClaims(jwt.SigningMethodNone, idp.baseClaims("n1"))
	unsigned, _ := none.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if _, err := p.Verify(ctx, unsigned, "n1"); err == nil {
		t.Error("unsigned token accepted")
	}
	if _, err := p.Verify(ctx, idp.sign(idp.baseClaims("n1"), "ES256"), "n1"); err != nil {
		t.Errorf("ES256: %v", err)
	}
	if _, err := p.Verify(ctx, idp.sign(idp.baseClaims("n1"), "RS256"), ""); err == nil {
		t.Error("empty expected nonce accepted")
	}
}

func TestKeyRotation(t *testing.T) {
	idp := newFakeIdP(t)
	p := NewProvider(Config{Issuer: idp.srv.URL, ClientID: "vitrine"}, nil)
	clock := time.Now()
	p.now = func() time.Time { return clock }
	ctx := context.Background()
	if _, err := p.Verify(ctx, idp.sign(idp.baseClaims("n"), "RS256"), "n"); err != nil {
		t.Fatal(err)
	}
	nk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	idp.mu.Lock()
	idp.rsa, idp.kid = nk, "k2"
	idp.mu.Unlock()
	raw := idp.sign(idp.baseClaims("n"), "RS256")
	if _, err := p.Verify(ctx, raw, "n"); err == nil {
		t.Error("unknown kid accepted without a refetch")
	}
	clock = clock.Add(keysMinRefetch + time.Second)
	if _, err := p.Verify(ctx, raw, "n"); err != nil {
		t.Errorf("after rotation: %v", err)
	}
}

func TestDiscoveryIssuerMismatch(t *testing.T) {
	idp := newFakeIdP(t)
	p := NewProvider(Config{Issuer: idp.srv.URL + "/", ClientID: "vitrine"}, nil)
	if _, err := p.Discover(context.Background()); err == nil {
		t.Error("issuer mismatch accepted")
	}
}

func TestPublicKeyRejectsBadEC(t *testing.T) {
	k := jwk{Kty: "EC", Crv: "P-256", X: "AQ", Y: "AQ"}
	if _, err := k.publicKey(); err == nil {
		t.Error("point (1,1) accepted")
	}
	small := jwk{Kty: "RSA", N: "AQAB", E: "AQAB"}
	if _, err := small.publicKey(); err == nil {
		t.Error("tiny RSA key accepted")
	}
}
