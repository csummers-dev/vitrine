# Remediation plans — DEP-003, TOOL-001, COR-004, FE-001

Concrete dev plans for four deferred audit items (see `AUDIT-2.5.1.md`). All four are low-risk and
mostly mechanical. Each ends green on the standard gates (`go build/vet/test --race ./...`,
`GOOS=windows go build .`, frontend `typecheck/lint/test/build`); no NAS-RC needed (none touch the
filesystem path).

> **Status (executed):** DEP-003 ✅ · TOOL-001 ✅ · COR-004 ✅ · FE-001 ◐ (API layer typed; the
> component-level `any` is the remaining tail). dompurify confirmed already at 3.4.11. All gates green —
> full record in `AUDIT-2.5.1.md` → "Deferred-plan execution". No commits (manual, per project convention).

---

## DEP-003 🔵 — Patch the build/dev-only dependency advisories

**Why:** four transitive advisories that don't ship in the app but keep `pnpm audit` (and the new CI
Security Scan job) noisy:

| Package | In repo | Patched | Reaches via |
|---|---|---|---|
| `esbuild` | <0.28.1 | ≥0.28.1 | `vite > esbuild` (build) |
| `rollup` | <4.59.0 | ≥4.59.0 | `@intlify/unplugin-vue-i18n > @rollup/pluginutils > rollup` (build) |
| `undici` | <7.28.0 | ≥7.28.0 | `jsdom > undici` (test only) |

**Approach:** they're transitive with no clean direct parent to bump, so pin patched floors with a
`pnpm.overrides` block.

**Change — `frontend/package.json`:**
```jsonc
"pnpm": {
  "overrides": {
    "esbuild": ">=0.28.1",
    "rollup": ">=4.59.0",
    "undici": ">=7.28.0"
  }
}
```
Then `pnpm install` (updates `pnpm-lock.yaml`).

**Risk:** low — patch/minor bumps within the same major. `esbuild`/`rollup` ARE the build engines, so a
green `vite build` + `vitest` proves compatibility with vite 8 / the i18n plugin. `undici` is jsdom-only.

**Verify:** `pnpm install` → `pnpm audit` no longer lists these three → `vue-tsc --noEmit`, `eslint`,
`vitest run`, `vite build` all green. **If the override breaks a build**, fall back to bumping the direct
parent instead (`vite`, `@intlify/unplugin-vue-i18n`, or `jsdom`).

**Effort:** S (~30 min).

---

## TOOL-001 ⚪ — Make `govulncheck` reliable (CI + local)

**Key fact:** the local panic (`ForEachElement … *types.TypeParam`) is a **go1.26-only** `x/tools` bug.
`go.mod` declares **`go 1.25.0`**, and CI's `setup-go` uses `go-version-file: go.mod` → it runs govulncheck
on **Go 1.25, where it works**. So the CI side is effectively already handled by the Security Scan job
added in Batch A (TOOL-002).

**Plan:**
1. **Verify in CI:** on the next push, confirm the `Security Scan` job's `govulncheck` step runs clean
   (or surfaces real, reachable vulns). It's `continue-on-error: true` today.
2. **Promote to blocking** once the baseline is clean: drop `|| true` from the govulncheck step (keep
   `gosec`/`pnpm audit` non-blocking until their baselines are triaged). Optionally remove the job-level
   `continue-on-error` for govulncheck only by splitting it into its own job.
3. **Pin for reproducibility** (optional): replace `@latest` with a fixed tag in CI, e.g.
   `go install golang.org/x/vuln/cmd/govulncheck@v1.1.4`.
4. **Local-dev escape hatch:** document that `govulncheck@latest` panics on a go1.26 local toolchain;
   run it against the project's pinned Go instead:
   ```sh
   GOTOOLCHAIN=go1.25.0 go run golang.org/x/vuln/cmd/govulncheck@latest ./...
   ```
   Add this line to the audit doc's Reproduction block (and/or a CONTRIBUTING note). Revisit `@latest`
   once `x/vuln` ships go1.26 support.

**Verify:** CI govulncheck step green; the `GOTOOLCHAIN=go1.25.0 …` command runs locally without panic.

**Effort:** S (verification + a CI tweak + a doc line).

---

## COR-004 ⚪ — Make the 14 ignored errors explicit (gosec G104 → 0)

