package cmd

import (
	"log"
	"sync"
	"time"

	"github.com/csummers-dev/vitrine/v4/events"
	"github.com/csummers-dev/vitrine/v4/fswatch"
	"github.com/csummers-dev/vitrine/v4/users"
)

// userScopesTTL is how long the watcher reuses the user list before
// re-reading it, so a new user (or a changed scope) is picked up quickly
// without a database read on every change.
const userScopesTTL = 30 * time.Second

// watchPublisher turns root-relative watcher Changes into one
// events.FilesChanged per user whose scope contains the changed folder.
type watchPublisher struct {
	store     users.Store
	baseScope string
	now       func() time.Time
	publish   func(events.Event)

	mu      sync.Mutex
	scopes  []fswatch.UserScope
	fetched time.Time
}

func newWatchPublisher(store users.Store, baseScope string) *watchPublisher {
	return &watchPublisher{
		store:     store,
		baseScope: baseScope,
		now:       time.Now,
		publish:   events.Publish,
	}
}

func (p *watchPublisher) userScopes() []fswatch.UserScope {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.scopes != nil && p.now().Sub(p.fetched) < userScopesTTL {
		return p.scopes
	}
	list, err := p.store.Gets(p.baseScope)
	if err != nil {
		log.Printf("fswatch: list users: %v", err)
		return p.scopes // keep the last good list
	}
	scopes := make([]fswatch.UserScope, 0, len(list))
	for _, u := range list {
		scopes = append(scopes, fswatch.UserScope{ID: u.ID, Scope: u.Scope})
	}
	p.scopes = scopes
	p.fetched = p.now()
	return scopes
}

// OnChange is the fswatch.Options.OnChange callback.
func (p *watchPublisher) OnChange(c fswatch.Change) {
	for _, uc := range fswatch.ForUsers(c, p.userScopes()) {
		p.publish(events.FilesChanged{
			Base:  events.NewBase(uc.UserID, ""),
			Dir:   uc.Dir,
			Names: uc.Names,
		})
	}
}
