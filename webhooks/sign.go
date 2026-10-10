package webhooks

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// SignatureHeader carries the HMAC signature of a delivery (4.0 Phase 4.3).
const SignatureHeader = "X-Vitrine-Signature"

// Sign returns the signature header value for body sent at t:
//
//	t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
//
// Receivers recompute the HMAC over the same string and compare in constant
// time, and reject old timestamps to stop replays.
func Sign(secret string, t time.Time, body []byte) string {
	ts := strconv.FormatInt(t.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	return "t=" + ts + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

// Verify checks a signature header against body, allowing tolerance between
// the signed time and now. It exists for tests and for Go receivers.
func Verify(secret, header string, body []byte, now time.Time, tolerance time.Duration) bool {
	var ts, sig string
	for _, part := range strings.Split(header, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch k {
		case "t":
			ts = v
		case "v1":
			sig = v
		}
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || sig == "" {
		return false
	}
	at := time.Unix(sec, 0)
	if d := now.Sub(at); d > tolerance || d < -tolerance {
		return false
	}
	want := Sign(secret, at, body)
	return hmac.Equal([]byte(want), []byte("t="+ts+",v1="+sig))
}

// NewSecret returns a random signing secret.
func NewSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "whsec_" + hex.EncodeToString(b), nil
}

// pathMatches reports whether p is one of prefixes or inside one of them.
// No prefixes means everything matches.
func pathMatches(prefixes []string, paths ...string) bool {
	if len(prefixes) == 0 {
		return true
	}
	for _, pre := range prefixes {
		pre = "/" + strings.Trim(pre, "/")
		for _, p := range paths {
			if p == "" {
				continue
			}
			if pre == "/" || p == pre || strings.HasPrefix(p, pre+"/") {
				return true
			}
		}
	}
	return false
}

// Kinds of endpoint.
const (
	KindGeneric  = ""
	KindJellyfin = "jellyfin"
)

// JellyfinRefreshDelay is how long a Jellyfin endpoint waits after the first
// matching change before asking for a library scan; later changes in that
// window ride along, so scans run at most once per delay.
const JellyfinRefreshDelay = 60 * time.Second

// jellyfinRequest builds a request to a Jellyfin server: POST
// /Library/Refresh to scan, or GET /System/Info to test the connection.
func jellyfinRequest(baseURL, apiKey string, test bool) (*http.Request, error) {
	base := strings.TrimRight(baseURL, "/")
	method, path := http.MethodPost, "/Library/Refresh"
	if test {
		method, path = http.MethodGet, "/System/Info"
	}
	req, err := http.NewRequest(method, base+path, http.NoBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("MediaBrowser Token=%q", apiKey))
	req.Header.Set("X-Emby-Token", apiKey)
	return req, nil
}
