// Package trash implements the 2.4.0 recycle bin: deleted items are MOVED into
// a per-volume `.trash` directory (an instant same-device rename) and recorded
// in a bolt index so they can be listed, restored, or deleted forever.
//
// Design (locked in docs/plan-v2.4.md, Stage 2):
//
//   - **Per-volume `.trash`.** The trash directory lives at the TOP of the
//     filesystem volume the deleted item is on — the highest ancestor directory
//     (bounded by the server root) with the same device id. By construction the
//     move into trash is a same-device rename: instant, no byte copying, no
//     disk thrash, regardless of which mount the file lives on.
//   - **Fallback copy+delete.** If a volume's trash dir can't be used (read-only
//     mount, exotic fs) the item falls back to the server-root trash via
//     fileutils.MoveFileWithProgress, which copies then deletes. Slower but
//     never lost.
//   - **Bolt index, sibling DB file** (`<dbName>-trash.db`) — same operational
//     pattern as the tags/audit/webhooks stores: one extra file next to the
//     main database, nothing else for the operator to learn.
//   - **Absolute OS paths.** Entries record absolute paths (the user-scope ↔
//     URL translation happens in the HTTP layer), so multi-scope users share
//     one index and the purge ticker needs no user context.
//   - **Trash is never trashed.** Deleting inside a `.trash` directory is the
//     caller's signal to delete permanently; IsTrashPath is the shared check.
package trash

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/spf13/afero"
	bolt "go.etcd.io/bbolt"

	"github.com/filebrowser/filebrowser/v2/fileutils"
)

// Dirname is the on-disk name of every trash directory.
const Dirname = ".trash"

var bucketEntries = []byte("entries")

// ErrNotFound is returned for an unknown entry id.
var ErrNotFound = errors.New("trash entry not found")

// Entry is one trashed item, as stored in the index and returned by List.
type Entry struct {
	ID string `json:"id"`
	// OriginalPath is the ABSOLUTE OS path the item lived at before deletion.
	OriginalPath string `json:"originalPath"`
	// TrashPath is the ABSOLUTE OS path of the item inside its .trash dir.
	TrashPath string    `json:"trashPath"`
	Name      string    `json:"name"`
	IsDir     bool      `json:"isDir"`
	Size      int64     `json:"size"`
	TrashedAt time.Time `json:"trashedAt"`
	// User is the username that deleted the item (display/audit only).
	User string `json:"user"`
}

// Store is the trash index plus the filesystem operations that keep the index
// and the on-disk .trash directories in sync. Safe for concurrent use.
type Store struct {
	db *bolt.DB
	// mu serializes multi-step fs+index operations (trash/restore/purge) so a
	// concurrent purge can't delete an entry mid-restore.
	mu sync.Mutex
}

// New opens (or creates) the trash bolt DB at dbPath.
func New(dbPath string) (*Store, error) {
	db, err := bolt.Open(dbPath, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(bucketEntries)
		return err
	})
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close releases the bolt DB.
func (s *Store) Close() error { return s.db.Close() }

// IsTrashPath reports whether the absolute path p is a .trash directory or
// lives inside one — used to (a) hide trash dirs from listings/search and
// (b) make deletes inside trash permanent instead of recursively trashed.
func IsTrashPath(p string) bool {
	p = path.Clean(p)
	if path.Base(p) == Dirname {
		return true
	}
	return strings.Contains(p, "/"+Dirname+"/")
}

// newID returns a time-ordered unique id (sortable newest-last by string).
func newID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%020d-%s", time.Now().UnixNano(), hex.EncodeToString(b))
}

