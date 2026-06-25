package fbhttp

import (
	"testing"
	"time"
)

// TestLoginThrottle is the security-regression test for the login rate limiter
// (audit SEC-001): it must lock out a client after the failure threshold,
// isolate clients from each other, expire the lockout, reset on success, and
// never accumulate stale (out-of-window) failures into a lockout.
func TestLoginThrottle(t *testing.T) {
	const ip = "203.0.113.5"
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	t.Run("locks out after threshold failures", func(t *testing.T) {
		cur := base
		th := newLoginThrottle()
		th.now = func() time.Time { return cur }

		// Up to the threshold-1, the client is still allowed.
		for i := 0; i < loginMaxFailures-1; i++ {
			th.fail(ip)
			if d := th.retryAfter(ip); d != 0 {
				t.Fatalf("locked out too early after %d failures: retryAfter=%v", i+1, d)
			}
		}
		// The threshold failure arms the lockout.
		th.fail(ip)
		if d := th.retryAfter(ip); d <= 0 {
			t.Fatalf("expected lockout after %d failures, got retryAfter=%v", loginMaxFailures, d)
		}
		// An unrelated client is unaffected.
		if d := th.retryAfter("198.51.100.9"); d != 0 {
			t.Fatalf("unrelated IP should not be locked: %v", d)
		}
	})

	t.Run("lockout expires", func(t *testing.T) {
		cur := base
		th := newLoginThrottle()
		th.now = func() time.Time { return cur }
		for i := 0; i < loginMaxFailures; i++ {
			th.fail(ip)
		}
		if th.retryAfter(ip) <= 0 {
			t.Fatal("expected lockout")
		}
		cur = cur.Add(loginLockout + time.Second)
		if d := th.retryAfter(ip); d != 0 {
			t.Fatalf("expected lockout to expire, got retryAfter=%v", d)
		}
	})

	t.Run("success clears the failure count", func(t *testing.T) {
		cur := base
		th := newLoginThrottle()
		th.now = func() time.Time { return cur }
		for i := 0; i < loginMaxFailures-1; i++ {
			th.fail(ip)
		}
		th.succeed(ip)
		// After a success, it takes a fresh full set of failures to lock again.
		for i := 0; i < loginMaxFailures-1; i++ {
			th.fail(ip)
		}
		if d := th.retryAfter(ip); d != 0 {
			t.Fatalf("succeed() should have reset the count, got retryAfter=%v", d)
		}
	})

	t.Run("stale failures outside the window do not lock out", func(t *testing.T) {
		cur := base
		th := newLoginThrottle()
		th.now = func() time.Time { return cur }
		for i := 0; i < loginMaxFailures+2; i++ {
			th.fail(ip)
			cur = cur.Add(loginFailureWindow + time.Second) // each failure in a fresh window
		}
		if d := th.retryAfter(ip); d != 0 {
			t.Fatalf("window-expired failures should not lock out, got retryAfter=%v", d)
		}
	})
}
