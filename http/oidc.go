package fbhttp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tomasen/realip"

	"github.com/csummers-dev/vitrine/v4/auth"
	fberrors "github.com/csummers-dev/vitrine/v4/errors"
	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/oidc"
	"github.com/csummers-dev/vitrine/v4/users"
)

// OpenID Connect single sign-on (4.0 Phase 4.5).
//
//	GET /api/auth/oidc/login?redirect=/files/…  → the provider's sign-in page
//	GET /api/auth/oidc/callback?code=…&state=…  → back to vitrine, signed in
//
// The flow is the authorization-code flow with PKCE. State, nonce, PKCE
// verifier and the return path travel in a short-lived, signed, HttpOnly
// cookie scoped to the callback path. On success the browser is sent to
// /login#sso=<token>, where the app stores the session token as after a
// password sign-in (a fragment never reaches a server or a log).

const (
	oidcCookie    = "vitrine_oidc"
	oidcCookieTTL = 10 * time.Minute
)

type oidcState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	Redirect string `json:"r"`
	Expires  int64  `json:"e"`
}

func signOIDCState(key []byte, st oidcState) (string, error) {
	payload, err := json.Marshal(st)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, append([]byte("vitrine-oidc-state:"), key...))
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func parseOIDCState(key []byte, v string, now time.Time) (*oidcState, error) {
	p, s, ok := strings.Cut(v, ".")
	if !ok {
		return nil, errors.New("bad state cookie")
	}
	payload, err1 := base64.RawURLEncoding.DecodeString(p)
	sig, err2 := base64.RawURLEncoding.DecodeString(s)
	if err1 != nil || err2 != nil {
		return nil, errors.New("bad state cookie")
	}
	mac := hmac.New(sha256.New, append([]byte("vitrine-oidc-state:"), key...))
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, errors.New("bad state cookie")
	}
	var st oidcState
	if err := json.Unmarshal(payload, &st); err != nil {
		return nil, err
	}
	if now.Unix() > st.Expires {
		return nil, errors.New("sign-in took too long")
	}
	return &st, nil
}

