package fbhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/tomasen/realip"

	"github.com/csummers-dev/vitrine/v4/auth"
	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/twofactor"
	"github.com/csummers-dev/vitrine/v4/users"
)

// Two-factor login (4.0 Phase 4.4). With TOTP enabled, POST /api/login
// answers 202 {"twoFactor":true,"challenge":…} instead of a token, and
// POST /api/login/2fa {challenge, code} finishes the login with a code from
// the authenticator app or a recovery code. Only password (json) logins
// use a second factor; proxy, hook and no-auth sign-ins are left to their
// own systems.

var (
	twoFactorMu     sync.RWMutex
	twoFactorSealer *twofactor.Sealer
)

// SetTwoFactorKey sets the key that encrypts TOTP secrets at rest (from
// twofactor.LoadOrCreateKey). Without it, two-factor setup is unavailable.
func SetTwoFactorKey(key []byte) error {
	s, err := twofactor.NewSealer(key)
	if err != nil {
		return err
	}
	twoFactorMu.Lock()
	twoFactorSealer = s
	twoFactorMu.Unlock()
	return nil
}

func sealer() *twofactor.Sealer {
	twoFactorMu.RLock()
	defer twoFactorMu.RUnlock()
	return twoFactorSealer
}

// twoFactorApplies reports whether logins on this server can use a second
// factor at all.
func twoFactorApplies(d *data) bool {
	return d.settings.AuthMethod == auth.MethodJSONAuth && sealer() != nil && d.store.TwoFactor != nil
}

type twoFactorStatus struct {
	Available     bool `json:"available"`
	Enabled       bool `json:"enabled"`
	RecoveryCodes int  `json:"recoveryCodesLeft"`
}

var twoFactorGetHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	st := twoFactorStatus{Available: twoFactorApplies(d)}
	if d.store.TwoFactor != nil {
		f, err := d.store.TwoFactor.Get(d.user.ID)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		if f != nil && f.Enabled {
			st.Enabled = true
			st.RecoveryCodes = len(f.Recovery)
		}
	}
	return renderJSON(w, r, st)
})

// POST /api/2fa/setup: a new pending secret, to scan and confirm.
var twoFactorSetupHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if !twoFactorApplies(d) {
		return http.StatusNotImplemented, nil
	}
	f, err := d.store.TwoFactor.Get(d.user.ID)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	if f != nil && f.Enabled {
		return http.StatusConflict, errors.New("two-factor sign-in is already on")
	}
	secret, err := twofactor.NewSecret()
	if err != nil {
		return http.StatusInternalServerError, err
	}
	sealed, err := sealer().Seal(secret)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	if err := d.store.TwoFactor.Save(&twofactor.Factor{UserID: d.user.ID, Secret: sealed}); err != nil {
		return http.StatusInternalServerError, err
	}
	return renderJSON(w, r, map[string]string{
		"secret": secret,
		"uri":    twofactor.URI("vitrine", d.user.Username, secret),
	})
})

type twoFactorCodeBody struct {
	Code     string `json:"code"`
	Password string `json:"password"`
}

func decodeTwoFactorBody(r *http.Request) (twoFactorCodeBody, error) {
	var b twoFactorCodeBody
	if r.Body == nil {
		return b, errors.New("empty body")
	}
	err := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 4096)).Decode(&b)
	return b, err
}

// POST /api/2fa/enable {code}: confirm the pending secret; returns the
// recovery codes, shown once.
var twoFactorEnableHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if !twoFactorApplies(d) {
		return http.StatusNotImplemented, nil
	}
	body, err := decodeTwoFactorBody(r)
	if err != nil {
		return http.StatusBadRequest, err
	}
	f, err := d.store.TwoFactor.Get(d.user.ID)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	if f == nil || f.Enabled {
		return http.StatusConflict, errors.New("start setup first")
	}
	secret, err := sealer().Open(f.Secret)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	stepNo, ok := twofactor.Validate(secret, body.Code, time.Now(), 0)
	if !ok {
		return http.StatusBadRequest, errors.New("that code isn't right; check the time on your device")
	}
	codes, err := f.NewRecoveryCodes()
	if err != nil {
		return http.StatusInternalServerError, err
	}
	f.Enabled = true
	f.EnabledAt = time.Now().Unix()
	f.LastStep = stepNo
	if err := d.store.TwoFactor.Save(f); err != nil {
		return http.StatusInternalServerError, err
	}
	events.Publish(events.TwoFactorChanged{Base: eventBase(r, d), Action: "enabled", TargetUserID: d.user.ID})
	return renderJSON(w, r, map[string][]string{"recoveryCodes": codes})
})

// checkPassword confirms the signed-in user's password for sensitive changes.
func checkPassword(d *data, password string) bool {
	return d.settings.AuthMethod != auth.MethodJSONAuth || users.CheckPwd(password, d.user.Password)
}

