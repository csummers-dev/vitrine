package fswatch

import (
	"errors"
	"fmt"
	"syscall"

	"github.com/fsnotify/fsnotify"
)

// NewFsnotifyBackend returns the OS notification backend (inotify on Linux,
// kqueue on BSD/macOS, ReadDirectoryChangesW on Windows).
func NewFsnotifyBackend() (Backend, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	b := &fsnotifyBackend{
		w:      fw,
		events: make(chan RawEvent, 1024),
		done:   make(chan struct{}),
	}
	go b.forward()
	return b, nil
}

type fsnotifyBackend struct {
	w      *fsnotify.Watcher
	events chan RawEvent
	done   chan struct{}
}

func (b *fsnotifyBackend) forward() {
	defer close(b.events)
	for ev := range b.w.Events {
		var op Op
		if ev.Has(fsnotify.Create) {
			op |= OpCreate
		}
		if ev.Has(fsnotify.Write) {
			op |= OpWrite
		}
		if ev.Has(fsnotify.Remove) {
			op |= OpRemove
		}
		if ev.Has(fsnotify.Rename) {
			op |= OpRename
		}
		if ev.Has(fsnotify.Chmod) {
			op |= OpChmod
		}
		select {
		case b.events <- RawEvent{Path: ev.Name, Op: op}:
		case <-b.done:
			return // closed while the consumer wasn't reading
		}
	}
}

func (b *fsnotifyBackend) Add(dir string) error {
	err := b.w.Add(dir)
	if errors.Is(err, syscall.ENOSPC) || errors.Is(err, syscall.EMFILE) {
		return fmt.Errorf("%w: %w", ErrWatchLimit, err)
	}
	return err
}

func (b *fsnotifyBackend) Remove(dir string) error { return b.w.Remove(dir) }
func (b *fsnotifyBackend) Events() <-chan RawEvent { return b.events }
func (b *fsnotifyBackend) Errors() <-chan error    { return b.w.Errors }
func (b *fsnotifyBackend) Close() error {
	select {
	case <-b.done:
	default:
		close(b.done)
	}
	return b.w.Close()
}
