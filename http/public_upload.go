package fbhttp

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/tomasen/realip"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/share"
)

// Drop-box (upload) shares, 4.0 Phase 4.1.
//
// GET  /api/public/share/<hash>      describes the drop-box (never lists it)
// POST /api/public/upload/<hash>?name=<file>&uploader=<name>
//      body: the file's bytes; Content-Length required
//
// Files are written with the link owner's permissions into the shared
// folder (or a subfolder named after the uploader). Names never overwrite:
// collisions get " (2)" suffixes. Limits: per-file and total size, allowed
// extensions, uploads per client IP per hour, concurrent uploads per link,
// and the owner's rules. Wrong passwords are throttled like logins.

const (
	uploadsPerIPPerHour      = 300
	uploadConcurrencyPerLink = 3
)

// uploadShareInfo is what a visitor's page needs to show a drop-box.
type uploadShareInfo struct {
	Mode              string   `json:"mode"`
	Name              string   `json:"name"`
	Hash              string   `json:"hash"`
	Token             string   `json:"token,omitempty"`
	MaxFileSize       int64    `json:"maxFileSize,omitempty"`
	RemainingBytes    *int64   `json:"remainingBytes,omitempty"`
	AllowedExtensions []string `json:"allowedExtensions,omitempty"`
	PerUploaderFolder bool     `json:"perUploaderFolder,omitempty"`
}

// uploadLimiter bounds uploads per client IP per hour and in flight per link.
type uploadLimiter struct {
	mu     sync.Mutex
	now    func() time.Time
	perIP  map[string][]time.Time
	active map[string]int
}

func newUploadLimiter() *uploadLimiter {
	return &uploadLimiter{now: time.Now, perIP: map[string][]time.Time{}, active: map[string]int{}}
}

// begin admits an upload, or reports why not: retry > 0 when the IP is over
// its hourly allowance, busy when the link has too many uploads running.
func (u *uploadLimiter) begin(ip, hash string) (retry time.Duration, busy bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	now := u.now()
	recent := u.perIP[ip][:0]
	for _, t := range u.perIP[ip] {
		if now.Sub(t) < time.Hour {
			recent = append(recent, t)
		}
	}
	if len(recent) >= uploadsPerIPPerHour {
		u.perIP[ip] = recent
		return time.Hour - now.Sub(recent[0]), false
	}
	if u.active[hash] >= uploadConcurrencyPerLink {
		u.perIP[ip] = recent
		return 0, true
	}
	u.perIP[ip] = append(recent, now)
	u.active[hash]++
	if len(u.perIP) > 4096 {
		for k, ts := range u.perIP {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) >= time.Hour {
				delete(u.perIP, k)
			}
		}
	}
	return 0, false
}

func (u *uploadLimiter) end(hash string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.active[hash] <= 1 {
		delete(u.active, hash)
	} else {
		u.active[hash]--
	}
}

var (
	shareUploads           = newUploadLimiter()
	sharePasswordThrottler = newLoginThrottle()
)

// withUploadShareInfo answers GET /api/public/share/<hash> for a drop-box
// with its description; other links go on to next.
func withUploadShareInfo(next handleFunc) handleFunc {
	return func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		id, sub := ifPathWithName(r)
		link, err := d.store.Share.GetByHash(id)
		if err != nil {
			return errToStatus(err), err
		}
		if !link.IsUpload() {
			return next(w, r, d)
		}
		ip := realip.FromRequest(r)
		if wait := sharePasswordThrottler.retryAfter(ip); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			return http.StatusTooManyRequests, nil
		}
		if status, err := authenticateShareRequest(r, link); status != 0 || err != nil {
			if status == http.StatusUnauthorized && r.Header.Get("X-SHARE-PASSWORD") != "" {
				sharePasswordThrottler.fail(ip)
			}
			return status, err
		}
		if sub != "/" {
			return http.StatusNotFound, nil
		}
		if d.settings.UploadSharesDisabled {
			return http.StatusForbidden, nil
		}
		if shareCounter != nil {
			shareCounter.View(link.Hash)
		}
		info := uploadShareInfo{
			Mode:              share.ModeUpload,
			Name:              path.Base(strings.TrimRight(link.Path, "/")),
			Hash:              link.Hash,
			Token:             link.Token,
			MaxFileSize:       link.MaxFileSize,
			AllowedExtensions: link.AllowedExtensions,
			PerUploaderFolder: link.PerUploaderFolder,
		}
		if link.MaxTotalSize > 0 {
			left := max(0, link.MaxTotalSize-link.UploadedBytes)
			info.RemainingBytes = &left
		}
		return renderJSON(w, r, info)
	}
}

