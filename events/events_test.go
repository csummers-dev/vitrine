package events

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Each test resets the global subscriber registry so cases don't leak
// into each other. We use the package-private reset() rather than
// tracking unsubscribes explicitly — simpler and explicit about intent.
func resetBus(t *testing.T) {
	t.Helper()
	reset()
	t.Cleanup(reset)
}

func TestBaseStampsTimestampAndCarriesIdentity(t *testing.T) {
	before := time.Now()
	b := NewBase(42, "10.0.0.1")
	if b.UserID != 42 {
		t.Fatalf("UserID got %d want 42", b.UserID)
	}
	if b.IP != "10.0.0.1" {
		t.Fatalf("IP got %q want 10.0.0.1", b.IP)
	}
	if b.At.Before(before) || b.At.After(time.Now()) {
		t.Fatalf("At %v outside expected window", b.At)
	}
}

func TestEventTypeStringsAreStable(t *testing.T) {
	// These strings get persisted in the audit log + sent in webhook
	// payloads — changing them is a breaking change. This test is the
	// canary: bump the expected value here and you're committing to
	// also bumping any downstream consumer.
	cases := []struct {
		ev   Event
		want string
	}{
		{FileCreated{}, "file.created"},
		{FileRenamed{}, "file.renamed"},
		{FileMoved{}, "file.moved"},
		{FileCopied{}, "file.copied"},
		{FileDeleted{}, "file.deleted"},
		{FileUploaded{}, "file.uploaded"},
		{ShareGranted{}, "share.granted"},
		{ShareRevoked{}, "share.revoked"},
		{UserLoggedIn{}, "user.loggedIn"},
		{UserLoggedOut{}, "user.loggedOut"},
		{SettingsChanged{}, "settings.changed"},
	}
	for _, c := range cases {
		if got := c.ev.Type(); got != c.want {
			t.Errorf("Type() got %q want %q", got, c.want)
		}
	}
}

func TestPublishDispatchesToAllSubscribers(t *testing.T) {
	resetBus(t)

	var a, b atomic.Int32
	Subscribe(func(Event) { a.Add(1) })
	Subscribe(func(Event) { b.Add(1) })

	Publish(FileCreated{Base: NewBase(1, ""), Path: "/foo"})

	if got := a.Load(); got != 1 {
		t.Errorf("subscriber a got %d invocations want 1", got)
	}
	if got := b.Load(); got != 1 {
		t.Errorf("subscriber b got %d invocations want 1", got)
	}
}

func TestUnsubscribeRemovesHandler(t *testing.T) {
	resetBus(t)

	var got atomic.Int32
	unsub := Subscribe(func(Event) { got.Add(1) })

	Publish(FileCreated{Base: NewBase(1, ""), Path: "/foo"})
	if got.Load() != 1 {
		t.Fatalf("pre-unsub: got %d want 1", got.Load())
	}

	unsub()
	Publish(FileCreated{Base: NewBase(1, ""), Path: "/bar"})
	if got.Load() != 1 {
		t.Errorf("post-unsub: got %d want still 1 (subscriber should be gone)", got.Load())
	}
}

func TestPanickingSubscriberDoesNotStopOthers(t *testing.T) {
	resetBus(t)

	var survived atomic.Int32
	Subscribe(func(Event) { panic("oops") })
	Subscribe(func(Event) { survived.Add(1) })

	// Should not panic. Should still invoke the second subscriber.
	Publish(FileDeleted{Base: NewBase(1, ""), Path: "/whatever"})

	if got := survived.Load(); got != 1 {
		t.Errorf("survivor got %d invocations, expected 1 — panicking peer broke the chain", got)
	}
}

func TestSubscribersReceiveTypedEvent(t *testing.T) {
	resetBus(t)

	var receivedPath string
	Subscribe(func(e Event) {
		// Subscribers identify the event by Type switch — verify the
		// concrete struct survives the Event interface trip.
		if ev, ok := e.(FileRenamed); ok {
			receivedPath = ev.To
		}
	})

	Publish(FileRenamed{Base: NewBase(7, ""), From: "/a", To: "/b"})

	if receivedPath != "/b" {
		t.Errorf("subscriber got To=%q want /b", receivedPath)
	}
}

func TestPublishIsSafeWithConcurrentSubscribers(t *testing.T) {
	// Stress test: publishers and subscribers from many goroutines
	// shouldn't race or deadlock. Mostly a guard against the
	// "subscriber registers/unregisters inside Publish" scenario which
	// is what the snapshot-then-iterate pattern protects against.
	resetBus(t)

	var counter atomic.Int32
	var wg sync.WaitGroup

	// Long-lived subscriber that counts.
	Subscribe(func(Event) { counter.Add(1) })

	const goroutines = 20
	const publishes = 50
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < publishes; j++ {
				Publish(FileCreated{Base: NewBase(uint(i), ""), Path: "/x"})
			}
		}()
	}
	wg.Wait()

	if got := counter.Load(); got != goroutines*publishes {
		t.Errorf("counter got %d want %d", got, goroutines*publishes)
	}
}
