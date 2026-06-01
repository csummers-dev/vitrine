package users

import (
	"encoding/json"
	"testing"
)

// TestPreferencesJSONRoundTrip ensures the Preferences field marshals to
// JSON as an opaque per-key blob and unmarshals back to the same shape.
// The field is the foundation for v1.3.0 features (tags, recents,
// favorites, per-folder view mode, accent color, etc.) so a regression
// here would silently break every feature that consumes it.
func TestPreferencesJSONRoundTrip(t *testing.T) {
	original := User{
		ID:       1,
		Username: "test",
		Preferences: map[string]json.RawMessage{
			"tags.recent":         json.RawMessage(`["work","todo"]`),
			"view.mode.byFolder":  json.RawMessage(`{"/Documents":"list","/Photos":"gallery"}`),
			"theme.accentColor":   json.RawMessage(`"#5e6ad2"`),
		},
	}

	out, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var roundTripped User
	if err := json.Unmarshal(out, &roundTripped); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if got := len(roundTripped.Preferences); got != 3 {
		t.Fatalf("expected 3 preference keys, got %d", got)
	}
	if string(roundTripped.Preferences["theme.accentColor"]) != `"#5e6ad2"` {
		t.Fatalf("accentColor preference did not round-trip: %s",
			roundTripped.Preferences["theme.accentColor"])
	}
}

// TestPreferencesCleanNormalizesNil ensures Clean() converts a nil
// Preferences map (e.g., on rows persisted before v1.3.0 added the
// field) into an empty map. The JSON response should always carry
// `"preferences": {}` rather than `"preferences": null` so consumers
// of the API don't have to special-case the empty / missing distinction.
func TestPreferencesCleanNormalizesNil(t *testing.T) {
	u := &User{Username: "u", Password: "p", Preferences: nil}
	if err := u.Clean("/tmp", "Username", "Password"); err != nil {
		t.Fatalf("clean failed: %v", err)
	}
	if u.Preferences == nil {
		t.Fatal("Clean should have initialized Preferences to a non-nil empty map")
	}
	if got := len(u.Preferences); got != 0 {
		t.Fatalf("expected empty map, got %d entries", got)
	}
}
