package cmd

import (
	"errors"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

func TestRemovedFlagError(t *testing.T) {
	cases := []struct {
		in       string
		wantPart string
	}{
		{"unknown flag: --baseurl", "use --baseURL instead"},
		{"unknown flag: --cache-dir=/tmp", "use --cacheDir instead"},
		{"unknown flag: --not-a-flag", "unknown flag: --not-a-flag"},
		{"some other error", "some other error"},
	}
	for _, c := range cases {
		got := removedFlagError(rootCmd, errors.New(c.in)).Error()
		if !strings.Contains(got, c.wantPart) {
			t.Errorf("removedFlagError(%q) = %q, want it to contain %q", c.in, got, c.wantPart)
		}
	}
}

func TestRemovedFlagsHaveReplacements(t *testing.T) {
	registered := map[string]bool{}
	var walk func(c *cobra.Command)
	walk = func(c *cobra.Command) {
		c.Flags().VisitAll(func(f *pflag.Flag) { registered[f.Name] = true })
		c.PersistentFlags().VisitAll(func(f *pflag.Flag) { registered[f.Name] = true })
		for _, sub := range c.Commands() {
			walk(sub)
		}
	}
	walk(rootCmd)
	for old, repl := range removedFlags {
		if registered[old] {
			t.Errorf("removed flag --%s is still registered", old)
		}
		if !registered[repl] {
			t.Errorf("replacement --%s for removed flag --%s is not registered on any command", repl, old)
		}
	}
}

func TestRemovedBaseURLEnvFailsStartup(t *testing.T) {
	t.Setenv("VITRINE_BASEURL", "/files")
	t.Setenv("VITRINE_BASE_URL", "")
	if _, err := getServerSettings(viper.New(), nil); !errors.Is(err, errRemovedBaseURLEnv) {
		t.Fatalf("getServerSettings error = %v, want errRemovedBaseURLEnv", err)
	}
}
