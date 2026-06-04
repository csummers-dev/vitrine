package settings

import (
	"strings"
	"testing"
	"time"
)

// cleanUsername sanitizes a username before it's joined into a filesystem
// path for the user's home directory (see MakeUserDir). These cases lock the
// security-relevant behavior: traversal sequences and path separators must
// never survive into the resulting path component.
func TestCleanUsername(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"alice", "alice"},
		{"  alice  ", "alice"},              // outer whitespace trimmed
		{"user@host.com", "user@host.com"},  // @ . are allowed
		{"a/b", "a-b"},                      // separators neutralized
		{"a..b", "ab"},                      // dot-dot stripped
		{"a---b", "a-b"},                    // dash runs collapsed
		{"../../etc/passwd", "-etc-passwd"}, // traversal fully defused
	}
	for _, c := range cases {
		got := cleanUsername(c.in)
		if got != c.want {
			t.Errorf("cleanUsername(%q) = %q, want %q", c.in, got, c.want)
		}
		// Invariants that matter regardless of the exact spelling: a cleaned
		// username can never reintroduce a path separator or a traversal hop.
		if strings.ContainsAny(got, "/\\") {
			t.Errorf("cleanUsername(%q) = %q contains a path separator", c.in, got)
		}
		if strings.Contains(got, "..") {
			t.Errorf("cleanUsername(%q) = %q contains a traversal sequence", c.in, got)
		}
	}
}

func TestGetTokenExpirationTime(t *testing.T) {
	fallback := 2 * time.Hour

	t.Run("empty falls back", func(t *testing.T) {
		s := &Server{TokenExpirationTime: ""}
		if got := s.GetTokenExpirationTime(fallback); got != fallback {
			t.Errorf("got %v, want fallback %v", got, fallback)
		}
	})

	t.Run("valid duration is parsed", func(t *testing.T) {
		s := &Server{TokenExpirationTime: "30m"}
		if got := s.GetTokenExpirationTime(fallback); got != 30*time.Minute {
			t.Errorf("got %v, want %v", got, 30*time.Minute)
		}
	})

	t.Run("garbage falls back", func(t *testing.T) {
		s := &Server{TokenExpirationTime: "not-a-duration"}
		if got := s.GetTokenExpirationTime(fallback); got != fallback {
			t.Errorf("got %v, want fallback %v", got, fallback)
		}
	})
}
