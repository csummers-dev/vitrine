package fbhttp

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"github.com/csummers-dev/vitrine/v4/version"
)

// Map tiles for the photo map (4.0 Phase 3.6).
//
// GET /api/tiles/{z}/{x}/{y} fetches the tile from the configured source
// (--mapTiles, OpenStreetMap by default) and caches it in the file cache.
// Browsers only ever talk to vitrine, so the strict Content-Security-Policy
// stays as it is and users' IPs aren't sent to the tile provider; repeated
// views of the same area cost the provider nothing.

const (
	tileMaxZoom      = 19
	tileMaxBytes     = 2 << 20 // 2 MiB
	tileFetchTimeout = 15 * time.Second
	tileConcurrency  = 4
)

var (
	tileSem    = make(chan struct{}, tileConcurrency)
	tileClient = &http.Client{Timeout: tileFetchTimeout}
)

// osmAttribution is required wherever OpenStreetMap tiles are shown.
const osmAttribution = `&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`

// mapAttribution is the credit line for a tile source; custom sources get
// none (their operator knows what to credit).
func mapAttribution(template string) string {
	if strings.Contains(template, "openstreetmap.org") {
		return osmAttribution
	}
	return ""
}

// parseTileCoords validates z/x/y: 0 ≤ z ≤ tileMaxZoom, 0 ≤ x, y < 2^z.
func parseTileCoords(zs, xs, ys string) (z, x, y int, err error) {
	z, err = strconv.Atoi(zs)
	if err != nil || z < 0 || z > tileMaxZoom {
		return 0, 0, 0, fmt.Errorf("bad zoom %q", zs)
	}
	n := 1 << z
	x, err = strconv.Atoi(xs)
	if err != nil || x < 0 || x >= n {
		return 0, 0, 0, fmt.Errorf("bad x %q", xs)
	}
	y, err = strconv.Atoi(strings.TrimSuffix(ys, ".png"))
	if err != nil || y < 0 || y >= n {
		return 0, 0, 0, fmt.Errorf("bad y %q", ys)
	}
	return z, x, y, nil
}

// tileURL fills a {z}/{x}/{y} template ({s} becomes "a", for templates
// with subdomains).
func tileURL(tmpl string, z, x, y int) string {
	return strings.NewReplacer(
		"{z}", strconv.Itoa(z),
		"{x}", strconv.Itoa(x),
		"{y}", strconv.Itoa(y),
		"{s}", "a",
	).Replace(tmpl)
}

func fetchTile(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, "", err
	}
	// Tile providers (OSM's usage policy in particular) require an
	// identifying User-Agent.
	req.Header.Set("User-Agent", "vitrine/"+version.Version+" (+https://github.com/csummers-dev/vitrine)")
	res, err := tileClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("tile server answered %s", res.Status)
	}
	ct := res.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/") {
		return nil, "", fmt.Errorf("tile server sent %q", ct)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, tileMaxBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > tileMaxBytes {
		return nil, "", errors.New("tile too large")
	}
	return body, ct, nil
}

func tilesHandler(fileCache FileCache, template string) handleFunc {
	return withUser(func(w http.ResponseWriter, r *http.Request, _ *data) (int, error) {
		if template == "" {
			return http.StatusNotFound, nil
		}
		vars := mux.Vars(r)
		z, x, y, err := parseTileCoords(vars["z"], vars["x"], vars["y"])
		if err != nil {
			return http.StatusBadRequest, nil
		}

		key := fmt.Sprintf("tile_%x_%d_%d_%d", template, z, x, y)
		body, ok, err := fileCache.Load(r.Context(), key)
		if err != nil {
			return errToStatus(err), err
		}
		if !ok {
			select {
			case tileSem <- struct{}{}:
			case <-r.Context().Done():
				return 0, nil
			}
			body, _, err = fetchTile(r.Context(), tileURL(template, z, x, y))
			<-tileSem
			if err != nil {
				log.Printf("map tile %d/%d/%d: %v", z, x, y, err)
				return http.StatusBadGateway, nil
			}
			storeThumbAsync(fileCache, key, body)
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=604800")
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))
		return 0, nil
	})
}
