package fbhttp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/csummers-dev/vitrine/v3/tags"
)

// Tag HTTP API. Routes (all scoped to the authenticated user — tags
// don't leak between users):
//
//	GET    /api/tags                          → list user's tags
//	POST   /api/tags                          → create {name, color?}
//	PATCH  /api/tags/{id}                     → update {name?, color?}
//	DELETE /api/tags/{id}                     → delete (cascades into file_tags)
//	GET    /api/files/{path}/tags             → list tags for one file
//	POST   /api/files/{path}/tags/{id}        → attach tag to file
//	DELETE /api/files/{path}/tags/{id}        → detach tag from file
//	POST   /api/files/tags/batch              → batch lookup for listing rows
//
// Errors map to HTTP status:
//	ErrInvalidColor / ErrInvalidName / bad JSON → 400
//	ErrTagNotFound → 404
//	ErrDuplicateName → 409

// tagCreateBody / tagUpdateBody — wire shapes for the request bodies.
// Kept tiny on purpose; tags are simple enough not to need a full
// shared request envelope like modifyRequest.
type tagCreateBody struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type tagUpdateBody struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type tagBatchBody struct {
	Paths []string `json:"paths"`
}

// parseTagID pulls the {id} segment out of the route. Returns 0 + an
// error on parse failure — handler should map to 400.
func parseTagID(r *http.Request) (uint64, error) {
	v := mux.Vars(r)["id"]
	return strconv.ParseUint(v, 10, 64)
}

// tagErrToStatus maps the tags package's sentinel errors onto status
// codes. Anything unrecognized becomes 500.
func tagErrToStatus(err error) int {
	switch {
	case err == nil:
		return 0
	case errors.Is(err, tags.ErrTagNotFound):
		return http.StatusNotFound
	case errors.Is(err, tags.ErrDuplicateName):
		return http.StatusConflict
	case errors.Is(err, tags.ErrInvalidColor),
		errors.Is(err, tags.ErrInvalidName):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// tagsListHandler — GET /api/tags
var tagsListHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	list, err := d.tagsStore.ListTags(d.user.ID)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	return renderJSON(w, r, list)
})

// tagsCreateHandler — POST /api/tags
var tagsCreateHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	if r.Body == nil {
		return http.StatusBadRequest, nil
	}
	var body tagCreateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return http.StatusBadRequest, err
	}
	tag, err := d.tagsStore.CreateTag(d.user.ID, body.Name, body.Color)
	if err != nil {
		return tagErrToStatus(err), err
	}
	w.WriteHeader(http.StatusCreated)
	return renderJSON(w, r, tag)
})

// tagsUpdateHandler — PATCH /api/tags/{id}
var tagsUpdateHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	id, err := parseTagID(r)
	if err != nil {
		return http.StatusBadRequest, err
	}
	var body tagUpdateBody
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return http.StatusBadRequest, err
		}
	}
	tag, err := d.tagsStore.UpdateTag(d.user.ID, id, body.Name, body.Color)
	if err != nil {
		return tagErrToStatus(err), err
	}
	return renderJSON(w, r, tag)
})

// tagsDeleteHandler — DELETE /api/tags/{id}
var tagsDeleteHandler = withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	id, err := parseTagID(r)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if err := d.tagsStore.DeleteTag(d.user.ID, id); err != nil {
		return tagErrToStatus(err), err
	}
	return http.StatusNoContent, nil
})

// fileTagsHandler — GET /api/files/{path:.*}/tags
//
// Because gorilla/mux strips the registered prefix, we read the path
// from r.URL.Path after the route mounts at `/api/files-tags/` (see
// http.go for the mount). The path is the user-facing file path,
// preserved with leading slash.
var fileTagsListHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	list, err := d.tagsStore.TagsForFile(d.user.ID, r.URL.Path)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	return renderJSON(w, r, list)
})

// fileTagAddHandler — POST /api/files-tags{path}?id=<tagID>
// We pass tag ID as a query param so the path can carry the file path
// itself (gorilla/mux doesn't support two `{}` segments where one is
// `.*`).
var fileTagAddHandler = withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		return http.StatusBadRequest, errors.New("tags: missing ?id=")
	}
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if err := d.tagsStore.AddTag(d.user.ID, r.URL.Path, id); err != nil {
		return tagErrToStatus(err), err
	}
	return http.StatusNoContent, nil
})

// fileTagRemoveHandler — DELETE /api/files-tags{path}?id=<tagID>
var fileTagRemoveHandler = withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		return http.StatusBadRequest, errors.New("tags: missing ?id=")
	}
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if err := d.tagsStore.RemoveTag(d.user.ID, r.URL.Path, id); err != nil {
		return tagErrToStatus(err), err
	}
	return http.StatusNoContent, nil
})

// fileTagsBatchHandler — POST /api/tags/batch  body: {paths: ["...", "..."]}
//
// Returns {"<path>": [tag, ...], ...}. Paths with no tags are omitted
// so the response stays compact for the typical case where most files
// in a listing are untagged. POST (not GET) because path lists can be
// arbitrarily long and we don't want URL-length limits to bite.
var fileTagsBatchHandler = withUser(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	if r.Body == nil {
		return http.StatusBadRequest, nil
	}
	var body tagBatchBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return http.StatusBadRequest, err
	}
	// Defensive cap: a 50k-path listing shouldn't be able to DoS the
	// server with a giant batch lookup. The frontend never sends more
	// than one listing's worth of items.
	if len(body.Paths) > 5000 {
		return http.StatusBadRequest, errors.New("tags: batch too large (>5000 paths)")
	}
	out, err := d.tagsStore.BatchTagsForFiles(d.user.ID, body.Paths)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	// Always emit `{}` for an empty result rather than `null`.
	if out == nil {
		out = map[string][]*tags.Tag{}
	}
	return renderJSON(w, r, out)
})

// tagApplyBody — wire shape for the bulk apply: a set of paths plus the tag IDs
// to add and remove across all of them.
type tagApplyBody struct {
	Paths  []string `json:"paths"`
	Add    []uint64 `json:"add"`
	Remove []uint64 `json:"remove"`
}

// fileTagsApplyHandler — POST /api/tags/apply
// body: {paths: [...], add: [id...], remove: [id...]}
//
// Bulk-tags a multi-selection (2.4.0 Stage 5 / K): applies add/remove across
// every path in one transaction. add IDs must exist (404 otherwise); 204 on
// success. POST because the path + id lists can be long.
var fileTagsApplyHandler = withUser(func(_ http.ResponseWriter, r *http.Request, d *data) (int, error) {
	if d.tagsStore == nil {
		return http.StatusServiceUnavailable, errors.New("tags: store not initialized")
	}
	if r.Body == nil {
		return http.StatusBadRequest, nil
	}
	var body tagApplyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return http.StatusBadRequest, err
	}
	if len(body.Paths) == 0 {
		return http.StatusBadRequest, errors.New("tags: no paths")
	}
	if len(body.Paths) > 5000 {
		return http.StatusBadRequest, errors.New("tags: batch too large (>5000 paths)")
	}
	if err := d.tagsStore.ApplyTagsBatch(d.user.ID, body.Paths, body.Add, body.Remove); err != nil {
		return tagErrToStatus(err), err
	}
	return http.StatusNoContent, nil
})
