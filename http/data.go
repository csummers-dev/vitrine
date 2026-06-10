package fbhttp

import (
	"log"
	"net/http"
	"strconv"

	"github.com/tomasen/realip"

	"github.com/filebrowser/filebrowser/v2/rules"
	"github.com/filebrowser/filebrowser/v2/runner"
	"github.com/filebrowser/filebrowser/v2/settings"
	"github.com/filebrowser/filebrowser/v2/storage"
	"github.com/filebrowser/filebrowser/v2/tags"
	"github.com/filebrowser/filebrowser/v2/trash"
	"github.com/filebrowser/filebrowser/v2/users"
)

type handleFunc func(w http.ResponseWriter, r *http.Request, d *data) (int, error)

type data struct {
	*runner.Runner
	settings   *settings.Settings
	server     *settings.Server
	store      *storage.Storage
	tagsStore  *tags.Store  // optional; nil disables tag handlers (503)
	trashStore *trash.Store // optional; nil makes every delete permanent (503 on /api/trash)
	user       *users.User
	raw        interface{}
}

// Check implements rules.Checker.
func (d *data) Check(path string) bool {
	if d.user.HideDotfiles && rules.MatchHidden(path) {
		return false
	}

	allow := true
	for _, rule := range d.settings.Rules {
		if rule.Matches(path) {
			allow = rule.Allow
		}
	}

	for _, rule := range d.user.Rules {
		if rule.Matches(path) {
			allow = rule.Allow
		}
	}

	return allow
}

func handle(fn handleFunc, prefix string, store *storage.Storage, tagsStore *tags.Store, trashStore *trash.Store, server *settings.Server) http.Handler {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range globalHeaders {
			w.Header().Set(k, v)
		}

		settings, err := store.Settings.Get()
		if err != nil {
			log.Fatalf("ERROR: couldn't get settings: %v\n", err)
			return
		}

		status, err := fn(w, r, &data{
			Runner:     &runner.Runner{Enabled: server.EnableExec, Settings: settings},
			store:      store,
			tagsStore:  tagsStore,
			trashStore: trashStore,
			settings:   settings,
			server:     server,
		})

		if status >= 400 || err != nil {
			clientIP := realip.FromRequest(r)
			log.Printf("%s: %v %s %v", r.URL.Path, status, clientIP, err)
		}

		if status != 0 {
			txt := http.StatusText(status)
			// Surface the handler's specific message for client-correctable
			// errors (bad request, conflict) so the UI shows what's actually
			// wrong — e.g. WHICH name already exists on a move/copy — instead of
			// a bare "409 Conflict". Other statuses keep the generic text so
			// internal error detail never leaks.
			if (status == http.StatusBadRequest || status == http.StatusConflict) &&
				err != nil {
				txt += " (" + err.Error() + ")"
			}
			http.Error(w, strconv.Itoa(status)+" "+txt, status)
			return
		}
	})

	return stripPrefix(prefix, handler)
}
