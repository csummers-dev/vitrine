#!/usr/bin/env bash
# Runs the screenshot suite in the same Playwright image CI uses, so local
# results match the baselines. Extra arguments go to Playwright, e.g.
#   scripts/visual-docker.sh --update-snapshots
#   scripts/visual-docker.sh -g "files-root"
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p 'require("./frontend/package.json").devDependencies["@playwright/test"].replace(/^[^0-9]*/, "")')
exec docker run --rm --ipc=host \
  -v "$PWD:/work" \
  -v vitrine-visual-node-modules:/work/frontend/node_modules \
  -w /work/frontend \
  -e CI=1 \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  bash -c 'corepack enable >/dev/null 2>&1; pnpm install --frozen-lockfile && pnpm run e2e:visual "$@"' _ "$@"