// safeRedirect keeps a post-login path inside the app.
func safeRedirect(p string) string {
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.Contains(p, `\`) {
		return "/files/"
	}
	return p
}

var (
	oidcProvidersMu sync.Mutex
	oidcProviders   = map[string]*oidc.Provider{}
)

// providerFor returns a cached Provider for the configuration, so
// discovery and signing keys aren't fetched on every sign-in.
func providerFor(a *auth.OIDCAuth) *oidc.Provider {
	key := strings.Join([]string{a.Issuer, a.ClientID, a.ClientSecret, strings.Join(a.Scopes, " ")}, "\x00")
	oidcProvidersMu.Lock()
	defer oidcProvidersMu.Unlock()
	if p, ok := oidcProviders[key]; ok {
		return p
	}
	p := oidc.NewProvider(oidc.Config{
		Issuer: a.Issuer, ClientID: a.ClientID, ClientSecret: a.ClientSecret, Scopes: a.Scopes,
	}, nil)
	oidcProviders[key] = p
	return p
}

func oidcAuther(d *data) (*auth.OIDCAuth, error) {
	if d.settings.AuthMethod != auth.MethodOIDCAuth {
		return nil, fberrors.ErrInvalidAuthMethod
	}
	raw, err := d.store.Auth.Get(auth.MethodOIDCAuth)
	if err != nil {
		return nil, err
	}
	a, ok := raw.(*auth.OIDCAuth)
	if !ok {
		return nil, fberrors.ErrInvalidAuthMethod
	}
	return a, nil
}

func firstHeader(r *http.Request, name string) string {
	v, _, _ := strings.Cut(r.Header.Get(name), ",")
	return strings.TrimSpace(v)
}

// callbackURL is where the provider sends the browser back.
func callbackURL(r *http.Request, a *auth.OIDCAuth, baseURL string) string {
	if a.RedirectURL != "" {
		return a.RedirectURL
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if p := firstHeader(r, "X-Forwarded-Proto"); p == "https" || p == "http" {
		scheme = p
	}
	host := r.Host
	if h := firstHeader(r, "X-Forwarded-Host"); h != "" {
		host = h
	}
	return scheme + "://" + host + strings.TrimRight(baseURL, "/") + "/api/auth/oidc/callback"
}

func cookieSecure(r *http.Request) bool {
	return r.TLS != nil || firstHeader(r, "X-Forwarded-Proto") == "https"
}

// loginRedirect sends the browser to the app's login page with a result in
// the fragment.
func loginRedirect(w http.ResponseWriter, r *http.Request, baseURL, fragment string) {
	http.Redirect(w, r, strings.TrimRight(baseURL, "/")+"/login#"+fragment, http.StatusFound)
}

var oidcLoginHandler = func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	a, err := oidcAuther(d)
	if err != nil {
		return http.StatusNotFound, nil
	}
	st := oidcState{Redirect: safeRedirect(r.URL.Query().Get("redirect")), Expires: time.Now().Add(oidcCookieTTL).Unix()}
	for _, dst := range []*string{&st.State, &st.Nonce, &st.Verifier} {
		if *dst, err = oidc.RandomString(32); err != nil {
			return http.StatusInternalServerError, err
		}
	}
	target, err := providerFor(a).AuthURL(r.Context(), callbackURL(r, a, d.server.BaseURL), st.State, st.Nonce, st.Verifier)
	if err != nil {
		log.Printf("oidc: %v", err)
		loginRedirect(w, r, d.server.BaseURL, "sso_error=provider")
		return 0, nil
	}
	cookie, err := signOIDCState(d.settings.Key, st)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oidcCookie,
		Value:    cookie,
		Path:     strings.TrimRight(d.server.BaseURL, "/") + "/api/auth/oidc/",
		MaxAge:   int(oidcCookieTTL / time.Second),
		HttpOnly: true,
		Secure:   cookieSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, target, http.StatusFound)
	return 0, nil
}

// ssoUser finds or creates the vitrine user for verified claims and syncs
// admin rights from the admin group.
func ssoUser(d *data, a *auth.OIDCAuth, claims jwt.MapClaims) (*users.User, error) {
	username := strings.TrimSpace(oidc.StringClaim(claims, a.Username()))
	if username == "" || strings.ContainsAny(username, `/\`) || len(username) > 128 {
		return nil, fmt.Errorf("no usable %q claim", a.Username())
	}
	user, err := d.store.Users.Get(d.server.Root, username)
	isNew := false
	switch {
	case errors.Is(err, fberrors.ErrNotExist):
		if !a.AutoCreate {
			return nil, errUnknownSSOUser
		}
		if user, err = auth.NewSSOUser(username, d.settings, d.server); err != nil {
			return nil, err
		}
		isNew = true
	case err != nil:
		return nil, err
	}
	if a.AdminGroup != "" {
		admin := oidc.HasGroup(claims, a.Groups(), a.AdminGroup)
		if admin != user.Perm.Admin {
			user.Perm.Admin = admin
			if !isNew {
				if err := d.store.Users.Update(user, "Perm"); err != nil {
					return nil, err
				}
			}
		}
	}
	if isNew {
		if err := d.store.Users.Save(user); err != nil {
			return nil, err
		}
		// Re-read so the scoped filesystem is set up like any other user.
		if user, err = d.store.Users.Get(d.server.Root, username); err != nil {
			return nil, err
		}
	}
	return user, nil
}

var errUnknownSSOUser = errors.New("no vitrine account for this user")

func oidcCallbackHandler(tokenExpireTime time.Duration) handleFunc {
	return func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		a, err := oidcAuther(d)
		if err != nil {
			return http.StatusNotFound, nil
		}
		base := d.server.BaseURL
		// The state cookie is single-use.
		http.SetCookie(w, &http.Cookie{
			Name: oidcCookie, Value: "", Path: strings.TrimRight(base, "/") + "/api/auth/oidc/",
			MaxAge: -1, HttpOnly: true, Secure: cookieSecure(r), SameSite: http.SameSiteLaxMode,
		})
		q := r.URL.Query()
		if e := q.Get("error"); e != "" {
			loginRedirect(w, r, base, "sso_error="+url.QueryEscape(e))
			return 0, nil
		}
		c, err := r.Cookie(oidcCookie)
		if err != nil {
			loginRedirect(w, r, base, "sso_error=state")
			return 0, nil
		}
		st, err := parseOIDCState(d.settings.Key, c.Value, time.Now())
		if err != nil || !hmac.Equal([]byte(st.State), []byte(q.Get("state"))) {
			loginRedirect(w, r, base, "sso_error=state")
			return 0, nil
		}
		p := providerFor(a)
		raw, err := p.Exchange(r.Context(), q.Get("code"), st.Verifier, callbackURL(r, a, base))
		if err != nil {
			log.Printf("oidc: %v", err)
			loginRedirect(w, r, base, "sso_error=exchange")
			return 0, nil
		}
		claims, err := p.Verify(r.Context(), raw, st.Nonce)
		if err != nil {
			log.Printf("oidc: %v", err)
			loginRedirect(w, r, base, "sso_error=token")
			return 0, nil
		}
		user, err := ssoUser(d, a, claims)
		if err != nil {
			log.Printf("oidc: %v", err)
			code := "account"
			if errors.Is(err, errUnknownSSOUser) {
				code = "no_account"
			}
			loginRedirect(w, r, base, "sso_error="+code)
			return 0, nil
		}
		signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims(user, tokenExpireTime)).SignedString(d.settings.Key)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		events.Publish(events.UserLoggedIn{Base: events.NewBase(user.ID, realip.FromRequest(r)), Username: user.Username})
		loginRedirect(w, r, base, "sso="+url.QueryEscape(signed)+"&redirect="+url.QueryEscape(st.Redirect))
		return 0, nil
	}
}
