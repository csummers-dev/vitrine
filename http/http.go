package fbhttp

import (
	"io/fs"
	"log"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/csummers-dev/vitrine/v3/audit"
	"github.com/csummers-dev/vitrine/v3/foldersize"
	"github.com/csummers-dev/vitrine/v3/jobs"
	"github.com/csummers-dev/vitrine/v3/jobstore"
	"github.com/csummers-dev/vitrine/v3/searchindex"
	"github.com/csummers-dev/vitrine/v3/settings"
	"github.com/csummers-dev/vitrine/v3/storage"
	"github.com/csummers-dev/vitrine/v3/tags"
	"github.com/csummers-dev/vitrine/v3/trash"
	"github.com/csummers-dev/vitrine/v3/webhooks"
)

type modifyRequest struct {
	What            string   `json:"what"`             // Answer to: what data type?
	Which           []string `json:"which"`            // Answer to: which fields?
	CurrentPassword string   `json:"current_password"` // Answer to: user logged password
}

func NewHandler(
	imgSvc ImgService,
	fileCache FileCache,
	uploadCache UploadCache,
	store *storage.Storage,
	tagsStore *tags.Store,
	trashStore *trash.Store,
	jobStore *jobstore.Store,
	auditLog *audit.Log,
	webhookStore *webhooks.Store,
	webhookDispatcher *webhooks.Dispatcher,
	server *settings.Server,
	assetsFs fs.FS,
) (http.Handler, error) {
	server.Clean()

	r := mux.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Security-Policy", `default-src 'self'; style-src 'unsafe-inline';`)
			next.ServeHTTP(w, r)
		})
	})
	index, static := getStaticHandlers(store, server, assetsFs)

	monkey := func(fn handleFunc, prefix string) http.Handler {
		return handle(fn, prefix, store, tagsStore, trashStore, server)
	}

	r.HandleFunc("/health", healthHandler)
	// S6-4: serve the offline-shell service worker at the app root so its
	// scope covers the whole SPA (navigations + /static). Registered
	// before NotFoundHandler so it isn't swallowed by the SPA fallback.
	r.Handle("/service-worker.js", serviceWorkerHandler(assetsFs))
	r.PathPrefix("/static").Handler(static)
	r.NotFoundHandler = index

	api := r.PathPrefix("/api").Subrouter()

	tokenExpirationTime := server.GetTokenExpirationTime(DefaultTokenExpirationTime)
	api.Handle("/login", monkey(loginHandler(tokenExpirationTime), ""))
	api.Handle("/signup", monkey(signupHandler, ""))
	api.Handle("/renew", monkey(renewHandler(tokenExpirationTime), ""))

	users := api.PathPrefix("/users").Subrouter()
	users.Handle("", monkey(usersGetHandler, "")).Methods("GET")
	users.Handle("", monkey(userPostHandler, "")).Methods("POST")
	users.Handle("/{id:[0-9]+}", monkey(userPutHandler, "")).Methods("PUT")
	users.Handle("/{id:[0-9]+}", monkey(userGetHandler, "")).Methods("GET")
	users.Handle("/{id:[0-9]+}", monkey(userDeleteHandler, "")).Methods("DELETE")

	api.PathPrefix("/resources/recursive").Handler(monkey(resourceGetRecursiveHandler, "/api/resources/recursive")).Methods("GET")
	api.PathPrefix("/resources").Handler(monkey(resourceGetHandler, "/api/resources")).Methods("GET")
	api.PathPrefix("/resources").Handler(monkey(resourceDeleteHandler(fileCache), "/api/resources")).Methods("DELETE")
	api.PathPrefix("/resources").Handler(monkey(resourcePostHandler(fileCache), "/api/resources")).Methods("POST")
	api.PathPrefix("/resources").Handler(monkey(resourcePutHandler, "/api/resources")).Methods("PUT")
	api.PathPrefix("/resources").Handler(monkey(resourcePatchHandler(fileCache), "/api/resources")).Methods("PATCH")

	// Background transfers (move/copy jobs) with progress + cancellation. The
	// manager owns an in-memory job registry + two worker lanes; it lives for the
	// server lifetime (held by the route closures below). With a job store wired
	// (Stage 3), in-flight jobs are persisted and any interrupted by a restart
	// are restored as Retryable rows.
	transfers := newTransferManager()
	if jobStore != nil {
		transfers.reg.SetPersistence(
			func(rec jobs.Record) {
				if err := jobStore.Save(rec); err != nil {
					log.Printf("WARNING: persist transfer job %s: %v", rec.ID, err)
				}
			},
			func(id string) { _ = jobStore.Delete(id) },
		)
		if records, err := jobStore.LoadAll(); err != nil {
			log.Printf("WARNING: load interrupted transfer jobs: %v", err)
		} else if len(records) > 0 {
			transfers.reg.Restore(records)
			log.Printf("Transfers: restored %d interrupted job(s) from a prior run", len(records))
		}
	}
	// Folder-size cache (2.4.0 Stage 4 / E): on-demand recursive directory sizes,
	// kept fresh by subscribing to the events bus for ancestor invalidation. One
	// per server, lives for its lifetime (held by the route closure below).
	folderSizes := foldersize.New()
	api.PathPrefix("/folder-size").Handler(monkey(folderSizeHandler(folderSizes), "/api/folder-size")).Methods("GET")

	api.Handle("/jobs", monkey(transfers.jobsListHandler(), "")).Methods("GET")
	api.Handle("/jobs", monkey(transfers.jobsPostHandler(), "")).Methods("POST")
	api.Handle("/jobs/{id}", monkey(transfers.jobsGetHandler(), "")).Methods("GET")
	api.Handle("/jobs/{id}", monkey(transfers.jobsDeleteHandler(), "")).Methods("DELETE")
	// Retry a failed/canceled/interrupted transfer's not-yet-done items (Stage 3).
	api.Handle("/jobs/{id}/retry", monkey(transfers.jobsRetryHandler(), "")).Methods("POST")

	// Trash / recycle bin (2.4.0 Stage 2). Deletes land here (see
	// resourceDeleteHandler); these routes list, restore, and purge.
	api.Handle("/trash", monkey(trashListHandler(), "")).Methods("GET")
	api.Handle("/trash", monkey(trashDeleteHandler(), "")).Methods("DELETE")
	api.Handle("/trash/{id}", monkey(trashRestoreHandler(), "")).Methods("POST")
	api.Handle("/trash/{id}", monkey(trashDeleteHandler(), "")).Methods("DELETE")

	api.PathPrefix("/tus").Handler(monkey(tusPostHandler(uploadCache), "/api/tus")).Methods("POST")
	api.PathPrefix("/tus").Handler(monkey(tusHeadHandler(uploadCache), "/api/tus")).Methods("HEAD", "GET")
	api.PathPrefix("/tus").Handler(monkey(tusPatchHandler(uploadCache), "/api/tus")).Methods("PATCH")
	api.PathPrefix("/tus").Handler(monkey(tusDeleteHandler(uploadCache), "/api/tus")).Methods("DELETE")

	// Route name kept as "/unzip" for API compatibility; the handler now
	// extracts any supported archive format (zip / 7z / rar / tar family).
	api.PathPrefix("/unzip").Handler(monkey(extractHandler(), "/api/unzip")).Methods("POST")

	// Audio tag editor (ID3 / FLAC). Paths travel in the request body so a
	// multi-file selection is one request: read is POST, write is PATCH
	// (multipart — JSON `payload` + optional `artwork` image part).
	api.Handle("/audio-tags/read", monkey(audioTagsReadHandler(), "")).Methods("POST")
	api.Handle("/audio-tags", monkey(audioTagsWriteHandler(), "")).Methods("PATCH")

	// On-demand video transcode (#3): browser-unplayable containers (.mkv,
	// .avi, …) are remuxed/transcoded to a cached, seekable MP4.
	api.PathPrefix("/transcode").Handler(monkey(transcodeHandler(), "/api/transcode")).Methods("GET")

	api.PathPrefix("/usage").Handler(monkey(diskUsage, "/api/usage")).Methods("GET")

	// Tags CRUD (v1.3 S2). All scoped to authenticated user.
	api.Handle("/tags", monkey(tagsListHandler, "")).Methods("GET")
	api.Handle("/tags", monkey(tagsCreateHandler, "")).Methods("POST")
	api.Handle("/tags/batch", monkey(fileTagsBatchHandler, "")).Methods("POST")
	api.Handle("/tags/apply", monkey(fileTagsApplyHandler, "")).Methods("POST")
	api.Handle("/tags/{id:[0-9]+}", monkey(tagsUpdateHandler, "")).Methods("PATCH")
	api.Handle("/tags/{id:[0-9]+}", monkey(tagsDeleteHandler, "")).Methods("DELETE")
	// File ↔ tag mapping. Path is in the URL after /api/files-tags;
	// tag ID is a query param (?id=N) so the path can be `.*` without
	// fighting gorilla/mux for a second `{}` segment. The shared
	// stripPrefix in handle() leaves r.URL.Path holding just the file
	// path by the time the handler runs.
	api.PathPrefix("/files-tags").Handler(monkey(fileTagsListHandler, "/api/files-tags")).Methods("GET")
	api.PathPrefix("/files-tags").Handler(monkey(fileTagAddHandler, "/api/files-tags")).Methods("POST")
	api.PathPrefix("/files-tags").Handler(monkey(fileTagRemoveHandler, "/api/files-tags")).Methods("DELETE")

	api.Handle("/shares", monkey(shareListHandler, "")).Methods("GET")
	api.PathPrefix("/share").Handler(monkey(shareGetsHandler, "/api/share")).Methods("GET")
	api.PathPrefix("/share").Handler(monkey(sharePostHandler, "/api/share")).Methods("POST")
	api.PathPrefix("/share").Handler(monkey(shareDeleteHandler, "/api/share")).Methods("DELETE")

	api.Handle("/settings", monkey(settingsGetHandler, "")).Methods("GET")
	api.Handle("/settings", monkey(settingsPutHandler, "")).Methods("PUT")

	// Audit log (v1.3 S8-1). Admin-only; read-only — the log itself is
	// populated by the S1-5 events-bus subscriber.
	api.Handle("/audit", monkey(auditGetHandler(auditLog), "")).Methods("GET")

	// Sessions (v1.3 S8-3). "Sign out everywhere" — per-user, bumps the
	// session epoch + re-issues the caller's token.
	api.Handle("/sessions/revoke-others", monkey(sessionsRevokeOthersHandler(tokenExpirationTime), "")).Methods("POST")

	// Webhooks (v1.3 S8-2). Admin-only CRUD + test; deliveries are
	// fired by the events-bus dispatcher wired up in cmd/root.go.
	api.Handle("/webhooks", monkey(webhooksListHandler(webhookStore), "")).Methods("GET")
	api.Handle("/webhooks", monkey(webhooksCreateHandler(webhookStore), "")).Methods("POST")
	api.Handle("/webhooks/{id:[0-9]+}", monkey(webhooksUpdateHandler(webhookStore), "")).Methods("PUT")
	api.Handle("/webhooks/{id:[0-9]+}", monkey(webhooksDeleteHandler(webhookStore), "")).Methods("DELETE")
	api.Handle("/webhooks/{id:[0-9]+}/test", monkey(webhooksTestHandler(webhookStore, webhookDispatcher), "")).Methods("POST")

	api.PathPrefix("/raw").Handler(monkey(rawHandler, "/api/raw")).Methods("GET")
	api.PathPrefix("/preview/{size}/{path:.*}").
		Handler(monkey(previewHandler(imgSvc, fileCache, server.EnableThumbnails, server.ResizePreview), "/api/preview")).Methods("GET")

	// Comic reader: list the pages of a CBZ/CBR, then stream individual pages.
	api.PathPrefix("/comic/list/{path:.*}").
		Handler(monkey(comicListHandler(fileCache), "/api/comic")).Methods("GET")
	api.PathPrefix("/comic/page/{index:[0-9]+}/{path:.*}").
		Handler(monkey(comicPageHandler(fileCache), "/api/comic")).Methods("GET")
	api.PathPrefix("/command").Handler(monkey(commandsHandler, "/api/command")).Methods("GET")
	// In-memory search index (2.4.0 Stage 5 / H): per-user name+path index,
	// lazily built + kept fresh off the events bus, so search answers from
	// memory instead of walking the tree on every keystroke. Server-lifetime.
	searchIndex := searchindex.New()
	// Order matters: the more-specific /search/recursive + /search/rebuild
	// routes must register before the plain /search catch-all, otherwise the
	// catch-all would swallow them.
	api.PathPrefix("/search/recursive").
		Handler(monkey(searchRecursiveHandler, "/api/search/recursive")).Methods("GET")
	api.Handle("/search/rebuild", monkey(searchRebuildHandler(searchIndex), "")).Methods("POST")
	api.PathPrefix("/search").Handler(monkey(searchHandler(searchIndex), "/api/search")).Methods("GET")
	api.PathPrefix("/subtitle").Handler(monkey(subtitleHandler, "/api/subtitle")).Methods("GET")

	public := api.PathPrefix("/public").Subrouter()
	public.PathPrefix("/dl").Handler(monkey(publicDlHandler, "/api/public/dl/")).Methods("GET")
	public.PathPrefix("/share").Handler(monkey(publicShareHandler, "/api/public/share/")).Methods("GET")

	return stripPrefix(server.BaseURL, r), nil
}
