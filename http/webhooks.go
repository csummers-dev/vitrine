package fbhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"github.com/filebrowser/filebrowser/v2/webhooks"
)

// webhookBody is the editable shape of an endpoint (PUT/POST). Status
// fields are server-managed and not accepted from the client.
type webhookBody struct {
	URL     string   `json:"url"`
	Enabled bool     `json:"enabled"`
	Events  []string `json:"events"`
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
		if eps == nil {
			eps = []webhooks.Endpoint{}
		}
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
		if !validWebhookURL(body.URL) {
			return http.StatusBadRequest, errors.New("webhook url must be http(s)")
		}
		ep := &webhooks.Endpoint{
			URL:     body.URL,
			Enabled: body.Enabled,
			Events:  sanitizeEvents(body.Events),
		}
		if err := store.Create(ep); err != nil {
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, ep)
	})
}

func webhooksUpdateHandler(store *webhooks.Store) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		var body webhookBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return http.StatusBadRequest, err
		}
		if !validWebhookURL(body.URL) {
			return http.StatusBadRequest, errors.New("webhook url must be http(s)")
		}
		ep := &webhooks.Endpoint{
			ID:      mux.Vars(r)["id"],
			URL:     body.URL,
			Enabled: body.Enabled,
			Events:  sanitizeEvents(body.Events),
		}
		if err := store.Update(ep); err != nil {
			if errors.Is(err, webhooks.ErrNotFound) {
				return http.StatusNotFound, nil
			}
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, ep)
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
		code, derr := dispatcher.Test(ep.ID, ep.URL)
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
