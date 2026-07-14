package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/csummers-dev/vitrine/v3/version"
)

func init() {
	rootCmd.AddCommand(versionCmd)
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version number",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Println("vitrine v" + version.Version + "/" + version.CommitSHA)
	},
}
