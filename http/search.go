package fbhttp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/filebrowser/filebrowser/v2/search"
	"github.com/filebrowser/filebrowser/v2/searchindex"
)

const searchPingInterval = 5

// searchHandler streams search results as newline-delimited JSON. It serves from
// the in-memory index when that user's index is ready (2.4.0 Stage 5 / H), and
// falls back to the live filesystem walk while the index is still building — the
// index kicks off its background build on that first miss. Both sources emit the
// identical `{dir, path}` shape, so the client can't tell which served it.
func searchHandler(index *searchindex.Index) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		response := make(chan map[string]interface{})
		ctx, cancel := context.WithCancelCause(r.Context())
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Avoid connection timeout
			timeout := time.NewTimer(searchPingInterval * time.Second)
			defer timeout.Stop()
			for {
				var err error
				var infoBytes []byte
				select {
				case info := <-response:
					if info == nil {
						return
					}
					infoBytes, err = json.Marshal(info)
				case <-timeout.C:
					// Send a heartbeat packet
					infoBytes = nil
				case <-ctx.Done():
					return
				}
				if err != nil {
					cancel(err)
					return
				}
				_, err = w.Write(infoBytes)
				if err == nil {
					_, err = w.Write([]byte("\n"))
				}
				if err != nil {
					cancel(err)
					return
				}
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
			}
		}()

		query := r.URL.Query().Get("query")
		scope := r.URL.Path

		// One emit path shared by the index + the FS-walk fallback.
		send := func(relPath string, isDir bool) error {
			select {
			case <-ctx.Done():
			case response <- map[string]interface{}{
				"dir":  isDir,
				"path": relPath,
			}:
			}
			return context.Cause(ctx)
		}

		served, err := index.Search(ctx, d.user.ID, d.user.Fs, scope, query, d, send)
		if err == nil && !served {
			// Index not ready yet → walk the filesystem for this request (the
			// index is building in the background from the same tree).
			err = search.Search(ctx, d.user.Fs, scope, query, d, func(path string, f os.FileInfo) error {
				return send(path, f.IsDir())
			})
		}

		close(response)
		wg.Wait()
		if err == nil {
			err = context.Cause(ctx)
		}
		// ignore cancellation errors from user aborts
		if err != nil && !errors.Is(err, context.Canceled) {
			return http.StatusInternalServerError, err
		}

		return 0, nil
	})
}

// searchRebuildHandler forces an immediate rebuild of the caller's search index
// — the manual "rebuild search index" action for when drift is suspected.
func searchRebuildHandler(index *searchindex.Index) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		if err := index.Rebuild(d.user.ID, d.user.Fs); err != nil {
			return http.StatusInternalServerError, err
		}
		return renderJSON(w, r, map[string]bool{"ok": true})
	})
}