// volumeTop returns the highest ancestor directory of absPath — never above
// bound — that still lives on the SAME filesystem volume (device id) as
// absPath's parent. The .trash dir created there makes the move-to-trash an
// instant same-device rename. If device ids are unavailable (e.g. Windows,
// exotic fs), it conservatively returns bound (one trash at the server root).
func volumeTop(fs afero.Fs, absPath, bound string) string {
	bound = path.Clean(bound)
	dir := path.Dir(path.Clean(absPath))
	dev, ok := fileutils.DeviceID(fs, dir)
	if !ok {
		return bound
	}
	top := dir
	for top != bound && strings.HasPrefix(top, bound) {
		parent := path.Dir(top)
		pdev, ok := fileutils.DeviceID(fs, parent)
		if !ok || pdev != dev || !strings.HasPrefix(parent, bound) {
			break
		}
		top = parent
	}
	if !strings.HasPrefix(top, bound) {
		return bound
	}
	return top
}

// MoveToTrash moves the item at absPath into the appropriate .trash directory
// and records it in the index. bound is the server root (the volume-top walk
// never climbs above it). Returns the recorded entry.
//
// The destination is `<volumeTop>/.trash/<id>__<name>` — same device as the
// source by construction, so the underlying rename is instant. If that trash
// dir can't be created or the move fails, it falls back to the server-root
// trash (potentially a cross-device copy+delete, but never data loss: the
// source is only removed after a successful copy).
func (s *Store) MoveToTrash(fs afero.Fs, absPath, bound, username string) (Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	absPath = path.Clean(absPath)
	info, err := fs.Stat(absPath)
	if err != nil {
		return Entry{}, err
	}

	id := newID()
	diskName := id + "__" + info.Name()

	tryDirs := []string{
		path.Join(volumeTop(fs, absPath, bound), Dirname),
		path.Join(path.Clean(bound), Dirname),
	}

	var lastErr error
	for _, trashDir := range tryDirs {
		if err := fs.MkdirAll(trashDir, 0o755); err != nil {
			lastErr = err
			continue
		}
		dst := path.Join(trashDir, diskName)
		// Rename first (instant when same-device — the normal case). Fall back
		// to copy+delete via the fileutils mover, which only removes the
		// source after the copy fully succeeds.
		if err := fs.Rename(absPath, dst); err != nil {
			if err = fileutils.MoveFile(fs, absPath, dst, 0o644, 0o755); err != nil {
				lastErr = err
				continue
			}
		}
		e := Entry{
			ID:           id,
			OriginalPath: absPath,
			TrashPath:    dst,
			Name:         info.Name(),
			IsDir:        info.IsDir(),
			Size:         info.Size(),
			TrashedAt:    time.Now().UTC(),
			User:         username,
		}
		if err := s.put(e); err != nil {
			// Index write failed after the move — put the item back so the
			// user never loses sight of it. Best-effort.
			_ = fs.Rename(dst, absPath)
			return Entry{}, err
		}
		return e, nil
	}
	return Entry{}, fmt.Errorf("trash: no usable trash directory: %w", lastErr)
}

// Restore moves entry id back to its original path and drops it from the
// index. If the original path is taken, the restored item gets the backend's
// usual "(N)" suffix. Returns the (possibly suffixed) absolute restore path.
func (s *Store) Restore(fs afero.Fs, id string) (Entry, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, err := s.get(id)
	if err != nil {
		return Entry{}, "", err
	}
	if _, err := fs.Stat(e.TrashPath); err != nil {
		// The trashed payload is gone (external cleanup) — drop the stale
		// index entry and report.
		_ = s.del(id)
		return e, "", fmt.Errorf("trash: payload missing for %q: %w", e.Name, err)
	}

	dest := addVersionSuffix(fs, e.OriginalPath)
	if err := fs.MkdirAll(path.Dir(dest), 0o755); err != nil {
		return e, "", err
	}
	if err := fs.Rename(e.TrashPath, dest); err != nil {
		if err = fileutils.MoveFile(fs, e.TrashPath, dest, 0o644, 0o755); err != nil {
			return e, "", err
		}
	}
	if err := s.del(id); err != nil {
		return e, dest, err
	}
	return e, dest, nil
}

// DeleteForever removes entry id's payload from disk and drops the index
// entry. A missing payload is not an error (the goal state is reached).
func (s *Store) DeleteForever(fs afero.Fs, id string) (Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, err := s.get(id)
	if err != nil {
		return Entry{}, err
	}
	if err := forceRemoveAll(fs, e.TrashPath); err != nil && !os.IsNotExist(err) {
		return e, err
	}
	return e, s.del(id)
}

