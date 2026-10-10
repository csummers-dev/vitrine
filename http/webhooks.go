package fbhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"github.com/csummers-dev/vitrine/v4/webhooks"
)

// webhookBody is the editable shape of an endpoint (PUT/POST). Status
// fields are server-managed and not accepted from the client.
type webhookBody struct {
	URL        string   `json:"url"`
	Enabled    bool     `json:"enabled"`
	Events     []string `json:"events"`
	Kind       string   `json:"kind"`
	Paths      []string `json:"paths"`
	AllowLocal bool     `json:"allowLocal"`
	// APIKey (Jellyfin) is write-only; empty on an edit keeps the old one.
	APIKey string `json:"apiKey"`
}

// endpoint validates the body and builds the endpoint it describes.
func (b webhookBody) endpoint(id string) (*webhooks.Endpoint, error) {
	if !validWebhookURL(b.URL) {
		return nil, errors.New("webhook url must be http(s)")
	}
	if b.Kind != webhooks.KindGeneric && b.Kind != webhooks.KindJellyfin {
		return nil, errors.New("unknown webhook kind")
	}
	var paths []string
	for _, p := range b.Paths {
		if p = strings.TrimSpace(p); p != "" {
			paths = append(paths, "/"+strings.Trim(p, "/"))
		}
	}
	return &webhooks.Endpoint{
		ID:         id,
		URL:        b.URL,
		Enabled:    b.Enabled,
		Events:     sanitizeEvents(b.Events),
		Kind:       b.Kind,
		Paths:      paths,
		AllowLocal: b.AllowLocal,
		APIKey:     strings.TrimSpace(b.APIKey),
	}, nil
}

func validWebhookURL(u string) bool {
	return strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://")
}

// sanitizeEvents drops anything that isn't a known file-event type. An
// empty result means "all events" (the dispatcher treats it that way).
func sanitizeEvents(in []string) []string {
	valid := map[string]bool{}
	for _, t := range webhooks.FileEventTypes() {
		valid[t] = true
	}
	out := []string{}
	for _, t := range in {
		if valid[t] {
			out = append(out, t)
		}
	}
	return out
}

func webhooksListHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		eps, err := store.List()
		if err != nil {
			return http.StatusInternalServerError, err
		}
		out := make([]webhooks.Endpoint, 0, len(eps))
		for _, ep := range eps {
			out = append(out, ep.Public())
		}
		eps = out
		return renderJSON(w, r, map[string]interface{}{
			"endpoints":  eps,
			"eventTypes": webhooks.FileEventTypes(),
		})
	})
}

func webhooksCreateHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		var body webhookBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return http.StatusBadRequest, err
		}
		ep, err := body.endpoint("")
		if err != nil {
			return http.StatusBadRequest, err
		}
		if ep.Kind == webhooks.KindJellyfin && ep.APIKey == "" {
			return http.StatusBadRequest, errors.New("a Jellyfin endpoint needs an API key")
		}
		if err := store.Create(ep); err != nil {
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, ep.Public())
	})
}

func webhooksUpdateHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		var body webhookBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return http.StatusBadRequest, err
		}
		ep, err := body.endpoint(mux.Vars(r)["id"])
		if err != nil {
			return http.StatusBadRequest, err
		}
		if err := store.Update(ep); err != nil {
			if errors.Is(err, webhooks.ErrNotFound) {
				return http.StatusNotFound, nil
			}
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, ep.Public())
	})
}

func webhooksDeleteHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(_ http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		if err := store.Delete(mux.Vars(r)["id"]); err != nil {
			return http.StatusInternalServerError, err
		}
		return http.StatusOK, nil
	})
}

// webhooksTestHandler fires a synthetic `webhook.test` POST at the saved
// endpoint and reports the result (also recorded as the endpoint's last
// delivery). Synchronous — the admin is waiting on the result.
func webhooksTestHandler(store *webhooks.Store, dispatcher *webhooks.Dispatcher) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		ep, err := store.Get(mux.Vars(r)["id"])
		if err != nil {
			return http.StatusInternalServerError, err
		}
		if ep == nil {
			return http.StatusNotFound, nil
		}
		code, derr := dispatcher.Test(*ep)
		result := map[string]interface{}{
			"ok":   derr == nil && code >= 200 && code < 300,
			"code": code,
		}
		if derr != nil {
			result["error"] = derr.Error()
		}
		return renderJSON(w, r, result)
	})
}

// webhooksSecretHandler creates or rotates (POST) or removes (DELETE) an
// endpoint's signing secret. A new secret is returned once and never shown
// again.
func webhooksSecretHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		id := mux.Vars(r)["id"]
		secret := ""
		if r.Method == http.MethodPost {
			var err error
			if secret, err = webhooks.NewSecret(); err != nil {
				return http.StatusInternalServerError, err
			}
		}
		if err := store.SetSecret(id, secret); err != nil {
			if errors.Is(err, webhooks.ErrNotFound) {
				return http.StatusNotFound, nil
			}
			return http.StatusInternalServerError, err
		}
		if secret == "" {
			return http.StatusOK, nil
		}
		return renderJSON(w, r, map[string]string{"secret": secret})
	})
}
