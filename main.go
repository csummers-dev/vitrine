package main

import (
	"os"

	"github.com/csummers-dev/vitrine/v3/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
