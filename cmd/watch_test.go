package cmd

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/fswatch"
	"github.com/csummers-dev/vitrine/v4/users"
)

type fakeUsers struct {
	list  []*users.User
	err   error
	calls int
}

func (f *fakeUsers) Get(string, interface{}) (*users.User, error) { return nil, errors.New("unused") }
func (f *fakeUsers) Gets(string) ([]*users.User, error) {
	f.calls++
	return f.list, f.err
}
func (f *fakeUsers) Update(*users.User, ...string) error { return nil }
func (f *fakeUsers) Save(*users.User) error              { return nil }
func (f *fakeUsers) Delete(interface{}) error            { return nil }
func (f *fakeUsers) LastUpdate(uint) int64               { return 0 }

func TestWatchPublisherFansOutPerUserScope(t *testing.T) {
	store := &fakeUsers{list: []*users.User{
		{ID: 1, Scope: "."},
		{ID: 2, Scope: "/alice"},
		{ID: 3, Scope: "/bob"},
	}}
	p := newWatchPublisher(store, "/srv")
	var got []events.FilesChanged
	p.publish = func(e events.Event) { got = append(got, e.(events.FilesChanged)) }

	p.OnChange(fswatch.Change{Dir: "/alice/Music", Names: []string{"a.flac"}})

	if len(got) != 2 {
		t.Fatalf("published %d events, want 2: %+v", len(got), got)
	}
	if got[0].UserID != 1 || got[0].Dir != "/alice/Music" {
		t.Errorf("admin event = %+v", got[0])
	}
	if got[1].UserID != 2 || got[1].Dir != "/Music" || !reflect.DeepEqual(got[1].Names, []string{"a.flac"}) {
		t.Errorf("alice event = %+v", got[1])
	}
}

func TestWatchPublisherCachesUsersAndKeepsLastGoodList(t *testing.T) {
	now := time.Unix(1000, 0)
	store := &fakeUsers{list: []*users.User{{ID: 1, Scope: "."}}}
	p := newWatchPublisher(store, "/srv")
	p.now = func() time.Time { return now }
	p.publish = func(events.Event) {}

	p.OnChange(fswatch.Change{Dir: "/"})
	p.OnChange(fswatch.Change{Dir: "/"})
	if store.calls != 1 {
		t.Errorf("users read %d times within the TTL, want 1", store.calls)
	}

	now = now.Add(userScopesTTL + time.Second)
	store.err = errors.New("db locked")
	var n int
	p.publish = func(events.Event) { n++ }
	p.OnChange(fswatch.Change{Dir: "/"})
	if store.calls != 2 || n != 1 {
		t.Errorf("calls=%d published=%d; want a re-read that falls back to the last list", store.calls, n)
	}
}