**Why:** clear the G104 cluster so the CI gosec scan is low-noise. All 14 are read/cleanup/output
closes — **none are write-path data loss** — so this is a no-behavior-change pass.

**Site-by-site:**

| Location | Call | Action |
|---|---|---|
| `cmd/config.go:262`, `cmd/users.go:52` | `w.Flush()` (tabwriter, CLI output) | prepend `_ =` |
| `http/extract.go:447,457,567,577,592,595` | `rc.Close()` / `f.Close()` in error/cleanup paths | prepend `_ =` |
| `http/extract.go:285,330` | the `rc.Close()` next to the password-probe `io.Copy` (the copy error IS captured) | prepend `_ =` |
| `http/upload_cache_memory.go:44` | `fmt.Printf(...)` (eviction log) | `_ =` — or switch to `log.Printf` |
| `http/upload_cache_redis.go:83` | `c.client.Close()` inside `redisUploadCache.Close()` | **propagate**: `return c.client.Close()` if the method returns `error`, else `_ =` |
| `jobstore/jobstore.go:41`, `trash/trash.go:88` | `db.Close()` after a failed `bolt.Open`, before returning the open error | `_ =` (open already failed; the close error is irrelevant) |

**Approach:** mechanical `_ =`, plus the single `redis Close()` propagation upgrade. Don't "handle"
these with logging except where it adds signal (none really do here).

**Verify:** `"$(go env GOPATH)/bin/gosec" -quiet ./...` reports **0 G104**; `go build/vet/test --race ./...`
green; `GOOS=windows go build .`.

**Effort:** S (~30–45 min).

---

## FE-001 🔵 — Type the API layer (remove `any`, starting with `src/api/`)

**Why:** 51 `any` total, concentrated where backend JSON crosses into the app; typing them catches
shape drift at compile time. Domain types already exist and are reusable: `ResourceItem` / `Resource` /
`ResourceBase` (global, `src/types/file.d.ts`), `TransferItem` / `TransferJob` (`api/jobs.ts`),
`FolderSize`, `SearchHit`.

**Phase 1 — `src/api/` (13 sites, do first; each is obvious):**

| Site | `any` | Replace with |
|---|---|---|
| `api/files.ts:37`, `api/pub.ts:20` | `(item: any, index: any)` | `(item: ResourceItem, index: number)` |
| `api/files.ts:58` | `content?: any` | `content?: unknown` (it's a fetch body; callers `JSON.stringify`) |
| `api/files.ts:100` | `download(format: any, …)` | a new `type DownloadFormat = "zip" \| "tar" \| "targz" \| …` (confirm the backend's accepted `?algo=`) |
| `api/files.ts:135,161`, `api/tus.ts:14` | `onupload: any` | a shared `type UploadProgress = (e: ProgressEvent) => void` (match the actual call sites) |
| `api/files.ts:230,253,257` | `items: any[]` (move/copy) | `{ from: string; to: string; name?: string }[]` (or reuse `TransferItem`) |
| `api/files.ts:325` | `inline: any` | `inline: boolean` |
| `api/utils.ts:8` | `message: any` (StatusError) | `string` |
| `api/utils.ts:66` | `fetchJSON<T>(url, opts?: any)` | `opts?: RequestInit` |

**Phase 2 — sweep the remaining ~38** in components/views (`FileListing.vue` ×5, `FolderPicker.vue` ×3,
`Info.vue`, `VideoPlayer.vue`, the `*.d.ts` window globals, etc.). Lower value; do opportunistically.

**Approach:** incremental, one file at a time, `vue-tsc --noEmit` as the gate after each. The only new
types to define are `DownloadFormat` and `UploadProgress` (tiny). After Phase 1, enable
`@typescript-eslint/no-explicit-any` as a **warning** in `eslint.config.js` to stop regressions
(promote to error after Phase 2).

**Verify:** `vue-tsc --noEmit` green after every file; `eslint src/`; `vitest run`; `vite build`.

**Effort:** M (~half-day for Phase 1; Phase 2 is a separate opportunistic sweep).

---

## Suggested order
**DEP-003 → COR-004 → TOOL-001 → FE-001.** The first three are quick, no-behavior-change, and make both
CI scanners (gosec, pnpm audit) clean so they can be promoted to blocking. FE-001 Phase 1 is the larger
piece and rides on its own. Bundle DEP-003 + COR-004 + TOOL-001 into one small PR; FE-001 as its own.