// POST /api/2fa/disable {password}
var twoFactorDisableHandler = withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.store.TwoFactor == nil {
		return http.StatusNotImplemented, nil
	}
	body, err := decodeTwoFactorBody(r)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if !checkPassword(d, body.Password) {
		return http.StatusForbidden, nil
	}
	if err := d.store.TwoFactor.Delete(d.user.ID); err != nil {
		return http.StatusInternalServerError, err
	}
	events.Publish(events.TwoFactorChanged{Base: eventBase(r, d), Action: "disabled", TargetUserID: d.user.ID})
	return http.StatusOK, nil
})

// POST /api/2fa/recovery {password}: new recovery codes (the old ones stop
// working).
var twoFactorRecoveryHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.store.TwoFactor == nil {
		return http.StatusNotImplemented, nil
	}
	body, err := decodeTwoFactorBody(r)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if !checkPassword(d, body.Password) {
		return http.StatusForbidden, nil
	}
	f, err := d.store.TwoFactor.Get(d.user.ID)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	if f == nil || !f.Enabled {
		return http.StatusConflict, errors.New("two-factor sign-in is off")
	}
	codes, err := f.NewRecoveryCodes()
	if err != nil {
		return http.StatusInternalServerError, err
	}
	if err := d.store.TwoFactor.Save(f); err != nil {
		return http.StatusInternalServerError, err
	}
	return renderJSON(w, r, map[string][]string{"recoveryCodes": codes})
})

// GET / DELETE /api/users/{id}/2fa (admin): see whether a user has a
// second factor, or reset it (they can sign in with the password alone and
// set it up again).
var userTwoFactorHandler = withAdmin(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.store.TwoFactor == nil {
		return http.StatusNotImplemented, nil
	}
	id, err := strconv.ParseUint(mux.Vars(r)["id"], 10, 32)
	if err != nil {
		return http.StatusBadRequest, err
	}
	uid := uint(id)
	if r.Method == http.MethodDelete {
		if err := d.store.TwoFactor.Delete(uid); err != nil {
			return http.StatusInternalServerError, err
		}
		events.Publish(events.TwoFactorChanged{Base: eventBase(r, d), Action: "reset", TargetUserID: uid})
		return http.StatusOK, nil
	}
	return renderJSON(w, r, map[string]bool{"enabled": d.store.TwoFactor.Enabled(uid)})
})

// beginTwoFactorLogin answers the password step for a user with a second
// factor: 202 and a challenge instead of a token.
func beginTwoFactorLogin(w http.ResponseWriter, r *http.Request, d *data, user *users.User) (int, error) {
	challenge, err := twofactor.IssueChallenge(d.settings.Key, user.ID, time.Now())
	if err != nil {
		return http.StatusInternalServerError, err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"twoFactor": true, "challenge": challenge})
	return 0, nil
}

type twoFactorLoginBody struct {
	Challenge string `json:"challenge"`
	Code      string `json:"code"`
}

// POST /api/login/2fa {challenge, code}
func twoFactorLoginHandler(tokenExpireTime time.Duration) handleFunc {
	return func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		key := realip.FromRequest(r)
		if wait := loginThrottler.retryAfter(key); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			return http.StatusTooManyRequests, nil
		}
		if !twoFactorApplies(d) || r.Body == nil {
			return http.StatusBadRequest, nil
		}
		var body twoFactorLoginBody
		if err := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 4096)).Decode(&body); err != nil {
			return http.StatusBadRequest, nil
		}
		uid, err := twofactor.ParseChallenge(d.settings.Key, body.Challenge, time.Now())
		if err != nil {
			return http.StatusUnauthorized, nil
		}
		user, err := d.store.Users.Get(d.server.Root, uid)
		if err != nil {
			return http.StatusUnauthorized, nil
		}
		f, err := d.store.TwoFactor.Get(uid)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		if f == nil || !f.Enabled {
			// Reset since the password step: sign in again from the start.
			return http.StatusUnauthorized, nil
		}

		usedRecovery := false
		ok := false
		if secret, err := sealer().Open(f.Secret); err == nil {
			if s, valid := twofactor.Validate(secret, body.Code, time.Now(), f.LastStep); valid {
				f.LastStep = s
				ok = true
			}
		}
		if !ok && f.UseRecoveryCode(body.Code) {
			ok, usedRecovery = true, true
		}
		if !ok {
			loginThrottler.fail(key)
			return http.StatusForbidden, nil
		}
		if err := d.store.TwoFactor.Save(f); err != nil {
			return http.StatusInternalServerError, err
		}
		loginThrottler.succeed(key)
		if usedRecovery {
			events.Publish(events.TwoFactorChanged{
				Base: events.NewBase(user.ID, key), Action: "recovery-used", TargetUserID: user.ID,
			})
		}
		events.Publish(events.UserLoggedIn{Base: events.NewBase(user.ID, key), Username: user.Username})
		return printToken(w, r, d, user, tokenExpireTime)
	}
}
