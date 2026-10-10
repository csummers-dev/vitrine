// Package oidc is a small OpenID Connect relying party for vitrine's single
// sign-on (4.0 Phase 4.5): discovery, the authorization-code flow with PKCE,
// and ID-token verification against the provider's published keys.
//
// It depends only on the standard library and golang-jwt (already used for
// vitrine's own tokens). Supported signing algorithms: RS256/384/512,
// PS256/384/512 and ES256/384/512.
package oidc

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Config describes the relying party.
type Config struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	// Scopes defaults to openid, profile, email (and groups when a groups
	// claim is wanted, see GroupsScope).
	Scopes []string
}

// Discovery is the part of the provider metadata vitrine uses.
type Discovery struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
}

// Provider talks to one OpenID provider. It caches discovery and keys.
type Provider struct {
	cfg    Config
	client *http.Client
	now    func() time.Time

	mu        sync.Mutex
	disc      *Discovery
	discAt    time.Time
	keys      map[string]any
	keysAt    time.Time
	lastFetch time.Time
}

const (
	discoveryTTL   = time.Hour
	keysTTL        = time.Hour
	keysMinRefetch = 30 * time.Second
	maxBody        = 1 << 20
)

// NewProvider returns a Provider for cfg. client may be nil.
func NewProvider(cfg Config, client *http.Client) *Provider {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = []string{"openid", "profile", "email"}
	}
	if !slices.Contains(cfg.Scopes, "openid") {
		cfg.Scopes = append([]string{"openid"}, cfg.Scopes...)
	}
	return &Provider{cfg: cfg, client: client, now: time.Now}
}

func (p *Provider) getJSON(ctx context.Context, u string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, http.NoBody)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("oidc: GET %s: %s", u, res.Status)
	}
	return json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(v)
}

// Discover fetches (or returns cached) provider metadata. The issuer it
// reports must match the configured one exactly.
func (p *Provider) Discover(ctx context.Context) (*Discovery, error) {
	p.mu.Lock()
	if p.disc != nil && p.now().Sub(p.discAt) < discoveryTTL {
		d := p.disc
		p.mu.Unlock()
		return d, nil
	}
	p.mu.Unlock()

	var d Discovery
	wellKnown := strings.TrimRight(p.cfg.Issuer, "/") + "/.well-known/openid-configuration"
	if err := p.getJSON(ctx, wellKnown, &d); err != nil {
		return nil, err
	}
	if d.Issuer != p.cfg.Issuer {
		return nil, fmt.Errorf("oidc: provider says its issuer is %q, configured %q", d.Issuer, p.cfg.Issuer)
	}
	if d.AuthorizationEndpoint == "" || d.TokenEndpoint == "" || d.JWKSURI == "" {
		return nil, errors.New("oidc: provider metadata is incomplete")
	}
	p.mu.Lock()
	p.disc, p.discAt = &d, p.now()
	p.mu.Unlock()
	return &d, nil
}

// ── PKCE, state and nonce ────────────────────────────────────────────

// RandomString returns n random bytes, base64url without padding.
func RandomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Challenge is the S256 PKCE challenge for verifier.
func Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// AuthURL is where to send the browser to sign in.
func (p *Provider) AuthURL(ctx context.Context, redirectURI, state, nonce, verifier string) (string, error) {
	d, err := p.Discover(ctx)
	if err != nil {
		return "", err
	}
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", p.cfg.ClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", strings.Join(p.cfg.Scopes, " "))
	q.Set("state", state)
	q.Set("nonce", nonce)
	q.Set("code_challenge", Challenge(verifier))
	q.Set("code_challenge_method", "S256")
	sep := "?"
	if strings.Contains(d.AuthorizationEndpoint, "?") {
		sep = "&"
	}
	return d.AuthorizationEndpoint + sep + q.Encode(), nil
}

