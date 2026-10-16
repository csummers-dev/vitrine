package fbhttp

import (
	"errors"
	"net/http"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// upgradeNoticeGetHandler returns the pending database-upgrade notice for
// admins (4.0 Phase 6, 5.7), or null when there is none.
var upgradeNoticeGetHandler = withAdmin(func(w http.ResponseWriter, r *http.Request, d *data) (int, error) {
	n, err := d.store.Settings.UpgradeNotice()
	if errors.Is(err, fberrors.ErrNotExist) {
		return renderJSON(w, r, nil)
	}
	if err != nil {
		return http.StatusInternalServerError, err
	}
	return renderJSON(w, r, n)
})

// upgradeNoticeDeleteHandler dismisses the notice for good.
var upgradeNoticeDeleteHandler = withAdmin(func(_ http.ResponseWriter, _ *http.Request, d *data) (int, error) {
	if err := d.store.Settings.ClearUpgradeNotice(); err != nil {
		return http.StatusInternalServerError, err
	}
	return http.StatusNoContent, nil
})
