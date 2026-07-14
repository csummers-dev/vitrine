package runner

import (
	"reflect"
	"testing"

	"github.com/csummers-dev/vitrine/v3/settings"
)

func TestParseCommand_NoShell(t *testing.T) {
	// With no shell configured the binary is invoked directly with tokenized args.
	cmd, name, err := ParseCommand(&settings.Settings{Shell: []string{}}, "echo hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "echo" {
		t.Errorf("name = %q, want %q", name, "echo")
	}
	if want := []string{"echo", "hello"}; !reflect.DeepEqual(cmd, want) {
		t.Errorf("cmd = %v, want %v", cmd, want)
	}
}

func TestParseCommand_WithShell(t *testing.T) {
	// With a shell configured the RAW string is handed to the shell untokenized
	// (the binary is never invoked directly).
	cmd, name, err := ParseCommand(
		&settings.Settings{Shell: []string{"/bin/sh", "-c"}},
		"echo hello",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "echo" {
		t.Errorf("name = %q, want %q", name, "echo")
	}
	if want := []string{"/bin/sh", "-c", "echo hello"}; !reflect.DeepEqual(cmd, want) {
		t.Errorf("cmd = %v, want %v", cmd, want)
	}
}
