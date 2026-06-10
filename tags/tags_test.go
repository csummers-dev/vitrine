package tags

import (
	"path/filepath"
	"sort"
	"testing"
)

// newTestStore returns a freshly-initialized Store rooted in t.TempDir;
// closed on cleanup so we don't leak bolt handles.
func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "tags.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestCreateAndListTag(t *testing.T) {
	s := newTestStore(t)
	created, err := s.CreateTag(1, "Work", "blue")
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if created.ID == 0 || created.Name != "Work" || created.Color != "blue" {
		t.Fatalf("bad created: %+v", created)
	}
	if created.CreatedAt.IsZero() {
		t.Errorf("CreatedAt was zero")
	}

	tags, err := s.ListTags(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 1 || tags[0].ID != created.ID {
		t.Fatalf("ListTags got %+v", tags)
	}
}

func TestCreateTagAppliesDefaultColor(t *testing.T) {
	s := newTestStore(t)
	tag, err := s.CreateTag(1, "Default", "")
	if err != nil {
		t.Fatal(err)
	}
	if tag.Color != DefaultColor {
		t.Errorf("Color got %q want %q", tag.Color, DefaultColor)
	}
}

func TestCreateTagRejectsInvalidColor(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.CreateTag(1, "Bad", "neon-pink"); err == nil {
		t.Fatal("CreateTag with invalid color should fail")
	}
}

func TestCreateTagRejectsEmptyName(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.CreateTag(1, "   ", ""); err == nil {
		t.Fatal("CreateTag with empty name should fail")
	}
}

func TestCreateTagRejectsDuplicateName(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.CreateTag(1, "Urgent", "red")
	// Different case should still collide — duplicate detection is
	// case-insensitive.
	if _, err := s.CreateTag(1, "urgent", "red"); err != ErrDuplicateName {
		t.Fatalf("expected ErrDuplicateName, got %v", err)
	}
}

func TestTagsAreScopedPerUser(t *testing.T) {
	s := newTestStore(t)
	a, _ := s.CreateTag(1, "A", "red")
	b, _ := s.CreateTag(2, "A", "blue") // Same name OK for different user.

	user1Tags, _ := s.ListTags(1)
	user2Tags, _ := s.ListTags(2)
	if len(user1Tags) != 1 || user1Tags[0].ID != a.ID {
		t.Errorf("user 1 leaked: %+v", user1Tags)
	}
	if len(user2Tags) != 1 || user2Tags[0].ID != b.ID {
		t.Errorf("user 2 leaked: %+v", user2Tags)
	}
}

func TestUpdateTag(t *testing.T) {
	s := newTestStore(t)
	t1, _ := s.CreateTag(1, "Original", "blue")

	updated, err := s.UpdateTag(1, t1.ID, "Renamed", "green")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Renamed" || updated.Color != "green" {
		t.Errorf("update didn't apply: %+v", updated)
	}

	// Empty fields = leave unchanged.
	updated2, err := s.UpdateTag(1, t1.ID, "", "amber")
	if err != nil {
		t.Fatal(err)
	}
	if updated2.Name != "Renamed" || updated2.Color != "amber" {
		t.Errorf("partial update wrong: %+v", updated2)
	}
}

func TestUpdateTagRejectsDuplicateRename(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.CreateTag(1, "Existing", "blue")
	target, _ := s.CreateTag(1, "Other", "green")

	if _, err := s.UpdateTag(1, target.ID, "Existing", ""); err != ErrDuplicateName {
		t.Errorf("expected ErrDuplicateName, got %v", err)
	}
}