// forceRemoveAll removes the tree at root, retrying once after a permission
// failure by lifting the owner write+search bits on every directory inside.
//
// RemoveAll needs WRITE+SEARCH on each directory to unlink its children, so a
// trashed folder containing a read-only subdirectory (or one owned with
// restrictive modes by another service — common on NAS setups where several
// containers write the same volume) fails with EACCES, which the HTTP layer
// surfaces as a baffling 403 on the Trash page. The tree lives inside the
// app-managed `.trash` and the caller has already committed to deletion, so
// making it deletable is the correct reading of intent. Files are left
// untouched — unlinking needs only the parent directory's bits.
func forceRemoveAll(fs afero.Fs, root string) error {
	err := fs.RemoveAll(root)
	if err == nil || os.IsNotExist(err) {
		return nil
	}
	if !os.IsPermission(err) {
		return err
	}
	// Walk visits a directory BEFORE reading its children (filepath.Walk
	// semantics), so chmod-ing each dir as we reach it also unlocks descent
	// into it. Chmod/walk errors are deliberately ignored — the retried
	// RemoveAll below is the arbiter of success.
	_ = afero.Walk(fs, root, func(p string, info os.FileInfo, werr error) error {
		if werr != nil || info == nil {
			return nil
		}
		if info.IsDir() {
			_ = fs.Chmod(p, info.Mode().Perm()|0o700)
		}
		return nil
	})
	return fs.RemoveAll(root)
}

// List returns every entry whose OriginalPath is inside scopeAbs (use the
// server root to list everything), newest first.
func (s *Store) List(scopeAbs string) ([]Entry, error) {
	scopeAbs = path.Clean(scopeAbs)
	// "/" must yield prefix "/" (not "//", which matches nothing).
	prefix := scopeAbs
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	var out []Entry
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketEntries).ForEach(func(_, v []byte) error {
			var e Entry
			if err := json.Unmarshal(v, &e); err != nil {
				return nil // skip corrupt rows rather than failing the listing
			}
			if e.OriginalPath == scopeAbs || strings.HasPrefix(e.OriginalPath, prefix) {
				out = append(out, e)
			}
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TrashedAt.After(out[j].TrashedAt) })
	return out, nil
}

// PurgeOlderThan permanently deletes every entry trashed before cutoff,
// regardless of scope. Returns how many entries were purged. Errors on
// individual entries are skipped (retried next tick) — the ticker must
// never wedge on one bad row.
func (s *Store) PurgeOlderThan(fs afero.Fs, cutoff time.Time) (int, error) {
	entries, err := s.List("/")
	if err != nil {
		return 0, err
	}
	purged := 0
	for _, e := range entries {
		if e.TrashedAt.After(cutoff) {
			continue
		}
		if _, err := s.DeleteForever(fs, e.ID); err == nil {
			purged++
		}
	}
	return purged, nil
}

func (s *Store) put(e Entry) error {
	raw, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketEntries).Put([]byte(e.ID), raw)
	})
}

func (s *Store) get(id string) (Entry, error) {
	var e Entry
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(bucketEntries).Get([]byte(id))
		if raw == nil {
			return ErrNotFound
		}
		return json.Unmarshal(raw, &e)
	})
	return e, err
}

func (s *Store) del(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketEntries).Delete([]byte(id))
	})
}

// addVersionSuffix mirrors the HTTP layer's conflict naming (base(N)ext, N
// from 1) so a restore that collides with a newer file keeps both.
func addVersionSuffix(fs afero.Fs, source string) string {
	counter := 1
	dir, name := path.Split(source)
	ext := path.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for {
		if _, err := fs.Stat(source); err != nil {
			break
		}
		source = path.Join(dir, fmt.Sprintf("%s(%d)%s", base, counter, ext))
		counter++
	}
	return source
}
