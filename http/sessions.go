package fbhttp

import (
	"net/http"
	"time"
)

// sessionsRevokeOthersHandler implements "sign out everywhere" (v1.3
// S8-3). It bumps the caller's per-user session epoch
// (`User.SessionsRevokedAt`) to now, so every JWT issued earlier — on any
// other device — is rejected by `withUser` on its next request. It then
// re-issues a fresh token for the CALLER (IssuedAt == now, which survives
// the strictly-less-than epoch check) so the current device stays signed
// in seamlessly. No per-session store, no blocklist.
func sessionsRevokeOthersHandler(tokenExpireTime time.Duration) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		d.user.SessionsRevokedAt = time.Now().Unix()
		if err := d.store.Users.Update(d.user, "SessionsRevokedAt"); err != nil {
			return http.StatusInternalServerError, err
		}
		// Returns the new signed token in the response body (text/plain),
		// same shape as /api/renew — the client swaps it in.
		return printToken(w, r, d, d.user, tokenExpireTime)
	})
}
