package tags

import (
	"log"

	"github.com/filebrowser/filebrowser/v2/events"
)

// AttachIndexMaintainer wires the tags store into the in-process event
// bus so file_tags index keys follow their underlying paths automatically.
//
// Mapping (locked Stage 2 decisions, see docs/architecture-v1.3.md):
//
//   - FileRenamed / FileMoved → RenamePath(userID, from, to). The store
//     handles single-file rekey AND directory cascades (every descendant
//     file_tags entry gets its key rewritten with the new prefix).
//   - FileDeleted             → PurgePath(userID, path). Removes the
//     exact-match entry plus every descendant on directory delete.
//   - FileCopied              → INTENTIONAL NO-OP. Tags don't follow
//     copies; a copy is a new logical file, not a renamed one.
//   - Everything else         → ignored. (UserLoggedIn, ShareGranted,
//     SettingsChanged etc. have nothing to do with the file_tags index.)
//
// Persistence errors are logged but not propagated — the file op that
// triggered the event must not fail just because the tags index
// maintenance hit a transient bolt error. Same philosophy as the
// audit log subscriber.
//
// Wire from cmd/root.go right after opening the tags store:
//
//	unsubTags := tagsStore.AttachIndexMaintainer(events.Subscribe)
//	defer unsubTags()
//
// Returns the unsubscribe handle the caller is responsible for invoking
// on shutdown.
func (s *Store) AttachIndexMaintainer(
	subscribe func(func(events.Event)) (unsubscribe func()),
) func() {
	return subscribe(func(e events.Event) {
		switch ev := e.(type) {
		case events.FileRenamed:
			if err := s.RenamePath(ev.UserID, ev.From, ev.To); err != nil {
				log.Printf("tags: RenamePath on FileRenamed failed: %v", err)
			}
		case events.FileMoved:
			if err := s.RenamePath(ev.UserID, ev.From, ev.To); err != nil {
				log.Printf("tags: RenamePath on FileMoved failed: %v", err)
			}
		case events.FileDeleted:
			if err := s.PurgePath(ev.UserID, ev.Path); err != nil {
				log.Printf("tags: PurgePath on FileDeleted failed: %v", err)
			}
		case events.FileCopied:
			// No-op — tags don't follow copies (locked decision).
			// Branch is here so future contributors don't have to
			// wonder why FileCopied isn't handled.
		default:
			// Ignore every other event type. Anything we don't
			// understand isn't relevant to tag-path maintenance.
		}
	})
}
