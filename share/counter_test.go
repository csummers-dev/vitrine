package share

import (
	"errors"
	"sync"
	"testing"
	"time"

	fberrors "github.com/csummers-dev/vitrine/v4/errors"
)

// mapBackend stores copies, like a database would.
type mapBackend struct {
	mu    sync.Mutex
	links map[string]Link
	saves int
}

func (m *mapBackend) All() ([]*Link, error)                    { return nil, nil }
func (m *mapBackend) FindByUserID(uint) ([]*Link, error)       { return nil, nil }
func (m *mapBackend) GetPermanent(string, uint) (*Link, error) { return nil, nil }
func (m *mapBackend) Gets(string, uint) ([]*Link, error)       { return nil, nil }
func (m *mapBackend) DeleteWithPathPrefix(string) error        { return nil }

func (m *mapBackend) GetByHash(hash string) (*Link, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.links[hash]
	if !ok {
		return nil, fberrors.ErrNotExist
	}
	return &l, nil
}

func (m *mapBackend) Save(l *Link) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.links[l.Hash] = *l
	m.saves++
	return nil
}

func (m *mapBackend) Delete(hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.links, hash)
	return nil
}

func newCounterFixture(links ...Link) (*Counter, *mapBackend, *[]Link) {
	back := &mapBackend{links: map[string]Link{}}
	for _, l := range links {
		back.links[l.Hash] = l
	}
	var saved []Link
	c := NewCounter(NewStorage(back), func(l *Link) { saved = append(saved, *l) })
	c.now = func() time.Time { return time.Unix(1_800_000_000, 0) }
	return c, back, &saved
}

func TestCounterBuffersUntilFlush(t *testing.T) {
	c, back, saved := newCounterFixture(Link{Hash: "a"}, Link{Hash: "b"})
	for i := 0; i < 5; i++ {
		c.View("a")
	}
	c.Download("a")
	c.View("b")
	c.View("gone") // deleted link: skipped
	if back.saves != 0 {
		t.Fatalf("saved before flush: %d", back.saves)
	}
	if err := c.Flush(); err != nil {
		t.Fatal(err)
	}
	a := back.links["a"]
	if a.Views != 5 || a.Downloads != 1 || a.LastAccessAt != 1_800_000_000 {
		t.Errorf("a = %+v", a)
	}
	if back.links["b"].Views != 1 {
		t.Errorf("b = %+v", back.links["b"])
	}
	if back.saves != 2 || len(*saved) != 2 {
		t.Errorf("saves = %d, notified = %d", back.saves, len(*saved))
	}
	// Nothing pending: a second flush writes nothing.
	_ = c.Flush()
	if back.saves != 2 {
		t.Errorf("empty flush saved: %d", back.saves)
	}
}

func TestCounterTakeDownloadEnforcesLimit(t *testing.T) {
	c, back, _ := newCounterFixture(Link{Hash: "once", MaxDownloads: 1})
	c.View("once") // pending counts fold into the immediate save
	l, err := c.TakeDownload("once")
	if err != nil {
		t.Fatal(err)
	}
	if l.Downloads != 1 || back.links["once"].Views != 1 {
		t.Errorf("after first: %+v", back.links["once"])
	}
	if _, err := c.TakeDownload("once"); !errors.Is(err, ErrExhausted) {
		t.Errorf("second download err = %v, want ErrExhausted", err)
	}
	if l := back.links["once"]; !l.Exhausted() {
		t.Error("link should be exhausted")
	}
}

func TestCounterTakeDownloadConcurrent(t *testing.T) {
	c, back, _ := newCounterFixture(Link{Hash: "x", MaxDownloads: 3})
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.TakeDownload("x"); err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if ok != 3 || back.links["x"].Downloads != 3 {
		t.Errorf("granted %d downloads, stored %d; want 3", ok, back.links["x"].Downloads)
	}
}

func TestCounterReserveUpload(t *testing.T) {
	c, back, _ := newCounterFixture(Link{Hash: "box", Mode: ModeUpload, MaxTotalSize: 100})
	if _, err := c.ReserveUpload("box", "a.bin", 60); err != nil {
		t.Fatal(err)
	}
	if _, err := c.ReserveUpload("box", "b.bin", 60); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("second reserve err = %v, want ErrQuotaExceeded", err)
	}
	c.ReleaseUpload("box", 60)
	if l := back.links["box"]; l.UploadedBytes != 0 || l.Uploads != 0 {
		t.Fatalf("after release: %+v", l)
	}
	if _, err := c.ReserveUpload("box", "b.bin", 100); err != nil {
		t.Fatalf("reserve after release: %v", err)
	}
}
