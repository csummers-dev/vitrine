//go:build unix

package audiotags

import (
	"os"
	"syscall"
)

// preserveOwner best-effort restores the original file's uid/gid onto the
// replacement so an atomic tag write doesn't silently re-own the file to the
// server process. It only takes effect when the process has the privilege to
// chown (running as root, or CAP_CHOWN); otherwise the error is ignored and
// the file simply keeps the process's ownership — exactly as it would for any
// file the server creates.
func preserveOwner(path string, fi os.FileInfo) {
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return
	}
	_ = os.Chown(path, int(st.Uid), int(st.Gid))
}