func TestDeleteTagPurgesFromFileTags(t *testing.T) {
	s := newTestStore(t)
	t1, _ := s.CreateTag(1, "DeleteMe", "red")
	t2, _ := s.CreateTag(1, "Survivor", "blue")
	_ = s.AddTag(1, "/a.txt", t1.ID)
	_ = s.AddTag(1, "/a.txt", t2.ID)
	_ = s.AddTag(1, "/b.txt", t1.ID) // /b.txt only has t1 — should be fully purged

	if err := s.DeleteTag(1, t1.ID); err != nil {
		t.Fatal(err)
	}

	// t1 itself should be gone.
	if _, err := s.GetTag(1, t1.ID); err != ErrTagNotFound {
		t.Errorf("GetTag deleted: expected ErrTagNotFound, got %v", err)
	}
	// /a.txt should retain only t2.
	tagsA, _ := s.TagsForFile(1, "/a.txt")
	if len(tagsA) != 1 || tagsA[0].ID != t2.ID {
		t.Errorf("/a.txt should retain t2 only, got %+v", tagsA)
	}
	// /b.txt had only t1 — entry should be deleted entirely.
	tagsB, _ := s.TagsForFile(1, "/b.txt")
	if len(tagsB) != 0 {
		t.Errorf("/b.txt should be empty after cascade, got %+v", tagsB)
	}
}

func TestDeleteMissingTagIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	if err := s.DeleteTag(1, 9999); err != nil {
		t.Errorf("DeleteTag of missing tag should be nil, got %v", err)
	}
}

func TestAddTagRejectsUnknownTagID(t *testing.T) {
	s := newTestStore(t)
	if err := s.AddTag(1, "/a.txt", 999); err != ErrTagNotFound {
		t.Errorf("AddTag with unknown tag: expected ErrTagNotFound, got %v", err)
	}
}

func TestAddTagIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	tag, _ := s.CreateTag(1, "T", "blue")
	_ = s.AddTag(1, "/a.txt", tag.ID)
	_ = s.AddTag(1, "/a.txt", tag.ID) // duplicate
	tags, _ := s.TagsForFile(1, "/a.txt")
	if len(tags) != 1 {
		t.Errorf("duplicate AddTag should be deduped, got %d tags", len(tags))
	}
}

func TestRemoveTagAndCleanup(t *testing.T) {
	s := newTestStore(t)
	t1, _ := s.CreateTag(1, "A", "red")
	t2, _ := s.CreateTag(1, "B", "blue")
	_ = s.AddTag(1, "/x.txt", t1.ID)
	_ = s.AddTag(1, "/x.txt", t2.ID)

	if err := s.RemoveTag(1, "/x.txt", t1.ID); err != nil {
		t.Fatal(err)
	}
	tags, _ := s.TagsForFile(1, "/x.txt")
	if len(tags) != 1 || tags[0].ID != t2.ID {
		t.Errorf("after RemoveTag(t1), only t2 should remain — got %+v", tags)
	}

	// Removing the last tag should drop the file_tags entry entirely.
	_ = s.RemoveTag(1, "/x.txt", t2.ID)
	files, _ := s.FilesForTag(1, t2.ID)
	for _, f := range files {
		if f == "/x.txt" {
			t.Errorf("FilesForTag should not include path with no tags")
		}
	}
}