func uploadErrorStatus(err error) int {
	switch {
	case errors.Is(err, share.ErrBadName):
		return http.StatusBadRequest
	case errors.Is(err, share.ErrExtension):
		return http.StatusUnsupportedMediaType
	case errors.Is(err, share.ErrFileTooLarge), errors.Is(err, share.ErrQuotaExceeded):
		return http.StatusRequestEntityTooLarge
	}
	return errToStatus(err)
}

var publicUploadHandler = func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	hash := strings.Trim(r.URL.Path, "/")
	ip := realip.FromRequest(r)
	if wait := sharePasswordThrottler.retryAfter(ip); wait > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		return http.StatusTooManyRequests, nil
	}

	link, err := d.store.Share.GetByHash(hash)
	if err != nil || !link.IsUpload() {
		return http.StatusNotFound, nil
	}
	if d.settings.UploadSharesDisabled {
		return http.StatusForbidden, nil
	}
	if status, err := authenticateShareRequest(r, link); status != 0 || err != nil {
		if status == http.StatusUnauthorized {
			sharePasswordThrottler.fail(ip)
		}
		return status, err
	}

	q := r.URL.Query()
	name, err := share.CleanUploadName(q.Get("name"))
	if err != nil {
		return http.StatusBadRequest, nil
	}
	size := r.ContentLength
	if size < 0 {
		return http.StatusLengthRequired, nil
	}
	if err := link.CheckUpload(name, size); err != nil {
		return uploadErrorStatus(err), nil
	}

	if wait, busy := shareUploads.begin(ip, hash); wait > 0 || busy {
		if wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		} else {
			w.Header().Set("Retry-After", "5")
		}
		return http.StatusTooManyRequests, nil
	}
	defer shareUploads.end(hash)

	owner, err := d.store.Users.Get(d.server.Root, link.UserID)
	if err != nil {
		return http.StatusNotFound, nil
	}
	if !owner.Perm.Share || !owner.Perm.Create {
		return http.StatusForbidden, nil
	}
	d.user = owner

	root, err := owner.Fs.Stat(link.Path)
	if err != nil || !root.IsDir() {
		return http.StatusNotFound, nil
	}
	dir := link.Path
	uploader := strings.TrimSpace(q.Get("uploader"))
	if link.PerUploaderFolder {
		dir = path.Join(dir, share.CleanUploaderName(uploader))
	}
	if !d.Check(dir) {
		return http.StatusForbidden, nil
	}
	if err := owner.Fs.MkdirAll(dir, d.settings.DirMode); err != nil {
		return errToStatus(err), err
	}

	if shareCounter != nil {
		if _, err := shareCounter.ReserveUpload(hash, name, size); err != nil {
			return uploadErrorStatus(err), nil
		}
	}
	release := func() {
		if shareCounter != nil {
			shareCounter.ReleaseUpload(hash, size)
		}
	}

	final, err := share.UniqueName(name, func(n string) bool {
		_, statErr := owner.Fs.Stat(path.Join(dir, n))
		return statErr == nil
	})
	if err != nil {
		release()
		return http.StatusConflict, nil
	}
	target := path.Join(dir, final)
	if !d.Check(target) {
		release()
		return http.StatusForbidden, nil
	}

	// O_EXCL: two uploads that picked the same free name can't clobber
	// each other; the loser gets 409 and the page retries.
	f, err := owner.Fs.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, d.settings.FileMode)
	if err != nil {
		release()
		if errors.Is(err, os.ErrExist) {
			return http.StatusConflict, nil
		}
		return errToStatus(err), err
	}
	n, copyErr := io.Copy(f, io.LimitReader(r.Body, size+1))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil || n != size {
		_ = owner.Fs.Remove(target)
		release()
		return http.StatusBadRequest, nil
	}

	events.Publish(events.FileUploaded{Base: events.NewBase(owner.ID, ip), Path: target, Size: size})
	events.Publish(events.ShareUploaded{
		Base:     events.NewBase(owner.ID, ip),
		ShareID:  hash,
		Path:     target,
		Size:     size,
		Uploader: uploader,
	})
	return renderJSON(w, r, map[string]any{"name": final, "size": size})
}
