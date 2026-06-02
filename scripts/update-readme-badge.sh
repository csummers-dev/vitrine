#!/usr/bin/env bash
#
# Sync the README version badge to a version string.
#
# Usage:
#   scripts/update-readme-badge.sh            # use the latest v* git tag
#   scripts/update-readme-badge.sh 1.4.0      # explicit version
#   scripts/update-readme-badge.sh v1.4.0     # leading 'v' is stripped
#
# The badge in README.md looks like:
#   https://img.shields.io/badge/version-<VER>-<color>?style=flat-square
# Only the <VER> segment is rewritten; the color is preserved. Versions are
# displayed without the leading 'v' (tags use it, the badge doesn't).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VERSION="${1:-$(git describe --tags --abbrev=0 --match='v*')}"
VERSION="${VERSION#v}"

README="README.md"

if ! grep -qE 'badge/version-[^-]+-[0-9a-fA-F]{6}' "$README"; then
  echo "error: version badge not found in $README" >&2
  exit 1
fi

# Portable in-place edit (works on both BSD/macOS and GNU sed).
sed -i.bak -E \
  "s|badge/version-[^-]+-([0-9a-fA-F]{6})|badge/version-${VERSION}-\1|" \
  "$README"
rm -f "$README.bak"

echo "README badge → ${VERSION}"
