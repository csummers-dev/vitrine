//go:build !dev

package frontend

import "embed"

// NOTE: use the `all:` prefix so files whose names begin with `_` or `.`
// are embedded too. Vite/Rollup emits lazily-loaded chunks with a leading
// underscore (e.g. the per-locale `_intlify-i18n-*.js` i18n bundles); a
// plain `dist/*` pattern silently skips those, which 404s the app at boot.
//
//go:embed all:dist
var assets embed.FS

func Assets() embed.FS {
	return assets
}