// Exchange trades an authorization code for the ID token.
func (p *Provider) Exchange(ctx context.Context, code, verifier, redirectURI string) (string, error) {
	d, err := p.Discover(ctx)
	if err != nil {
		return "", err
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("code_verifier", verifier)
	form.Set("client_id", p.cfg.ClientID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if p.cfg.ClientSecret != "" {
		req.SetBasicAuth(url.QueryEscape(p.cfg.ClientID), url.QueryEscape(p.cfg.ClientSecret))
	}
	res, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var body struct {
		IDToken string `json:"id_token"`
		Error   string `json:"error"`
		Desc    string `json:"error_description"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(&body); err != nil {
		return "", fmt.Errorf("oidc: token response: %w", err)
	}
	if res.StatusCode != http.StatusOK || body.Error != "" {
		return "", fmt.Errorf("oidc: token endpoint: %s %s %s", res.Status, body.Error, body.Desc)
	}
	if body.IDToken == "" {
		return "", errors.New("oidc: no id_token in the token response")
	}
	return body.IDToken, nil
}

// ── ID token verification ───────────────────────────────────────────

var allowedAlgs = []string{"RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"}

// Verify checks an ID token's signature, issuer, audience, expiry and
// nonce, and returns its claims.
func (p *Provider) Verify(ctx context.Context, raw, nonce string) (jwt.MapClaims, error) {
	if _, err := p.Discover(ctx); err != nil {
		return nil, err
	}
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return p.key(ctx, kid)
	},
		jwt.WithValidMethods(allowedAlgs),
		jwt.WithIssuer(p.cfg.Issuer),
		jwt.WithAudience(p.cfg.ClientID),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(time.Minute),
		jwt.WithTimeFunc(p.now),
	)
	if err != nil {
		return nil, fmt.Errorf("oidc: id token: %w", err)
	}
	// With several audiences, the token must be meant for us (azp).
	if aud, ok := claims["aud"].([]any); ok && len(aud) > 1 {
		if azp, _ := claims["azp"].(string); azp != p.cfg.ClientID {
			return nil, errors.New("oidc: id token: azp is not this client")
		}
	}
	if got, _ := claims["nonce"].(string); nonce == "" || got != nonce {
		return nil, errors.New("oidc: id token: nonce mismatch")
	}
	return claims, nil
}

// key returns the verification key for kid, refreshing the JWKS when the
// kid is unknown (key rotation), at most every keysMinRefetch.
func (p *Provider) key(ctx context.Context, kid string) (any, error) {
	p.mu.Lock()
	k, ok := p.keys[kid]
	fresh := p.now().Sub(p.keysAt) < keysTTL
	canFetch := p.now().Sub(p.lastFetch) >= keysMinRefetch
	if !ok && kid == "" && len(p.keys) == 1 {
		for _, only := range p.keys {
			k, ok = only, true
		}
	}
	p.mu.Unlock()
	if ok && fresh {
		return k, nil
	}
	if !canFetch && ok {
		return k, nil
	}
	if !canFetch {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	if err := p.fetchKeys(ctx); err != nil {
		if ok {
			return k, nil
		}
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if k, ok := p.keys[kid]; ok {
		return k, nil
	}
	if kid == "" && len(p.keys) == 1 {
		for _, only := range p.keys {
			return only, nil
		}
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (p *Provider) fetchKeys(ctx context.Context) error {
	d, err := p.Discover(ctx)
	if err != nil {
		return err
	}
	p.mu.Lock()
	p.lastFetch = p.now()
	p.mu.Unlock()
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := p.getJSON(ctx, d.JWKSURI, &set); err != nil {
		return err
	}
	keys := map[string]any{}
	for _, k := range set.Keys {
		if k.Use != "" && k.Use != "sig" {
			continue
		}
		pub, err := k.publicKey()
		if err != nil {
			continue // skip keys we can't use rather than failing all
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return errors.New("oidc: provider published no usable signing keys")
	}
	p.mu.Lock()
	p.keys, p.keysAt = keys, p.now()
	p.mu.Unlock()
	return nil
}

func b64int(s string) (*big.Int, error) {
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(b), nil
}

func (k jwk) publicKey() (any, error) {
	switch k.Kty {
	case "RSA":
		n, err := b64int(k.N)
		if err != nil {
			return nil, err
		}
		e, err := b64int(k.E)
		if err != nil || !e.IsInt64() {
			return nil, errors.New("bad RSA exponent")
		}
		if n.BitLen() < 2048 {
			return nil, errors.New("RSA key too small")
		}
		return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
	case "EC":
		var (
			curve elliptic.Curve
			ec    ecdh.Curve
		)
		switch k.Crv {
		case "P-256":
			curve, ec = elliptic.P256(), ecdh.P256()
		case "P-384":
			curve, ec = elliptic.P384(), ecdh.P384()
		case "P-521":
			curve, ec = elliptic.P521(), ecdh.P521()
		default:
			return nil, fmt.Errorf("unsupported curve %q", k.Crv)
		}
		x, err := b64int(k.X)
		if err != nil {
			return nil, err
		}
		y, err := b64int(k.Y)
		if err != nil {
			return nil, err
		}
		// crypto/ecdh rejects points that aren't on the curve.
		size := (curve.Params().BitSize + 7) / 8
		if len(x.Bytes()) > size || len(y.Bytes()) > size {
			return nil, errors.New("EC coordinates too large")
		}
		point := make([]byte, 1+2*size)
		point[0] = 4
		x.FillBytes(point[1 : 1+size])
		y.FillBytes(point[1+size:])
		if _, err := ec.NewPublicKey(point); err != nil {
			return nil, fmt.Errorf("bad EC key: %w", err)
		}
		return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
	}
	return nil, fmt.Errorf("unsupported key type %q", k.Kty)
}

// ── Claims helpers ──────────────────────────────────────────────────

// StringClaim returns a string claim, or "".
func StringClaim(c jwt.MapClaims, name string) string {
	s, _ := c[name].(string)
	return s
}

// HasGroup reports whether the groups claim (a list of strings, or a
// single string) contains group.
func HasGroup(c jwt.MapClaims, claim, group string) bool {
	switch v := c[claim].(type) {
	case string:
		return v == group
	case []any:
		for _, g := range v {
			if s, _ := g.(string); s == group {
				return true
			}
		}
	}
	return false
}
