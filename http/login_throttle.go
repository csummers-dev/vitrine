package fbhttp

import (
	"sync"
	"time"
)

// loginThrottle is a small in-memory, per-client login rate limiter that blunts
// online password guessing (audit SEC-001). After loginMaxFailures failed
// attempts from one client within loginFailureWindow, further attempts are
// rejected (HTTP 429 + Retry-After) for loginLockout. A successful login clears
// the client's record.
//
// Keyed by the request's real client IP (realip — the same source the audit log
// uses), which is reliable behind a trusted reverse proxy (the common
// deployment). A directly-exposed instance can still be sprayed across spoofed
// X-Forwarded-For values; bcrypt's per-guess cost remains the backstop there.
const (
	loginMaxFailures   = 5
	loginFailureWindow = 15 * time.Minute
	loginLockout       = 5 * time.Minute
	loginThrottleCap   = 4096 // sweep stale entries once this many clients are tracked
)

type loginAttempt struct {
	failures    int
	windowStart time.Time
	lockedUntil time.Time
}

type loginThrottle struct {
	mu  sync.Mutex
	m   map[string]*loginAttempt
	now func() time.Time // injectable for tests
}

func newLoginThrottle() *loginThrottle {
	return &loginThrottle{m: make(map[string]*loginAttempt), now: time.Now}
}

// retryAfter returns the remaining lockout for key, or 0 if attempts are allowed.
func (t *loginThrottle) retryAfter(key string) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()
	a := t.m[key]
	if a == nil {
		return 0
	}
	if d := a.lockedUntil.Sub(t.now()); d > 0 {
		return d
	}
	return 0
}

// fail records a failed attempt for key, arming a lockout once the failure
// threshold is reached within the window.
func (t *loginThrottle) fail(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	a := t.m[key]
	if a == nil || now.Sub(a.windowStart) > loginFailureWindow {
		a = &loginAttempt{windowStart: now}
		t.m[key] = a
	}
	a.failures++
	if a.failures >= loginMaxFailures {
		a.lockedUntil = now.Add(loginLockout)
		a.failures = 0
		a.windowStart = now
	}
	if len(t.m) > loginThrottleCap {
		t.sweepLocked(now)
	}
}

// succeed clears any failure record for key after a successful login.
func (t *loginThrottle) succeed(key string) {
	t.mu.Lock()
	delete(t.m, key)
	t.mu.Unlock()
}

// sweepLocked drops entries that are neither locked nor within their failure
// window. Caller holds mu.
func (t *loginThrottle) sweepLocked(now time.Time) {
	for k, a := range t.m {
		if a.lockedUntil.Before(now) && now.Sub(a.windowStart) > loginFailureWindow {
			delete(t.m, k)
		}
	}
}

// loginThrottler is the process-wide login limiter, consulted by loginHandler.
var loginThrottler = newLoginThrottle()
