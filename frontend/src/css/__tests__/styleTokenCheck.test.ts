import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Phase 6, 6.4: the token check itself. With a zero allowance, a raw colour,
// radius or shadow anywhere fails it; tokens and tokens.css don't.

const script = resolve(__dirname, "../../../scripts/check-style-tokens.mjs");
let dir: string;
let baseline: string;

const run = () =>
  spawnSync(
    process.execPath,
    [script, "--src", join(dir, "src"), "--baseline", baseline],
    { encoding: "utf8" }
  );

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tokcheck-"));
  mkdirSync(join(dir, "src", "css"), { recursive: true });
  baseline = join(dir, "baseline.json");
  writeFileSync(baseline, JSON.stringify({ files: {} }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("check-style-tokens", () => {
  it("passes when styles only use tokens", () => {
    writeFileSync(
      join(dir, "src", "Ok.vue"),
      `<template><div /></template>
<style scoped>
.a { color: var(--color-ink-1); border-radius: var(--radius-md); box-shadow: var(--shadow-1); }
</style>`
    );
    const r = run();
    expect(r.status).toBe(0);
  });

  it("fails on a planted hex colour", () => {
    writeFileSync(
      join(dir, "src", "Planted.vue"),
      `<template><div /></template>
<style scoped>
.a { color: #ff00aa; }
</style>`
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Planted\.vue: 1 hex \(allowed 0\)/);
    rmSync(join(dir, "src", "Planted.vue"));
  });

  it("fails on a px radius and a raw shadow, in CSS files too", () => {
    writeFileSync(
      join(dir, "src", "css", "x.css"),
      `.b { border-radius: 7px; box-shadow: 0 1px 2px black; }`
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/x\.css: 1 radius/);
    expect(r.stderr).toMatch(/x\.css: 1 shadow/);
    rmSync(join(dir, "src", "css", "x.css"));
  });

  it("leaves tokens.css alone", () => {
    writeFileSync(
      join(dir, "src", "css", "tokens.css"),
      `:root { --x: #123456; --r: 4px; }`
    );
    expect(run().status).toBe(0);
  });
});
