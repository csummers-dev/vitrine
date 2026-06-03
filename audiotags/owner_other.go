//go:build !unix

package audiotags

import "os"

// preserveOwner is a no-op on platforms without POSIX uid/gid ownership
// (e.g. Windows). Permission bits are still preserved by atomicReplace.
func preserveOwner(_ string, _ os.FileInfo) {}
