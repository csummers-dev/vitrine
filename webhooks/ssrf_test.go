package webhooks

import (
	"net"
	"testing"
)

// TestIsBlockedIP is the security-regression test for the webhook SSRF guard
// (audit SEC-002): internal/non-routable targets — including the cloud-metadata
// address — must be blocked, while public unicast addresses are allowed.
func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "::1", // loopback
		"169.254.169.254",     // cloud metadata (link-local)
		"10.0.0.5",            // RFC1918
		"192.168.1.1",         // RFC1918
		"172.16.0.1",          // RFC1918
		"fd00::1",             // ULA
		"0.0.0.0", "::",       // unspecified
		"224.0.0.1", "ff02::1", // multicast
	}
	allowed := []string{
		"8.8.8.8", "1.1.1.1", "93.184.216.34",
		"2606:2800:220:1:248:1893:25c8:1946",
	}
	for _, s := range blocked {
		if !isBlockedIP(net.ParseIP(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range allowed {
		if isBlockedIP(net.ParseIP(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
	if !isBlockedIP(nil) {
		t.Error("nil IP should be blocked")
	}
}
