package auth

import (
	"net/http"
	"os"

	"github.com/csummers-dev/vitrine/v4/settings"
	"github.com/csummers-dev/vitrine/v4/users"
)

// MethodOIDCAuth is OpenID Connect single sign-on (4.0 Phase 4.5).
const MethodOIDCAuth settings.AuthMethod = "oidc"

// OIDCAuth signs users in through an OpenID Connect provider (Authelia,
// Authentik, Keycloak, …). The redirect flow lives in the http package;
// Auth here only serves the optional local password sign-in.
type OIDCAuth struct {
	// Issuer is the provider's issuer URL, exactly as it reports it.
	Issuer       string `json:"issuer"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	// Scopes requested; default openid, profile, email.
	Scopes []string `json:"scopes"`
	// UsernameClaim names the claim used as the vitrine username
	// (default preferred_username).
	UsernameClaim string `json:"usernameClaim"`
	// GroupsClaim and AdminGroup: members of AdminGroup are admins, and
	// lose admin on their next sign-in when removed from it. Empty
	// AdminGroup leaves admin rights to vitrine.
	GroupsClaim string `json:"groupsClaim"`
	AdminGroup  string `json:"adminGroup"`
	// AutoCreate makes accounts for new users with the default
	// permissions; otherwise only existing usernames can sign in.
	AutoCreate bool `json:"autoCreate"`
	// PasswordLogin keeps vitrine's own password sign-in available beside
	// SSO (a local admin to fall back on). Turn it off once SSO works.
	PasswordLogin bool `json:"passwordLogin"`
	// ProviderName is shown on the button: "Sign in with <name>".
	ProviderName string `json:"providerName"`
	// RedirectURL overrides the callback URL vitrine computes from the
	// request (…/api/auth/oidc/callback); set it behind proxies that
	// rewrite the host or scheme.
	RedirectURL string `json:"redirectUrl"`
}

// Auth handles password sign-in when PasswordLogin is on.
func (a OIDCAuth) Auth(r *http.Request, usr users.Store, stg *settings.Settings, srv *settings.Server) (*users.User, error) {
	if !a.PasswordLogin {
		return nil, os.ErrPermission
	}
	return JSONAuth{}.Auth(r, usr, stg, srv)
}

// LoginPage reports that vitrine shows its own login page (with the SSO
// button).
func (a OIDCAuth) LoginPage() bool { return true }

// Username returns the configured username claim.
func (a OIDCAuth) Username() string {
	if a.UsernameClaim == "" {
		return "preferred_username"
	}
	return a.UsernameClaim
}

// Groups returns the configured groups claim.
func (a OIDCAuth) Groups() string {
	if a.GroupsClaim == "" {
		return "groups"
	}
	return a.GroupsClaim
}

// Name is the provider's display name.
func (a OIDCAuth) Name() string {
	if a.ProviderName == "" {
		return "single sign-on"
	}
	return a.ProviderName
}

// NewSSOUser builds (without saving) an account for a first SSO sign-in:
// default permissions without admin or exec, a random locked password, and
// a home folder when configured.
func NewSSOUser(username string, stg *settings.Settings, srv *settings.Server) (*users.User, error) {
	return ProxyAuth{}.newUser(stg, srv, username)
}
