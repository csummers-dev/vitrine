package fbhttp

import "testing"

// TestMemoryUploadCache locks the contract the TUS resume flow depends on
// (v1.3 S6-3). The HEAD handler answers a resume probe with
// `Upload-Length` from this cache (and `Upload-Offset` from the file size
// on disk), so the Register → GetLength → Touch → Complete lifecycle must
// behave exactly as the handlers assume.
func TestMemoryUploadCache(t *testing.T) {
	t.Parallel()

	c := newMemoryUploadCache()
	defer c.Close()

	// A path far from any real file: Complete() below issues a Delete (not
	// an Expired) eviction, so the partial-file cleanup hook never fires —
	// nothing on disk is touched by this test.
	const path = "/tmp/filebrowser-tus-test/does-not-exist/upload.bin"
	const size int64 = 1024

	// Unregistered path → error (HEAD turns this into 404 "no active
	// upload", which tells the client the upload can't be resumed).
	if _, err := c.GetLength(path); err == nil {
		t.Fatalf("expected error for unregistered path")
	}

	// Register (POST creation) makes the declared length retrievable.
	c.Register(path, size)
	got, err := c.GetLength(path)
	if err != nil {
		t.Fatalf("GetLength after Register: %v", err)
	}
	if got != size {
		t.Fatalf("GetLength = %d, want %d", got, size)
	}

	// Touch (the keep-alive ticker during PATCH) keeps it retrievable.
	c.Touch(path)
	if _, err := c.GetLength(path); err != nil {
		t.Fatalf("GetLength after Touch: %v", err)
	}

	// Re-Register overwrites the length (an override re-upload of the same
	// path declaring a new size).
	c.Register(path, size*2)
	if got, _ := c.GetLength(path); got != size*2 {
		t.Fatalf("GetLength after re-Register = %d, want %d", got, size*2)
	}

	// Complete (final chunk written, or a tus DELETE) removes the entry so
	// a later resume probe correctly reports "no active upload".
	c.Complete(path)
	if _, err := c.GetLength(path); err == nil {
		t.Fatalf("expected error after Complete")
	}
}
