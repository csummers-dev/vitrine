//go:build windows

package fileutils

import "github.com/spf13/afero"

// SameVolume always reports false on Windows: there is no portable st_dev to
// compare, so every move takes the ordinary queued path (correct, just not
// expedited onto the fast lane). The fast-lane optimization is a Unix-only
// nicety — the file servers this targets run Linux.
func SameVolume(_ afero.Fs, _, _ string) (bool, error) {
	return false, nil
}
