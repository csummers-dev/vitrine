package webhooks

import (
	"strings"
	"testing"
	"time"
)

func TestSignAndVerify(t *testing.T) {
	at := time.Unix(1_800_000_000, 0)
	body := []byte(`{"event":"file.created"}`)
	sig := Sign("whsec_test", at, body)
	if !strings.HasPrefix(sig, "t=1800000000,v1=") || len(sig) != len("t=1800000000,v1=")+64 {
		t.Fatalf("signature = %q", sig)
	}
	if !Verify("whsec_test", sig, body, at.Add(time.Minute), 5*time.Minute) {
		t.Error("valid signature rejected")
	}
	if Verify("whsec_other", sig, body, at, 5*time.Minute) {
		t.Error("wrong secret accepted")
	}
	if Verify("whsec_test", sig, []byte(`{"event":"file.deleted"}`), at, 5*time.Minute) {
		t.Error("tampered body accepted")
	}
	if Verify("whsec_test", sig, body, at.Add(10*time.Minute), 5*time.Minute) {
		t.Error("stale signature accepted")
	}
	if Verify("whsec_test", "garbage", body, at, time.Minute) {
		t.Error("malformed header accepted")
	}
}

// A known answer (also produced by Python's hmac module), so receivers in
// other languages can check their verification code.
func TestSignKnownAnswer(t *testing.T) {
	got := Sign("whsec_test", time.Unix(1_800_000_000, 0), []byte(`{"event":"file.created"}`))
	const want = "t=1800000000,v1=43ce8a3045b37197185433e444d4130710279967d2d869cfc0d5788bc1a0e076"
	if got != want {
		t.Errorf("Sign = %q, want %q", got, want)
	}
}

func TestNewSecret(t *testing.T) {
	a, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewSecret()
	if !strings.HasPrefix(a, "whsec_") || len(a) != len("whsec_")+64 || a == b {
		t.Errorf("secrets %q, %q", a, b)
	}
}

func TestPathMatches(t *testing.T) {
	cases := []struct {
		prefixes []string
		paths    []string
		want     bool
	}{
		{nil, []string{"/x"}, true},
		{[]string{"/Movies"}, []string{"/Movies/a.mkv"}, true},
		{[]string{"Movies/"}, []string{"/Movies"}, true},
		{[]string{"/Movies"}, []string{"/MoviesOld/a.mkv"}, false},
		{[]string{"/Movies", "/TV"}, []string{"/Downloads/x", "/TV/s01e01.mkv"}, true},
		{[]string{"/"}, []string{"/anything"}, true},
		{[]string{"/Movies"}, []string{""}, false},
	}
	for _, c := range cases {
		if got := pathMatches(c.prefixes, c.paths...); got != c.want {
			t.Errorf("pathMatches(%v, %v) = %v, want %v", c.prefixes, c.paths, got, c.want)
		}
	}
}

func TestJellyfinRequest(t *testing.T) {
	r, err := jellyfinRequest("http://jf.lan:8096/", "k3y", false)
	if err != nil {
		t.Fatal(err)
	}
	if r.Method != "POST" || r.URL.String() != "http://jf.lan:8096/Library/Refresh" {
		t.Errorf("refresh = %s %s", r.Method, r.URL)
	}
	if r.Header.Get("Authorization") != `MediaBrowser Token="k3y"` || r.Header.Get("X-Emby-Token") != "k3y" {
		t.Errorf("headers = %v", r.Header)
	}
	r, _ = jellyfinRequest("http://jf.lan:8096", "k3y", true)
	if r.Method != "GET" || r.URL.Path != "/System/Info" {
		t.Errorf("test = %s %s", r.Method, r.URL)
	}
}
