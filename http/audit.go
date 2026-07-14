package fbhttp

import (
	"net/http"
	"strconv"
	"time"

	"github.com/csummers-dev/vitrine/v3/audit"
)

// auditResponse is the payload for GET /api/audit (v1.3 S8-1). Entries are
// newest-first and paged; `total` is the full matching count for the
// pager; `users` maps user IDs → usernames so the UI can show names
// without a second request (deleted users just fall back to the id).
type auditResponse struct {
	Entries []audit.Entry   `json:"entries"`
	Total   int             `json:"total"`
	Users   map[uint]string `json:"users"`
}

// parseAuditTime accepts an RFC3339 timestamp or a bare YYYY-MM-DD date.
func parseAuditTime(v string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, nil
	}
	return time.Parse("2006-01-02", v)
}

func reverseAuditEntries(s []audit.Entry) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}

// auditGetHandler serves the audit log, newest-first, filtered by query
// params (userId / action / since / until / pathPrefix) and paged via
// limit + offset. Admin-only.
func auditGetHandler(log *audit.Log) handleFunc {
	return withAdmin(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
		q := r.URL.Query()

		f := audit.Filter{
			Action:     q.Get("action"),
			PathPrefix: q.Get("pathPrefix"),
		}
		if v := q.Get("userId"); v != "" {
			if id, err := strconv.ParseUint(v, 10, 64); err == nil {
				f.UserID = uint(id)
			}
		}
		if v := q.Get("since"); v != "" {
			if t, err := parseAuditTime(v); err == nil {
				f.Since = t
			}
		}
		if v := q.Get("until"); v != "" {
			if t, err := parseAuditTime(v); err == nil {
				f.Until = t
			}
		}

		limit := 100
		if v := q.Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
				limit = n
			}
		}
		offset := 0
		if v := q.Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				offset = n
			}
		}

		// The package stores + returns oldest-first. To present
		// newest-first with correct paging we pull the full matching set
		// (no limit on the package query), reverse, then slice the
		// requested window here. The audit DB is small for a single
		// homelab instance, so one scan is fine — and it keeps the audit
		// package untouched (locked: "no change to the audit package").
		all, err := log.Query(f)
		if err != nil {
			return http.StatusInternalServerError, err
		}
		reverseAuditEntries(all)

		total := len(all)
		start := offset
		if start > total {
			start = total
		}
		end := start + limit
		if end > total {
			end = total
		}

		userNames := map[uint]string{}
		if users, uErr := d.store.Users.Gets(d.server.Root); uErr == nil {
			for _, u := range users {
				userNames[u.ID] = u.Username
			}
		}

		return renderJSON(w, r, &auditResponse{
			Entries: all[start:end],
			Total:   total,
			Users:   userNames,
		})
	})
}