func TestFilesForTag(t *testing.T) {
	s := newTestStore(t)
	t1, _ := s.CreateTag(1, "T", "red")
	for _, p := range []string{"/c.txt", "/a.txt", "/b.txt"} {
		_ = s.AddTag(1, p, t1.ID)
	}
	files, err := s.FilesForTag(1, t1.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Sorted ascending.
	want := []string{"/a.txt", "/b.txt", "/c.txt"}
	if !equalStrings(files, want) {
		t.Errorf("FilesForTag got %v want %v", files, want)
	}
}

func TestBatchTagsForFiles(t *testing.T) {
	s := newTestStore(t)
	t1, _ := s.CreateTag(1, "A", "red")
	t2, _ := s.CreateTag(1, "B", "blue")
	_ = s.AddTag(1, "/x", t1.ID)
	_ = s.AddTag(1, "/x", t2.ID)
	_ = s.AddTag(1, "/y", t1.ID)
	// /z has no tags — should be absent from the result map.

	result, err := s.BatchTagsForFiles(1, []string{"/x", "/y", "/z"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 2 {
		t.Fatalf("got %d entries want 2 (x, y) — z should be absent", len(result))
	}
	if len(result["/x"]) != 2 {
		t.Errorf("/x should have 2 tags, got %d", len(result["/x"]))
	}
	if len(result["/y"]) != 1 || result["/y"][0].ID != t1.ID {
		t.Errorf("/y should have t1 only, got %+v", result["/y"])
	}
	if _, ok := result["/z"]; ok {
		t.Errorf("/z should be omitted from result (no tags)")
	}
}

func TestRenamePathSingleFile(t *testing.T) {
	s := newTestStore(t)
	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/old.txt", tag.ID)

	if err := s.RenamePath(1, "/old.txt", "/new.txt"); err != nil {
		t.Fatal(err)
	}
	oldTags, _ := s.TagsForFile(1, "/old.txt")
	if len(oldTags) != 0 {
		t.Errorf("old path should be gone, got %+v", oldTags)
	}
	newTags, _ := s.TagsForFile(1, "/new.txt")
	if len(newTags) != 1 || newTags[0].ID != tag.ID {
		t.Errorf("new path should carry the tag, got %+v", newTags)
	}
}

func TestRenamePathCascadesIntoDirectory(t *testing.T) {
	s := newTestStore(t)
	tag, _ := s.CreateTag(1, "T", "red")
	// Tag three files inside the dir, plus an unrelated outside file.
	_ = s.AddTag(1, "/dir/a.txt", tag.ID)
	_ = s.AddTag(1, "/dir/b.txt", tag.ID)
	_ = s.AddTag(1, "/dir/sub/c.txt", tag.ID)
	_ = s.AddTag(1, "/elsewhere/x.txt", tag.ID)

	if err := s.RenamePath(1, "/dir", "/newdir"); err != nil {
		t.Fatal(err)
	}

	// All three descendants moved.
	for _, p := range []string{"/newdir/a.txt", "/newdir/b.txt", "/newdir/sub/c.txt"} {
		ts, _ := s.TagsForFile(1, p)
		if len(ts) != 1 {
			t.Errorf("path %s should have 1 tag after dir rename, got %d", p, len(ts))
		}
	}
	// Old paths are gone.
	for _, p := range []string{"/dir/a.txt", "/dir/b.txt", "/dir/sub/c.txt"} {
		ts, _ := s.TagsForFile(1, p)
		if len(ts) != 0 {
			t.Errorf("old path %s should be empty, got %d tags", p, len(ts))
		}
	}
	// Unrelated path untouched.
	ts, _ := s.TagsForFile(1, "/elsewhere/x.txt")
	if len(ts) != 1 {
		t.Errorf("/elsewhere/x.txt should be untouched, got %d tags", len(ts))
	}
}

func TestPurgePathDeletesFileAndDescendants(t *testing.T) {
	s := newTestStore(t)
	tag, _ := s.CreateTag(1, "T", "red")
	_ = s.AddTag(1, "/dir", tag.ID) // dir's own entry (edge case)
	_ = s.AddTag(1, "/dir/a.txt", tag.ID)
	_ = s.AddTag(1, "/dir/b.txt", tag.ID)
	_ = s.AddTag(1, "/other.txt", tag.ID)

	if err := s.PurgePath(1, "/dir"); err != nil {
		t.Fatal(err)
	}

	for _, p := range []string{"/dir", "/dir/a.txt", "/dir/b.txt"} {
		ts, _ := s.TagsForFile(1, p)
		if len(ts) != 0 {
			t.Errorf("path %s should be purged, got %d tags", p, len(ts))
		}
	}
	ts, _ := s.TagsForFile(1, "/other.txt")
	if len(ts) != 1 {
		t.Errorf("/other.txt should survive, got %d tags", len(ts))
	}
}

func TestPersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tags.db")

	s1, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	tag, _ := s1.CreateTag(1, "Persists", "green")
	_ = s1.AddTag(1, "/file.txt", tag.ID)
	_ = s1.Close()

	s2, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s2.Close() })

	tags, _ := s2.ListTags(1)
	if len(tags) != 1 || tags[0].Name != "Persists" {
		t.Fatalf("ListTags after reopen got %+v", tags)
	}
	fileTags, _ := s2.TagsForFile(1, "/file.txt")
	if len(fileTags) != 1 || fileTags[0].ID != tag.ID {
		t.Fatalf("TagsForFile after reopen got %+v", fileTags)
	}
}

