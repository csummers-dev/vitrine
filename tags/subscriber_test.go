package tags

import (
	"testing"

	"github.com/csummers-dev/vitrine/v3/events"
)

// Each subscriber test attaches to a fresh in-memory events bus
// (events.reset is package-private; we rely on Subscribe's unsubscribe
// to clean up between tests). Pattern mirrors the audit package's
// integration tests with the same bus.

func TestSubscriberHandlesFileRenamed(t *testing.T) {
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/old.txt", tag.ID)

	events.Publish(events.FileRenamed{
		Base: events.NewBase(1, ""),
		From: "/old.txt",
		To:   "/new.txt",
	})

	oldTags, _ := s.TagsForFile(1, "/old.txt")
	if len(oldTags) != 0 {
		t.Errorf("old path should be empty after FileRenamed, got %+v", oldTags)
	}
	newTags, _ := s.TagsForFile(1, "/new.txt")
	if len(newTags) != 1 || newTags[0].ID != tag.ID {
		t.Errorf("new path should carry the tag, got %+v", newTags)
	}
}

func TestSubscriberHandlesFileMovedSameAsRenamed(t *testing.T) {
	// FileMoved and FileRenamed take the same code path (both call
	// RenamePath). This test ensures the wiring is in place — without
	// it, FileMoved would be silently ignored as an "unknown" event.
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/A/x.txt", tag.ID)

	events.Publish(events.FileMoved{
		Base: events.NewBase(1, ""),
		From: "/A/x.txt",
		To:   "/B/x.txt",
	})

	if ts, _ := s.TagsForFile(1, "/A/x.txt"); len(ts) != 0 {
		t.Errorf("source should be empty after FileMoved, got %+v", ts)
	}
	if ts, _ := s.TagsForFile(1, "/B/x.txt"); len(ts) != 1 {
		t.Errorf("destination should carry the tag, got %+v", ts)
	}
}

func TestSubscriberHandlesDirectoryRename(t *testing.T) {
	// Directory renames cascade through the path-prefix descendant set
	// inside RenamePath. The subscriber doesn't do anything special —
	// it just forwards from/to — so this test mostly proves the
	// integration doesn't drop the dir-rename case.
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/dir/a.txt", tag.ID)
	_ = s.AddTag(1, "/dir/sub/b.txt", tag.ID)

	events.Publish(events.FileRenamed{
		Base: events.NewBase(1, ""),
		From: "/dir",
		To:   "/renamed",
	})

	if ts, _ := s.TagsForFile(1, "/renamed/a.txt"); len(ts) != 1 {
		t.Errorf("/renamed/a.txt should carry the tag after dir rename, got %+v", ts)
	}
	if ts, _ := s.TagsForFile(1, "/renamed/sub/b.txt"); len(ts) != 1 {
		t.Errorf("/renamed/sub/b.txt should carry the tag after dir rename, got %+v", ts)
	}
	if ts, _ := s.TagsForFile(1, "/dir/a.txt"); len(ts) != 0 {
		t.Errorf("old descendant should be empty, got %+v", ts)
	}
}

func TestSubscriberHandlesFileDeleted(t *testing.T) {
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/doomed.txt", tag.ID)

	events.Publish(events.FileDeleted{
		Base: events.NewBase(1, ""),
		Path: "/doomed.txt",
	})

	if ts, _ := s.TagsForFile(1, "/doomed.txt"); len(ts) != 0 {
		t.Errorf("deleted path should be purged, got %+v", ts)
	}
}

func TestSubscriberIgnoresFileCopied(t *testing.T) {
	// FileCopied is the locked "tags don't follow copies" case. The
	// subscriber must explicitly NOT call RenamePath / AddTag here —
	// the source should keep its tags, the destination should have none.
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/src.txt", tag.ID)

	events.Publish(events.FileCopied{
		Base: events.NewBase(1, ""),
		From: "/src.txt",
		To:   "/copy.txt",
	})

	srcTags, _ := s.TagsForFile(1, "/src.txt")
	if len(srcTags) != 1 {
		t.Errorf("source should KEEP its tag on FileCopied, got %+v", srcTags)
	}
	copyTags, _ := s.TagsForFile(1, "/copy.txt")
	if len(copyTags) != 0 {
		t.Errorf("copy should NOT inherit tags (locked decision), got %+v", copyTags)
	}
}

func TestSubscriberIgnoresUnrelatedEvents(t *testing.T) {
	// Any event the subscriber doesn't recognize must not crash the
	// publisher and must not touch the tags index. Publishing each
	// here would be flaky (most need a real user) — instead we publish
	// a known-irrelevant event and assert the tags state is untouched.
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)
	defer unsub()

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/x.txt", tag.ID)

	events.Publish(events.UserLoggedIn{
		Base:     events.NewBase(1, ""),
		Username: "alice",
	})

	ts, _ := s.TagsForFile(1, "/x.txt")
	if len(ts) != 1 {
		t.Errorf("unrelated event must not affect tags, got %+v", ts)
	}
}

func TestSubscriberUnsubscribeStopsHandling(t *testing.T) {
	s := newTestStore(t)
	unsub := s.AttachIndexMaintainer(events.Subscribe)

	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/a.txt", tag.ID)

	// First event SHOULD propagate.
	events.Publish(events.FileRenamed{
		Base: events.NewBase(1, ""),
		From: "/a.txt",
		To:   "/b.txt",
	})
	if ts, _ := s.TagsForFile(1, "/b.txt"); len(ts) != 1 {
		t.Fatalf("pre-unsub: expected rename to apply, got %+v", ts)
	}

	// After unsub, the same event must be a no-op.
	unsub()
	events.Publish(events.FileRenamed{
		Base: events.NewBase(1, ""),
		From: "/b.txt",
		To:   "/c.txt",
	})
	if ts, _ := s.TagsForFile(1, "/b.txt"); len(ts) != 1 {
		t.Errorf("post-unsub: /b.txt should be unchanged (subscriber gone), got %+v", ts)
	}
	if ts, _ := s.TagsForFile(1, "/c.txt"); len(ts) != 0 {
		t.Errorf("post-unsub: /c.txt should be empty, got %+v", ts)
	}
}
