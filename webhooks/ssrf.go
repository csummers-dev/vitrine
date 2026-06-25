package webhooks

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

// errBlockedWebhookAddr is returned when a webhook target resolves to a
// non-routable / internal address (audit SEC-002: SSRF defense).
var errBlockedWebhookAddr = errors.New(
	"webhook: refusing to connect to a private/loopback/link-local address (SSRF guard)")

// isBlockedIP reports whether ip is in a range a webhook must never reach:
// loopback, private (RFC1918 / ULA), link-local — which includes the
// cloud-metadata address 169.254.169.254 — the unspecified address, or
// multicast. Only globally-routable unicast targets are allowed.
func isBlockedIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast()
}

// ssrfGuardDisabled relaxes the dial guard so tests can reach a loopback
// httptest server. Never set in production; isBlockedIP is covered directly by
// TestIsBlockedIP.
var ssrfGuardDisabled bool

// guardedDialContext wraps a net.Dialer so a connection is refused when its
// resolved address is internal. The check runs AFTER DNS resolution and then
// dials the vetted IP directly (not the hostname), which closes the
// DNS-rebinding window a create-time URL check can't — and every redirect hop
// re-enters this dialer, so an external endpoint can't 3xx us inward either.
func guardedDialContext(d *net.Dialer) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			if !ssrfGuardDisabled && isBlockedIP(ip) {
				return nil, errBlockedWebhookAddr
			}
		}
		var firstErr error
		for _, ip := range ips {
			conn, derr := d.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if derr == nil {
				return conn, nil
			}
			firstErr = derr
		}
		return nil, firstErr
	}
}

// newGuardedHTTPClient builds the webhook delivery client with the SSRF dialer.
func newGuardedHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: timeout}
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext:         guardedDialContext(dialer),
			TLSHandshakeTimeout: timeout,
			ForceAttemptHTTP2:   true,
		},
	}
}