func TestListTagsReturnsSortedByName(t *testing.T) {
	s := newTestStore(t)
	for _, name := range []string{"Charlie", "alpha", "Bravo"} {
		if _, err := s.CreateTag(1, name, "blue"); err != nil {
			t.Fatal(err)
		}
	}
	tags, _ := s.ListTags(1)
	names := make([]string, len(tags))
	for i, t := range tags {
		names[i] = t.Name
	}
	// Case-insensitive sort: alpha, Bravo, Charlie.
	want := []string{"alpha", "Bravo", "Charlie"}
	if !equalStrings(names, want) {
		t.Errorf("got %v want %v", names, want)
	}
}

// Test-only helper.
func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	ac, bc := append([]string(nil), a...), append([]string(nil), b...)
	sort.Strings(ac)
	sort.Strings(bc)
	for i := range ac {
		if ac[i] != bc[i] {
			return false
		}
	}
	// Also preserve order for the original (we want sorted ascending).
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestApplyTagsBatch(t *testing.T) {
	s := newTestStore(t)
	work, _ := s.CreateTag(1, "Work", "blue")
	urgent, _ := s.CreateTag(1, "Urgent", "red")

	paths := []string{"/a.txt", "/b.txt", "/c.txt"}

	// Add Work + Urgent to all three.
	if err := s.ApplyTagsBatch(1, paths, []uint64{work.ID, urgent.ID}, nil); err != nil {
		t.Fatalf("apply add: %v", err)
	}
	for _, p := range paths {
		got, _ := s.TagsForFile(1, p)
		if len(got) != 2 {
			t.Errorf("%s: want 2 tags, got %d", p, len(got))
		}
	}

	// Remove Urgent from all; Work remains.
	if err := s.ApplyTagsBatch(1, paths, nil, []uint64{urgent.ID}); err != nil {
		t.Fatalf("apply remove: %v", err)
	}
	got, _ := s.TagsForFile(1, "/a.txt")
	if len(got) != 1 || got[0].ID != work.ID {
		t.Errorf("after remove want only Work, got %+v", got)
	}

	// add wins over remove when an id is in both lists.
	if err := s.ApplyTagsBatch(1, []string{"/a.txt"}, []uint64{urgent.ID}, []uint64{urgent.ID}); err != nil {
		t.Fatal(err)
	}
	got, _ = s.TagsForFile(1, "/a.txt")
	if len(got) != 2 {
		t.Errorf("add-wins: want 2 tags, got %d", len(got))
	}

	// Removing the last tag deletes the path's row (TagsForFile → empty).
	if err := s.ApplyTagsBatch(1, []string{"/c.txt"}, nil, []uint64{work.ID, urgent.ID}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.TagsForFile(1, "/c.txt"); len(got) != 0 {
		t.Errorf("want no tags after removing all, got %+v", got)
	}
}

func TestApplyTagsBatchRejectsUnknownAddID(t *testing.T) {
	s := newTestStore(t)
	if err := s.ApplyTagsBatch(1, []string{"/a.txt"}, []uint64{999}, nil); err == nil {
		t.Fatal("adding a nonexistent tag id should fail (ErrTagNotFound)")
	}
	// And nothing should have been written.
	if got, _ := s.TagsForFile(1, "/a.txt"); len(got) != 0 {
		t.Errorf("a rejected batch must not write anything, got %+v", got)
	}
}
