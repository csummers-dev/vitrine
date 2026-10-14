#!/usr/bin/env node
/**
 * Phase 6 guardrail: counts raw style literals that should come from design
 * tokens (src/css/tokens.css) and fails when any file has more than its
 * allowance in scripts/style-token-baseline.json. Counts may only go down.
 *
 *   node scripts/check-style-tokens.mjs           check
 *   node scripts/check-style-tokens.mjs --update  lower the baseline to today
 *   node scripts/check-style-tokens.mjs --report  print totals per kind
 *
 * Counted, outside tokens.css: hex colours, rgb()/rgba()/hsl()/hsla()
 * literals, px border-radius values and box-shadow literals. A var(--x,
 * fallback) fallback counts too: the fallback is where drift hides.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const baselinePath = join(root, "scripts", "style-token-baseline.json");
const EXCLUDE = [/src\/css\/tokens\.css$/, /__tests__\//, /\.test\.ts$/];

const KINDS = {
  hex: /#[0-9a-fA-F]{3,8}\b/g,
  colorFn: /\b(?:rgba?|hsla?)\(/g,
  radius: /border(?:-[a-z]+)*-radius\s*:\s*[^;}]*\d+px/g,
  shadow: /box-shadow\s*:(?!\s*(?:none\b|var\())[^;}]+/g,
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(vue|css)$/.test(name)) yield p;
  }
}

/** The parts of a file that are styles: all of a .css file, and the
 *  <style> blocks and style="" / :style bindings of a .vue file. */
function styleText(path, text) {
  if (path.endsWith(".css")) return text.replace(/\/\*[\s\S]*?\*\//g, "");
  const parts = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
    (m) => m[1]
  );
  const tpl = text.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? "";
  parts.push(...[...tpl.matchAll(/\bstyle="([^"]*)"/g)].map((m) => m[1]));
  return parts.join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
}

function count() {
  const out = {};
  for (const path of walk(src)) {
    const rel = relative(root, path).split("\\").join("/");
    if (EXCLUDE.some((r) => r.test(rel))) continue;
    const css = styleText(path, readFileSync(path, "utf8"));
    const c = {};
    for (const [k, re] of Object.entries(KINDS)) {
      const n = (css.match(re) ?? []).length;
      if (n) c[k] = n;
    }
    if (Object.keys(c).length) out[rel] = c;
  }
  return out;
}

const now = count();
const args = new Set(process.argv.slice(2));
const total = (m) => {
  const t = {};
  for (const c of Object.values(m))
    for (const [k, n] of Object.entries(c)) t[k] = (t[k] ?? 0) + n;
  return t;
};

if (args.has("--report")) {
  console.log(total(now));
  process.exit(0);
}

let base = {};
try {
  base = JSON.parse(readFileSync(baselinePath, "utf8")).files ?? {};
} catch {
  if (!args.has("--update")) {
    console.error(`No baseline at ${baselinePath}; run with --update.`);
    process.exit(1);
  }
}

if (args.has("--update")) {
  // Never raise an allowance: keep the lower of baseline and today, unless
  // there is no baseline yet. --force accepts today's numbers as they are.
  const files = {};
  const force = args.has("--force") || !Object.keys(base).length;
  for (const [f, c] of Object.entries(now)) {
    const b = base[f];
    const kept = {};
    for (const [k, n] of Object.entries(c)) {
      const v = force || !b ? n : Math.min(n, b[k] ?? 0);
      if (v) kept[k] = v;
    }
    if (Object.keys(kept).length) files[f] = kept;
  }
  const sorted = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        note: "Allowed raw style literals per file. Only ever lower these (Phase 6).",
        totals: total(sorted),
        files: sorted,
      },
      null,
      2
    ) + "\n"
  );
  console.log("Baseline written:", total(sorted));
  process.exit(0);
}

const over = [];
for (const [f, c] of Object.entries(now))
  for (const [k, n] of Object.entries(c)) {
    const allowed = base[f]?.[k] ?? 0;
    if (n > allowed) over.push(`${f}: ${n} ${k} (allowed ${allowed})`);
  }
const t = total(now),
  bt = total(base);
console.log(
  "Raw style literals:",
  Object.entries(t)
    .map(([k, n]) => `${k} ${n}/${bt[k] ?? 0}`)
    .join(", ")
);
if (over.length) {
  console.error(
    "\nNew raw style values; use tokens from src/css/tokens.css instead:\n  " +
      over.join("\n  ")
  );
  process.exit(1);
}
const lower = Object.entries(bt).some(([k, n]) => (t[k] ?? 0) < n);
if (lower)
  console.log(
    "Counts went down: run `pnpm run check:tokens --update` to lock that in."
  );
