package cache

import (
	"bytes"
	"fmt"
	"testing"
	"time"
)

// Helper: build a Cache rooted in t.TempDir, auto-closed on cleanup.
func newTestCache(t *testing.T, maxSize int64) *Cache {
	t.Helper()
	c, err := New(t.TempDir(), maxSize)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func TestPutGetRoundTrip(t *testing.T) {
	c := newTestCache(t, 0)
	want := []byte("hello world")
	if err := c.Put("k", want); err != nil {
		t.Fatalf("Put: %v", err)
	}
	got, ok := c.Get("k")
	if !ok {
		t.Fatal("Get returned ok=false")
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("Get got %q want %q", got, want)
	}
}

func TestGetMissingReturnsFalse(t *testing.T) {
	c := newTestCache(t, 0)
	if _, ok := c.Get("nope"); ok {
		t.Fatal("Get of missing key returned ok=true")
	}
}

func TestDelete(t *testing.T) {
	c := newTestCache(t, 0)
	_ = c.Put("k", []byte("v"))
	if err := c.Delete("k"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, ok := c.Get("k"); ok {
		t.Fatal("Get after Delete returned ok=true")
	}
}

func TestSizeAndCount(t *testing.T) {
	c := newTestCache(t, 0)
	_ = c.Put("a", []byte("hello"))   // 5
	_ = c.Put("b", []byte("greatly")) // 7
	if got := c.Size(); got != 12 {
		t.Fatalf("Size got %d want 12", got)
	}
	if got := c.Count(); got != 2 {
		t.Fatalf("Count got %d want 2", got)
	}
}

func TestLRUEvictionUnderCap(t *testing.T) {
	// 30-byte cap. Each entry is 10 bytes. After inserting 4 entries
	// and touching "a", evictOnce should drop the two oldest untouched
	// entries to get back under cap.
	c := newTestCache(t, 30)

	put := func(k string) {
		t.Helper()
		if err := c.Put(k, bytes.Repeat([]byte("x"), 10)); err != nil {
			t.Fatalf("Put %s: %v", k, err)
		}
	}

	put("a")
	put("b")
	put("c")
	// Subsequent Puts share the same millisecond on fast machines;
	// inject a tiny gap so the lastAccess timestamps differ enough to
	// produce a deterministic sort order.
	time.Sleep(2 * time.Millisecond)
	put("d")
	time.Sleep(2 * time.Millisecond)

	// Bump "a" to most-recent — it should survive the cull.
	if _, ok := c.Get("a"); !ok {
		t.Fatal("Get(a) before eviction")
	}

	if got := c.Size(); got != 40 {
		t.Fatalf("pre-evict Size got %d want 40", got)
	}

	c.EvictOnce()

	if got := c.Size(); got > 30 {
		t.Fatalf("post-evict Size got %d, expected ≤ 30", got)
	}
	// "a" was touched last → survives. "b" and "c" were the oldest →
	// the evictor should have chosen them.
	if _, ok := c.Get("a"); !ok {
		t.Fatal("Get(a) after eviction — most-recent should survive")
	}
}

func TestPurgeAll(t *testing.T) {
	c := newTestCache(t, 0)
	for i := 0; i < 5; i++ {
		_ = c.Put(fmt.Sprintf("k%d", i), []byte("v"))
	}
	if err := c.PurgeAll(); err != nil {
		t.Fatalf("PurgeAll: %v", err)
	}
	if got := c.Count(); got != 0 {
		t.Fatalf("Count after PurgeAll got %d want 0", got)
	}
}

func TestPersistenceAcrossClose(t *testing.T) {
	dir := t.TempDir()
	c1, err := New(dir, 0)
	if err != nil {
		t.Fatalf("New 1: %v", err)
	}
	if err := c1.Put("k", []byte("persisted")); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := c1.Close(); err != nil {
		t.Fatalf("Close 1: %v", err)
	}

	c2, err := New(dir, 0)
	if err != nil {
		t.Fatalf("New 2: %v", err)
	}
	t.Cleanup(func() { _ = c2.Close() })

	got, ok := c2.Get("k")
	if !ok {
		t.Fatal("Get after reopen returned ok=false")
	}
	if string(got) != "persisted" {
		t.Fatalf("Get after reopen got %q", got)
	}
}
