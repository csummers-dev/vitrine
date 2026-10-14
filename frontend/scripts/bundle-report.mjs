#!/usr/bin/env node
/**
 * Phase 6 guardrail: gzip sizes of the built frontend (run after
 * `pnpm run build`), checked against scripts/bundle-budget.json.
 *
 *   node scripts/bundle-report.mjs           report and check
 *   node scripts/bundle-report.mjs --update  write today's sizes as the budget
 *
 * Groups: "initial" is what index.html loads up front (entry script, its
 * preloaded chunks and the stylesheet); then all JS, all CSS and fonts.
 * A group fails when it grows more than SLACK over its budget.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SLACK = 0.02;
const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const assets = join(dist, "assets");
const budgetPath = join(root, "scripts", "bundle-budget.json");

const gz = (name) =>
  gzipSync(readFileSync(join(assets, name)), { level: 9 }).length;
const files = readdirSync(assets).filter((f) => !/\.(br|gz)$/.test(f));
// The Go server serves dist/public/index.html (vite's built copy).
const html = readFileSync(join(dist, "public", "index.html"), "utf8");
const initialNames = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*assets\/([^"?]+)"/g)].map((m) => m[1])
);

const sum = (list) => list.reduce((n, f) => n + gz(f), 0);
const sizes = {
  initial: sum(files.filter((f) => initialNames.has(f))),
  js: sum(files.filter((f) => /\.m?js$/.test(f))),
  css: sum(files.filter((f) => f.endsWith(".css"))),
  fonts: sum(files.filter((f) => /\.woff2?$/.test(f))),
};

// Development-only pages must never ship (the /dev/ui component gallery).
const devLeaks = files.filter(
  (f) =>
    /UiGallery/.test(f) ||
    (/\.m?js$/.test(f) &&
      readFileSync(join(assets, f), "utf8").includes("ui-gallery"))
);
if (devLeaks.length) {
  console.error(
    `Development-only code in the production build: ${devLeaks.join(", ")}`
  );
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
if (process.argv.includes("--update")) {
  writeFileSync(
    budgetPath,
    JSON.stringify(
      {
        note: `gzip bytes; a group may grow ${SLACK * 100}% before the check fails`,
        ...sizes,
      },
      null,
      2
    ) + "\n"
  );
  console.log("Budget written.");
}

let budget = {};
try {
  budget = JSON.parse(readFileSync(budgetPath, "utf8"));
} catch {
  console.error("No bundle budget; run with --update.");
  process.exit(1);
}

const over = [];
for (const [k, n] of Object.entries(sizes)) {
  const b = budget[k];
  const diff = b ? ((n - b) / b) * 100 : 0;
  console.log(
    `${k.padEnd(8)} ${kb(n).padStart(11)}   budget ${b ? kb(b) : "none"}   ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`
  );
  if (b && n > b * (1 + SLACK)) over.push(k);
}
if (over.length) {
  console.error(
    `\nOver budget: ${over.join(", ")}. Trim it, or if the growth is intended run \`pnpm run check:bundle --update\` and say why in the commit.`
  );
  process.exit(1);
}
