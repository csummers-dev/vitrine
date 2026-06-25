# filebrowser-pretty — Code Audit (v2.5.1)

**Started:** 2026-06-25 · **Baseline commit:** `9eaaac0` (release/2.5.1) · **Auditor:** Claude (Opus 4.8)
**Method:** Staged, report-first. Findings are evidence-based (file:line + reasoning; PoC where cheap/safe).
No code is changed until a remediation batch is approved. See `docs/audit/` plan for the full criteria.

## Legend

- **Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low · ⚪ Info
- **Effort:** S (≤1h) · M (≲half-day) · L (multi-day / design)
- **Status:** Open · Confirmed · Accepted · Won't-fix · Fixed

---

## Executive summary

| Stage | Status | Findings |
|---|---|---|
| 0 — Automated baseline | ✅ done | 8 recorded + 1 lead-table (gosec) for Stage 1 |
| 1 — Security deep-dive | ✅ done | 9 findings (4 🟡 / 5 🔵) + strong positives |
| 2 — Backend correctness | ✅ done | 4 findings (3 🔵 / 1 ⚪) + strong positives |
| 3 — Frontend correctness | ✅ done | 2 findings (2 🔵) + strong positives |
| 4 — Performance | ✅ done | 1 finding (1 🔵) + COR-003 cross-ref + positives |
| 5 — Quality & cleanliness | ✅ done | 2 new (2 ⚪) + confirmed QUAL-001/002/003 |
| 6 — Tests | ✅ done | 1 finding (1 🟡) + positives |
| 7 — Build/deps/ops/docs | ✅ done | 2 findings (1 🔵 / 1 ⚪) + positives |
| 8 — Synthesis & backlog | ✅ done | exec summary + remediation backlog |

**Severity counts (final):** 🔴 0 · 🟠 0 · 🟡 7 · 🔵 16 · ⚪ 6  ·  **29 findings**

**Positive baseline:** `staticcheck ./...` is **clean** (0 findings — already enforced via golangci-lint's
default set in CI). `go build/vet ./...` clean. Existing CI runs golangci-lint, `go test --race`,
eslint, vue-tsc, vitest on every push.

---

## Stage 0 — Automated baseline

Scanners run locally (the repo/CI has none of these today; **recommend adding** the high-value ones —
see TOOL-002). Reproduction commands at the end of this section.

### Findings

#### DEP-001 🟡 M — `@xmldom/xmldom` (via `epubjs`) parses untrusted EPUBs with 5 high-severity advisories
**Location:** `frontend/package.json` → `epubjs > @xmldom/xmldom` · **Status:** Open
XML injection (DocumentType / comment / processing-instruction / CDATA) + uncontrolled recursion (DoS)
in the XML parser epubjs uses. EPUBs are user-supplied/untrusted files rendered in the viewer, and this
is a multi-user server, so a malicious EPUB is a plausible vector (tab DoS; XML node injection that may
reach the DOM — to be cross-checked in Stage 3 C1).
**Recommendation:** Update `epubjs` to a release pulling `@xmldom/xmldom ≥ 0.9.x` if available; if epubjs
pins an old xmldom, evaluate a `pnpm.overrides` bump or sandbox the EPUB render in an isolated iframe.
Confirm exploitability in Stage 3.

#### DEP-002 🟡 S — `dompurify < 3.4.9` (prod) has sanitizer-bypass advisories
**Location:** `frontend/package.json` → `dompurify` · **Status:** Open
DOMPurify is the app's HTML/markdown sanitizer (the primary XSS defense). Advisories: `SAFE_FOR_TEMPLATES`
bypass, Trusted-Types policy poisoning, permanent `ALLOWED_ATTR` pollution. Whether reachable depends on
how it's configured/used (verified in Stage 3 C1), but weakening the sanitizer warrants a bump regardless.
**Recommendation:** Bump `dompurify` to `≥ 3.4.9`. Cheap, no API change expected.

#### DEP-003 🔵 S — Build/dev-only advisories (not shipped to users)
**Location:** `rollup` (via unplugin-vue-i18n), `esbuild` (via vite), `undici` (via `jsdom`) · **Status:**
Fixed — pnpm overrides for esbuild `>=0.28.1` + rollup `>=4.59.0`. `undici` override reverted (forces a
version that breaks `jsdom@29`'s dispatcher; test-only, lowest value) — left to clear on a jsdom bump.
`rollup` arbitrary-file-write (build-time), `esbuild` dev-server file-read (dev only), and the 3 high
`undici` advisories are reachable **only through `jsdom`, a test/dev dependency** — none ship in the app
bundle or run in production. Low real-world risk.
**Recommendation:** Bump opportunistically (`pnpm update`), or pin patched versions; no urgency.

#### QUAL-001 🔵 S — Orphaned dependency `@vitejs/plugin-legacy`
**Location:** `frontend/package.json` (devDependencies) · **Status:** Open
The legacy build was removed in 2.5.1, but the dependency remains. (knip confirms it as unused.)
**Recommendation:** `pnpm remove @vitejs/plugin-legacy`.

#### QUAL-002 🔵 S — Unused production dependencies (verify dynamic imports first)
**Location:** `frontend/package.json` → `utif`, `vue-lazyload`, `@vueuse/integrations` · **Status:** Open
knip reports these prod deps as never imported. `utif` (TIFF decode) and `vue-lazyload` are notable bundle
weight if truly dead.
**Recommendation:** Grep for dynamic/string imports to rule out false positives, then remove. (Cross-check
in Stage 5.)

#### QUAL-003 ⚪ S — Dead-code leftovers flagged by knip
**Location:** `frontend/src/utils/constants.ts: logoURL` (leftover from the reverted per-user-logo feature),
`src/utils/{cookie,css,describeError}.ts`, `src/stores/router.ts`, unused exports (`api/files.ts: copy`,
`api/tags.ts: del`, `usePaneContext.ts: PANE_CONTEXT_KEY`, …), duplicate `i18n` export · **Status:** Open
Several genuine dead modules/exports. (Many knip "unused files" hits — the `src/types/*.d.ts` ambient
decls and `scripts/generate-icon-registry.mjs` build script — are **false positives**.)
**Recommendation:** Triage + remove in Stage 5 (verify each is truly unreferenced).

#### TOOL-001 ⚪ — `govulncheck` cannot run on the local go1.26 toolchain
**Location:** dev tooling · **Status:** Fixed — CI govulncheck step de-masked (`|| true` removed; runs on
the go.mod 1.25 toolchain where it works). Local go1.26 panic documented with a `GOTOOLCHAIN=go1.25.0` repro.
`govulncheck@latest` panics (`ForEachElement called on type containing *types.TypeParam`) — a known
`golang.org/x/tools` incompatibility with the bleeding-edge go1.26 toolchain. So the Go dependency
known-vuln scan could not be completed locally.
**Recommendation:** Run `govulncheck` in CI (uses the `go.mod` Go version) — see TOOL-002 — or via a pinned
older Go locally. Re-run once `x/vuln` supports go1.26.

#### TOOL-002 🔵 S — CI has no dependency/security scanning
**Location:** `.github/workflows/ci.yaml` · **Status:** Open
CI runs golangci-lint (`gocritic`/`govet`/`revive`), `go test --race`, eslint, vue-tsc, vitest — but no
`gosec`, `govulncheck`, `pnpm audit`, or `osv-scanner`. The Stage-0 scans below found real items that CI
would have surfaced continuously.
**Recommendation:** Add a `security` CI job: `govulncheck ./...`, `gosec ./...` (start non-blocking), and
`pnpm audit --prod` / `osv-scanner`. Consider `knip` for dead-code drift.

### gosec leads → to confirm in Stage 1/2 (not yet finalized)

`gosec ./...` reported **63 issues (14 high / 30 medium / 19 low)**. The security-relevant taint flags below
are **leads**, not yet findings — each needs manual confirmation (controlled vs. attacker-influenced input)
before a severity is assigned. Drilled in Stage 1.

| gosec | Location | Lead | Stage |
|---|---|---|---|
| G702 | `http/transcode.go:248` | Command injection via taint (ffmpeg build) | 1 (A6) |
| G703 | `http/static.go:171,175` | Path traversal via taint (static serving) | 1 (A1) |
| G204 | `auth/hook.go:106`, `http/commands.go:88`, `runner/runner.go:92`, `http/{media_thumbnail,transcode,video_thumbnail}.go` | Subprocess launched with variable | 1 (A6) |
| G304 | `http/extract.go:561`, `http/media_thumbnail.go:593`, `http/transcode.go:171`, `cache/cache.go:135`, `audiotags/atomic.go:50,56`, `cmd/utils.go:208,228` | File open via variable path | 1 (A1) |
| G110 | `http/static.go:212` | Decompression bomb | 1 (A5/A10) |
| G120 | `http/audiotags.go:181` | Unbounded form parse (DoS) | 1 (A10) |
| G203 | `http/static.go:101` | HTML not auto-escaped (XSS) | 1 (A9) |
| G115 | `http/extract.go:329,344,453,472` + `cache/`, `fileutils/`, `audit/` (10×) | int overflow uint64↔int64 (attacker archive sizes) | 2 (B5) |
| G301/G306 | `cache/cache.go:97,173,176` | Cache dir/file perms (0755/0644) | 1 (A9) |
| G118 | `http/video_thumbnail.go:104` | `context.Background` in request goroutine | 2 (B1) |
| G602 | `http/transfers.go:154` | Possible slice index out of range (panic) | 2 (B5) |

### Reproduction

```sh
# Go (install once; GOPATH/bin not on PATH here):
go install github.com/securego/gosec/v2/cmd/gosec@latest
go install honnef.co/go/tools/cmd/staticcheck@latest
"$(go env GOPATH)/bin/gosec" -quiet -fmt=json ./...   # 63 issues
"$(go env GOPATH)/bin/staticcheck" ./...              # clean
# govulncheck@latest panics on a go1.26 LOCAL toolchain (x/tools bug). Run it on
# the project's pinned Go (1.25) instead — works locally and matches CI:
GOTOOLCHAIN=go1.25.0 go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# Frontend (from frontend/):
pnpm audit --prod          # ships-in-app deps
pnpm audit                 # incl. dev/test (jsdom→undici, etc.)
pnpm dlx knip --reporter compact   # dead code / unused deps
```

---

## Stage 1 — Security deep-dive

Manual trace of the file-server attack surface, hotspot-first. **Headline: no Critical/High
confirmed.** The two most dangerous surfaces — path confinement and archive extraction — are
**well-defended**, and the remaining issues are either admin-gated (command exec / webhooks) or
defense-in-depth hardening. The gosec "command injection / path traversal" highs (`transcode.go`,
`static.go`) were traced and are **false positives in context** (argv with absolute paths; embedded
assets).

### Strong positives (verified, no action needed)
- **Path confinement (A1):** every user gets an `afero.NewBasePathFs` rooted at their scope
  ([users/users.go:108](../../users/users.go)); the rules `Checker` is enforced in *both*
  `files.NewFileInfo` and `readListing` ([files/file.go:80,464](../../files/file.go)); public shares
  nest a second `BasePathFs` over the shared sub-path ([http/public.go:68](../../http/public.go)).
- **Archive extraction (A5):** `materializeEntry` is genuine defense-in-depth — skips
  symlink/hardlink/device entries (closes archive-symlink escape), two zip-slip passes (string-prefix
  + `filepath.Rel`), per-entry rules `Check`, writes via the confined `Fs`, and caps
  entries/ratio/per-file/cumulative with a bounded `LimitReader` ([http/extract.go:366](../../http/extract.go)).
- **Auth crypto (A2):** passwords use `bcrypt` (DefaultCost); the JWT signing key is **512-bit
  crypto/rand** and the server refuses to start without one ([settings/settings.go:132](../../settings/settings.go),
  [settings/storage.go:74](../../settings/storage.go)); JWT is **alg-pinned to HS256 with expiration
  required** (no alg-confusion) ([http/auth.go:101](../../http/auth.go)).
- **Shares (A3):** CRUD has proper ownership checks — non-admins only `FindByUserID`/`Gets(...,
  d.user.ID)`, and delete enforces `link.UserID == d.user.ID || Admin`
  ([http/share.go:37,68,94](../../http/share.go)). No IDOR.
- **CSRF (A9):** auth token rides the `X-Auth` header (not a cookie), so cross-site forgery can't
  ride ambient credentials. No `Set-Cookie` auth at all.

### Findings

#### SEC-001 🟡 M — No brute-force protection on login
**Location:** `http/auth.go` (loginHandler), `auth/` · **Status:** Open
There is no rate-limiting, failed-attempt throttling, or account lockout on authentication. The only
slowdown is `bcrypt`'s inherent cost (~tens of ms/guess). reCaptcha exists but only for JSON-auth and
is off by default. An internet-exposed instance is open to online password guessing.
**Recommendation:** Add per-IP + per-account rate-limiting on the login route (exponential backoff or
a token bucket) and/or temporary lockout after N failures; consider surfacing the existing reCaptcha
hook as a default-on option.

#### SEC-002 🟡 M — Webhook SSRF: no internal-address filtering (admin-gated)
**Location:** [http/webhooks.go:22](../../http/webhooks.go) (`validWebhookURL`) · **Status:** Open
`validWebhookURL` only checks the `http(s)` scheme — nothing blocks loopback (`127.0.0.1`), private
ranges, link-local, or the cloud-metadata address `169.254.169.254`. Endpoints fire automatically on
file events (stored SSRF). Creation is **admin-only**, which bounds the risk, but defense-in-depth
matters (compromised-admin session, hosted/multi-tenant, metadata theft on cloud hosts).
**Recommendation:** Resolve the URL host and reject loopback/private/link-local/ULA/metadata ranges
(re-check after DNS resolution to defeat rebinding); disallow redirects to such ranges in the
dispatcher; optionally an explicit allowlist setting. *(Verify redirect-following in
`webhooks.Dispatcher` during fixes.)*

#### SEC-003 🟡 M — Command allowlist bypass in Shell mode (admin-gated)
**Location:** [http/commands.go:72-88](../../http/commands.go) · **Status:** Open
The per-user command allowlist checks only the **first token** (`slices.Contains(d.user.Commands,
name)`), but when `settings.Shell` is configured, `ParseCommand` runs the **entire** raw line via
`sh -c`. A user allowed to run `ls` can send `ls; <anything>` and the shell executes it — defeating
the allowlist. Requires `EnableExec` + `user.Perm.Execute` + `Shell` set (all admin-controlled), and
the user already has *some* exec capability, so this is privilege-widening, not initial RCE.
**Recommendation:** In shell mode, either validate the whole command against a stricter policy, or
document that the allowlist is per-binary only when shell mode is off; consider dropping shell mode in
favor of explicit argv.

#### SEC-004 🟡 M — Event-runner command injection via crafted filename (admin-gated)
**Location:** [runner/runner.go:84-92](../../runner/runner.go) · **Status:** Open
User-controlled file paths populate `$FILE`/`$DESTINATION`, which are `os.Expand`-ed into the command
args; in **Shell mode** (`ParseCommand` → `sh -c raw`) a filename containing shell metacharacters
(e.g. `$(...)`, `;`) injects into the event hook, which runs with server privileges. A low-priv user
who can name a file + trigger an event (upload/rename) reaches RCE. Requires admin-configured
event commands + shell mode; inherited from upstream's design.
**Recommendation:** Pass file values only via the environment (already set on `cmd.Env`) and document
that hooks must quote `"$FILE"`; or avoid shell mode. At minimum, note the sharp edge in the commands
docs.

#### SEC-005 🔵 L — Hook-auth argument injection + naive command split (admin-gated)
**Location:** [auth/hook.go:88-106](../../auth/hook.go) · **Status:** Open
Attacker-controlled `$USERNAME`/`$PASSWORD` (login form) are `os.Expand`-ed into the hook command's
argv. Execution is argv-based (no shell) so this is **argument injection**, not command injection —
a username like `--flag` could alter the hook script's behavior. Also `strings.Split(a.Command, " ")`
mishandles quoted paths. Hook auth is a non-default, admin-configured method.
**Recommendation:** Pass credentials only via env (already done), never expand them into argv; use a
proper shell-words splitter for the command template.

#### SEC-006 🔵 L — Branding static-override path join (needs branding configured)
**Location:** [http/static.go:170-175](../../http/static.go) · **Status:** Open
`filepath.Join(d.settings.Branding.Files, r.URL.Path)` then `os.Stat` / `http.ServeFile` for
`img/`-prefixed paths. `ServeFile` rejects `..` in `r.URL.Path`, and this only triggers when an admin
configures `Branding.Files`, so it's narrow — but the join is not explicitly confined to the branding
dir.
**Recommendation:** Confine with a cleaned-relative check (reject if the resolved path escapes
`Branding.Files`), independent of `ServeFile`'s own guard. *(Confirm whether the router pre-cleans
`r.URL.Path` during fixes.)*

#### SEC-007 🔵 L — JWT accepted via `?auth=` query parameter (token leakage)
**Location:** [http/auth.go:49-60](../../http/auth.go) (query fallback for downloads) · **Status:** Open
For download URLs that browsers open without the `X-Auth` header, the JWT is accepted as a query
param. Tokens in URLs leak into server access logs, browser history, and `Referer` headers.
Short token TTL limits the window, but it's avoidable.
**Recommendation:** Prefer short-lived, scope-limited download tokens distinct from the session JWT;
if the query path stays, scrub `auth` from access logs and set `Referrer-Policy: no-referrer` on those
responses.

#### SEC-008 🔵 L — Share hash is 48-bit entropy
**Location:** [http/share.go:119](../../http/share.go) (`make([]byte, 6)`) · **Status:** Open
Public (password-less) shares are guarded solely by an 8-char, 48-bit hash. Online enumeration is
impractical (~2⁴⁸ space, unthrottled but bcrypt-free GETs), but it's below the 128-bit best-practice
for capability URLs.
**Recommendation:** Widen the hash to ≥16 random bytes; cheap and future-proof. (Password-protected
shares already add a 96-byte token.)

#### SEC-009 🔵 L — Non-constant-time share-token comparison
**Location:** [http/public.go:134](../../http/public.go) · **Status:** Open
`r.URL.Query().Get("token") == l.Token` is a non-constant-time compare. Timing attacks over the
network against a 96-byte random token are impractical, so this is defense-in-depth.
**Recommendation:** Use `subtle.ConstantTimeCompare`.

### Cross-stage note
Auth tokens live in `localStorage` (header-based), so **an XSS = full session theft**. This raises the
stakes on the Stage 3 frontend XSS review (C1) — especially the `dompurify` bypass advisories
(DEP-002) and untrusted markdown/EPUB/SVG rendering. Tracking that linkage into Stage 3.

### gosec lead dispositions (from Stage 0 table)
- `G702` transcode.go:248 → **false positive** (argv, absolute path, no shell).
- `G703` static.go:171/175 → **SEC-006** (narrow, admin-gated).
- `G204` transcode/thumbnail → **false positive** (argv, absolute paths). `G204` hook/commands/runner →
  **SEC-003/004/005**.
- `G304` extract/transcode/media_thumbnail → **mitigated** (confined `Fs` + zip-slip + hash-named cache).
- `G110`/`G115` extract.go → **mitigated** (bounded copy + lying-header + cumulative cap; declared-size
  overflow still safe). Minor: assert `declaredSize >= 0` for clarity (→ Stage 2 nit).
- `G203` static.go:101 → admin-only branding injection into `template.JS` (admin already trusted) →
  Info; harden with proper JSON-in-HTML escaping (→ Stage 3).
- md5/sha1 (`G401/G501/G505`) in `files/file.go` → **false positive** (user-selectable file checksums).

---

## Stage 2 — Backend correctness & concurrency

Deep-dived the concurrency cores: the transfer job registry, the events bus, the LRU cache; spot-checked
`foldersize` (singleflight) + `searchindex` (memory cap). **The concurrency code is high quality** — and
the gosec panic/error leads cleared cleanly. Lighter coverage on `trash`/`storage/bolt` transaction
atomicity (noted as a follow-up).

### Strong positives (verified)
- **Job registry** ([jobs/registry.go](../../jobs/registry.go)): consistent `registry.mu`→`job.mu` lock
  ordering (no inversion across Enqueue/Cancel/Dismiss/sweep/run); a job is only ever on one worker lane;
  snapshot-captured-before-scheduling avoids the fast-lane completion race; queue-full marks failed
  instead of blocking.
- **Transfer executor** ([http/transfers.go:69](../../http/transfers.go)): sequential, cancellation-checked,
  rolls back the partial destination on any item error, never touches the source until a copy fully
  succeeds + verifies — solid data integrity. Transient-error retry is bounded + backoff'd.
- **Events bus** ([events/events.go](../../events/events.go)): copies the subscriber slice under RLock then
  releases before dispatch (no handler-held lock, no re-entrant deadlock); each subscriber is
  panic-isolated via recover.
- **Cache** ([cache/cache.go](../../cache/cache.go)): RWMutex (Get=RLock, Put/evict=Lock); bbolt index
  serializes its own writes; sha256-hashed keys sanitize arbitrary key strings to safe sharded paths.
- `searchindex` is **memory-capped** (`maxEntries` → `errIndexTooBig` → permanent live-walk fallback);
  `foldersize` dedups concurrent computes with `singleflight`.

### Findings

#### COR-001 🔵 L — `events.Subscribe` unsubscribe uses a stale slot index
**Location:** [events/events.go:219-231](../../events/events.go) · **Status:** Open
Unsubscribe captures the registration slot `idx`, but `Publish`/unsubscribe compact the slice with
swap-remove, so after any prior removal that `idx` points at a different (or out-of-range) handler →
the wrong subscriber is removed or the call no-ops. In production this never fires (audit + webhook
subscribers register once at startup and never unsubscribe), so impact is **test-only** (leaked/
mis-removed subscribers → potential flaky tests).
**Recommendation:** Identify subscribers by a unique token (pointer/struct) rather than a captured index.

#### COR-002 🔵 L — Cache files/dirs are world-readable (0644/0755)
**Location:** [cache/cache.go:97,173,176](../../cache/cache.go) (gosec G301/G306) · **Status:** Open
Cached thumbnails (derived from possibly-private user files) are written `0644` inside `0755` dirs, so
other local OS users on the host can read them. Moot inside a single-tenant container; relevant on a
shared host.
**Recommendation:** Create the cache dir `0700` and files `0600` (the index.db already uses `0600`).

#### COR-003 🔵 L — Cache eviction uses an O(n²) insertion sort (perf; → Stage 4)
**Location:** [cache/cache.go:364-368](../../cache/cache.go) · **Status:** Open
`evictOnce` hand-rolls an insertion sort over the index snapshot. The comment claims "~20k entries
sortable in microseconds," but insertion sort is O(n²) — ~20k entries is ~10⁸ comparisons (hundreds of
ms), not microseconds. It runs in a 5-min background goroutine (not the request path), so impact is a
periodic CPU spike at scale, not user latency.
**Recommendation:** Replace with `sort.Slice(entries, byAtimeAsc)` (O(n log n)); fix the misleading comment.

#### COR-004 ⚪ — Unchecked errors are mostly idiomatic close-on-read (gosec G104 ×14)
**Location:** `http/extract.go` (×8 read-side `Close`/probe), `cmd/*`, `jobstore`, `trash`, `upload_cache_*`
· **Status:** Fixed — all 14 sites now `_ =`-assigned; gosec G104 14 → 0 (total 63 → 46). Behavior unchanged.
The G104 cluster is overwhelmingly ignored `Close()`/discard errors on read paths, which is acceptable
Go idiom. Write-path closes that matter are already checked (e.g. `extract.go` checks `outFile.Close`).
**Recommendation:** Low priority — optionally wrap the handful with `_ =` for intent clarity; no behavior
change. (Minor: `http/transfers.go:146` backoff slice length is implicitly coupled to `maxAttempts=3`;
derive one from the other to prevent a future index panic — gosec G602, currently safe.)

### gosec lead dispositions (Stage 2 scope)
- `G602` transfers.go:154 → **false positive** (the `if attempt > 0` guard bounds `attempt-1` ∈ {0,1}).
- `G118` video_thumbnail.go:104 → **intentional** (async cache write must outlive the request); the
  ffmpeg `WithTimeout(Background)` is bounded by the concurrency semaphore.
- `G115` int-overflow (audit/cache/fileutils/volume) → benign (config-sized values / non-negative
  `io.Copy` counts); extract.go overflow already shown safe in Stage 1.

---

## Stage 3 — Frontend correctness & quality

**The frontend is high quality.** XSS is tightly contained, TypeScript discipline is strong, and
component cleanup is systematic. Two minor findings.

### Strong positives (verified)
- **XSS surface is one sanitized sink** ([TextViewer.vue:78-89](../../frontend/src/components/files/TextViewer.vue)):
  the only `v-html` binds `DOMPurify.sanitize(marked.parse(content))` — sanitize *after* render, correct
  order. The custom `afterSanitizeAttributes` hook only *adds* `target=_blank`/`rel=noopener noreferrer`
  to links (doesn't weaken sanitization). `innerHTML` uses are static icon strings, not user data. No
  inline SVG rendering.
- **TS discipline:** exactly **1** `@ts-ignore`/`eslint-disable` in the entire frontend; 51 `any` total,
  mostly in the API layer where backend JSON is loosely typed.
- **No leaks:** 66 `onUnmounted`/`onBeforeUnmount` hooks; every `window`/`document` listener in the 4.7k-line
  `FileListing.vue` is symmetrically removed; all 4 `setInterval` sites are cleared with null-guards; 27
  `AbortController` usages (explains the raw add/remove listener count delta).
- **i18n:** English-only respected — a single `en.json` (253 keys), no stray locales.
- **API errors:** centralized `StatusError` type + a shared fetch wrapper; consistent non-2xx → throw.

### Findings

#### FE-001 🔵 L — `any` usage concentrated in the API layer
**Location:** `frontend/src/api/files.ts` (×9), `views/files/FileListing.vue` (×5), `FolderPicker.vue` (×3),
… (51 total) · **Status:** Partially fixed — the API layer (13 sites in `api/{files,utils,pub,tus}.ts`) is
fully typed (`grep ': any' src/api/` → 0); the ~38 component-level sites (`FileListing.vue`, `FolderPicker.vue`,
…) remain as the incremental tail.
Most `any` sits where backend JSON crosses into the app. Typing these responses (the `Resource`/`Job`/
settings shapes already exist as types) would catch shape drift at compile time.
**Recommendation:** Replace API-boundary `any` with the existing response interfaces; low-risk, incremental.

#### FE-002 🔵 L — Verify the EPUB render sandbox (untrusted content)
**Location:** [EpubViewer.vue:22-23](../../frontend/src/components/files/EpubViewer.vue) · **Status:** Open
EPUBs (untrusted, multi-user) render via `vue-reader`/epubjs with `{ allowPopups: true }`. epubjs renders
chapters in an iframe; whether embedded EPUB scripts can execute depends on the iframe `sandbox` flags.
Combined with the `@xmldom/xmldom` advisories (DEP-001) and the localStorage-token theft risk (Stage 1
cross-note), a malicious EPUB is the most plausible XSS path.
**Recommendation:** Confirm epubjs sandboxes without `allow-scripts` (or add an explicit `sandbox`
without it); reconsider `allowPopups`. Pair with the DEP-001 `epubjs`/`xmldom` bump.

### Lighter coverage (flagged, not exhaustively traced)
- **C4 Pinia stores:** the `fileStore`↔`panes.a` facade and async-action races weren't exhaustively traced
  (the backend-equivalent care + the deliberate facade design lower the risk). A focused store review can
  ride the Stage-5 decomposition work.
- **C6 a11y:** the project had dedicated a11y passes historically (focus trap, ARIA, skip-link, contrast —
  Stage 11 arc), so a fresh deep WCAG audit is lower priority; deferred unless you want it.

---

## Stage 4 — Performance

2.5.1 was a performance release (icon tree-shaking, route code-split, dropped legacy build), and the
backend hot paths show consistent perf-awareness. Static review only — runtime profiling stays deferred
(consistent with the earlier "idle slowness ≈ NAS HDD spin-up" finding, which was server-side I/O, not app code).

### Strong positives (verified)
- **Search** ([search/search.go](../../search/search.go), [http/search.go](../../http/search.go)): a single
  `afero.Walk`, results **streamed** as NDJSON (bounded memory), **cancellable** via `context.Cause` (a new
  search/disconnect aborts the old walk), with a result cap. Indexed search rides the memory-capped
  `searchindex`.
- **Folder sizes** ([foldersize/foldersize.go](../../foldersize/foldersize.go)): `singleflight` dedup + LRU +
  5-min TTL + events-bus invalidation — recursive sizing is computed once and reused.
- **Listing**: concurrent (16-worker) type detection with lazy header reads (Stage 1) — avoids the
  thousands-of-sequential-opens cost on NAS mounts.
- **Frontend**: virtualized listing (`RecycleScroller`); 2.5.1 bundle cuts (~170 KB less gz JS, route-split
  admin/settings/login/share/trash).

### Findings

#### PERF-001 🔵 L — `FileListing.vue` carries ~40 computeds/watchers in one 4.7k-line component
**Location:** [frontend/src/views/files/FileListing.vue](../../frontend/src/views/files/FileListing.vue) ·
**Status:** Open
Not a confirmed hot-path regression (the list is virtualized, computeds are lazy/cached), but this density
in one component makes it easy to accidentally introduce an O(n)-per-tick computed over the full item set.
**Recommendation:** During the Stage-5 decomposition (D3), verify no computed/watcher iterates the entire
(non-virtualized) item array on every reactive change; extract row-derived state into the row component.

#### Cross-ref
- **COR-003** (cache eviction O(n²) insertion sort) is the one concrete backend perf item — filed in Stage 2,
  fix = `sort.Slice`.

---

## Stage 5 — Code quality & cleanliness

**Exceptionally clean.** Only **5 TODO/FIXME comments in the entire source** (the earlier "91" was
node_modules noise), low duplication (shared `materializeEntry`, `ParseCommand`, `StatusError`,
`PaneTarget`; `withUser`/`withAdmin`/`withPermShare` middlewares). The findings are dead-code removal
(confirming Stage 0) plus decomposition of the few oversized files.

### Confirmed dead code (verified 0 references) — consolidates QUAL-001/002/003
- **Dead modules/types:** `frontend/src/utils/{cookie,css,describeError}.ts`, `frontend/src/stores/router.ts`,
  `frontend/src/types/utif.d.ts` — all **0 references**.
- **Dead export:** `utils/constants.ts: logoURL` (leftover from the reverted per-user-logo feature) + the
  knip-listed unused exports (`api/files.ts: copy`, `api/tags.ts: del`, `PANE_CONTEXT_KEY`, …).
- **Unused npm deps (all confirmed):** `@vueuse/integrations` (0 imports), `utif` (only the dead `.d.ts`),
  `vue-lazyload` (only survives in a code *comment* — they switched to native `loading="lazy"`),
  `@vitejs/plugin-legacy` (orphaned by the 2.5.1 legacy-build removal). → `pnpm remove` all four.

### Findings

#### QUAL-006 ⚪ — Oversized files are decomposition candidates
**Location:** `FileListing.vue` (4,772), `Preview.vue` (2,071), `ComparePane.vue` (1,542), `InfoPane.vue`
(1,244), `ListingItem.vue` (1,168); Go: `tags/tags.go` (794), `cmd/root.go` (672), `http/extract.go` (634)
· **Status:** Open
All functional, but large enough to slow comprehension and raise regression risk. `FileListing.vue` is the
clear priority (it also concentrates the PERF-001 computed density and the drag/keyboard/listener wiring).
**Recommendation:** Extract cohesive units (drag, keyboard-nav, selection, row-derived state) into
composables/child components. Treat as ongoing refactoring, not a blocking fix.

#### QUAL-007 ⚪ — Dated removal TODOs to track
**Location:** [cmd/root.go:64](../../cmd/root.go), [cmd/root.go:442](../../cmd/root.go)
(`TODO(remove): remove after July 2026`) · **Status:** Open
Two time-bound migration shims slated for removal after **July 2026**. Worth a tracked reminder so they
don't silently rot. (The other 3 TODOs — `main.ts:106`, `upload.ts:9`, `VideoPlayer.vue:75` — are minor
refactor/feature/test notes.)
**Recommendation:** Calendar/track the July-2026 removals; revisit then.

---

## Stage 6 — Tests & coverage

All Go tests **pass** (`go test ./...` green); the frontend suite (~315 vitest tests) passes in CI. Coverage
is strong on the derived-state + transfer machinery and weak on the security-critical surface.

### Coverage map (Go)
| Well-covered (75–92%) | Under-covered (security-relevant) |
|---|---|
| events 92 · audit 89 · tags 86 · jobs 86 · audiotags 86 · cache 86 · searchindex 85 · jobstore 81 · trash 81 · foldersize 76 · diskcache 75 · fileutils 75 | **auth 13** · **users 18** · **http handlers 21** · settings 15 · **share 27** · **files 37** (path core) · runner 41 · img 52 · search 52 |

(`storage/bolt` 0% — the persistence layer is exercised only indirectly.)

### Findings

#### TEST-001 🟡 M — Security-critical code is the least-tested
**Location:** `auth/` (13%), `files/` path core (37%), `http/{public,share,resource,users,settings}.go`
(~21%), `users/` (18%), `share/` (27%) · **Status:** Open
The packages with the lowest coverage are exactly where this audit's Stage-1 findings live (login flow,
path confinement, share access/IDOR, permission gates). Without tests there, a future change could
silently reintroduce a traversal/authz bug. By contrast the riskiest *single* feature — archive
extraction — **is** well-tested (`extract_test.go`, `extract_password_test.go`).
**Recommendation:** Add targeted security-regression tests: (a) path-confinement (`files`) — `..`/absolute/
symlink rejection; (b) auth — each method's accept/block/pass + JWT expiry/alg; (c) share/public —
scope confinement + ownership/IDOR + password gate; (d) handler permission gates (move/copy/delete/upload
forbidden without the perm). These double as living proof for the SEC-* fixes.

### Positives
- The transfer/job state machine, cache, search index, trash, and audit log — the stateful concurrency
  cores — are all 75–92% covered. Extraction has dedicated zip-slip + password tests. The `--race` suite
  runs in CI on every push.

---

## Stage 7 — Build / deps / ops / docs

### Findings

#### OPS-001 🔵 S — `go.mod`/`go.sum` drift (orphaned deps from the cleanup)
**Location:** `go.mod` · **Status:** Open
`go mod tidy` would remove `github.com/cpuguy83/go-md2man/v2` and `github.com/russross/blackfriday/v2`
(indirect) — cobra's doc-generation deps, orphaned when `cmd/docs.go` was deleted in the recent upstream-
cruft cleanup but not re-tidied.
**Recommendation:** `go mod tidy`. (Trivial; ride it with the dead-code batch.)

#### OPS-002 ⚪ — First-run admin password is printed to the log
**Location:** [cmd/root.go:649](../../cmd/root.go) · **Status:** Open
On first init the randomly-generated admin password is logged so the operator can sign in. Intentional and
necessary for bootstrap, but the credential lands in logs (which may be shipped/aggregated).
**Recommendation:** Keep, but document that first-run logs contain the initial password (rotate after
login; protect log access). No code change required.

### Positives
- **Fork attribution complete:** `LICENSE` (Apache-2.0) + `THIRD_PARTY_LICENSES.md` + `licenses/`; README
  credits upstream. No license risk.
- **No accidental secret logging** (only the intentional first-run password above).
- Docker image has a `HEALTHCHECK`; runtime is the PUID/PGID model (with the documented
  `group_add`/su-exec limitation); the JWT key won't-start-without-one.
- Internal `docs/` are historical planning/QA artifacts (architecture-v1.3/v2.4, RC-fix logs) — accurate as
  history; README + CHANGELOG are current for 2.5.1.

---

## Stage 8 — Synthesis & remediation backlog

### Overall verdict

**filebrowser-pretty 2.5.1 is in genuinely good shape.** Across 29 findings there are **no Critical and no
High** issues. The fundamentals a file server lives or dies on are done right: per-user path confinement,
defense-in-depth archive extraction, bcrypt + alg-pinned JWT auth, ownership-checked shares, careful
concurrency, disciplined frontend cleanup, and a contained/sanitized XSS surface. The findings are
**hardening, hygiene, and test-coverage** — not firefighting.

The two themes worth real attention: (1) **login has no brute-force protection** (the one broadly-exposed
gap), and (2) the **security-critical packages are the least-tested**, so the very logic this audit vetted
isn't guarded against regression. Several "Medium" security items are **admin-opt-in by design** (exec,
webhooks) — worth hardening + documenting, but not remotely exploitable.

### Prioritized remediation backlog (severity × effort)

**Batch A — Quick wins** *(all Small; low-risk, high tidiness/security value)*
- DEP-002 bump `dompurify` ≥ 3.4.9 · QUAL-001/002 remove 4 unused deps (`@vitejs/plugin-legacy`, `utif`,
  `vue-lazyload`, `@vueuse/integrations`) + **OPS-001** `go mod tidy` · QUAL-003 delete confirmed dead
  modules/exports · SEC-008 widen share hash to 16 bytes · SEC-009 constant-time token compare ·
  COR-002 cache perms 0600/0700 · TOOL-002 add CI `gosec`/`govulncheck`/`pnpm audit`.

**Batch B — Login hardening** *(Medium; highest real-world ROI)*
- SEC-001 per-IP + per-account login rate-limiting / lockout.

**Batch C — Security-regression tests** *(Medium–Large; pairs with the SEC fixes as proof)*
- TEST-001 path confinement (`files`), auth methods + JWT, share scope/IDOR, handler permission gates.

**Batch D — Admin-gated + untrusted-content hardening** *(Medium; defense-in-depth)*
- SEC-002 webhook internal-IP/SSRF block · SEC-003/004/005 command-exec sharp edges (harden + doc) ·
  DEP-001 + FE-002 bump `epubjs`/`xmldom` + verify EPUB iframe sandbox.

**Batch E — Opportunistic / ongoing** *(mixed)*
- SEC-006 branding path confinement · SEC-007 download-token-in-query · COR-001 events unsubscribe ·
  COR-003 cache eviction `sort.Slice` · PERF-001 + QUAL-006 decompose `FileListing.vue` (largest;
  ongoing) · FE-001 API-layer `any`.

**Track (no code now):** TOOL-001 run govulncheck in CI (go1.26 blocks it locally) · QUAL-007 the two
July-2026 removal TODOs · OPS-002 document first-run password.

### Suggested sequence
**A → B → C → D**, then E as ongoing. Batch A is a single safe PR (deps + dead code + small hardening).
B and C together close the login gap *and* prove it with tests. D handles the admin-gated + EPUB items.
E rides along opportunistically. Per the agreed policy, every batch passes the full gate suite
(`go build/vet/test --race ./...`, `GOOS=windows go build .`, frontend `typecheck`/`lint`/`test`/`build`)
before commit; filesystem-touching fixes get a NAS-RC pass.

---

## Remediation progress

### Batch A — ✅ Done (gates green; awaiting commit)
Fixed: **DEP-002** dompurify 3.4.7→3.4.11 · **QUAL-001/002** removed 4 unused deps
(`@vitejs/plugin-legacy`, `utif`, `vue-lazyload`, `@vueuse/integrations`) · **OPS-001** `go mod tidy`
(dropped `go-md2man` + `blackfriday`) · **QUAL-003** deleted 5 dead modules
(`utils/{cookie,css,describeError}.ts`, `stores/router.ts`, `types/utif.d.ts`) + `logoURL` export ·
**SEC-008** share hash 48-bit→128-bit · **SEC-009** constant-time share-token compare ·
**COR-002** cache perms 0700/0600 · **TOOL-002** added CI "Security Scan" job (govulncheck/gosec/pnpm
audit, non-blocking to start).
Gates: Go `build`/`vet` + `cache`/`http`/`share` tests green; FE typecheck/eslint/prettier + **315 tests**
+ build green. *(Left as negligible: api `copy`/`del` exports, `PANE_CONTEXT_KEY` — used internally.)*

### Batch B — ✅ Done (gates green; awaiting commit)
**SEC-001** login rate-limiting: new `http/login_throttle.go` (per-IP failure window → 429 + Retry-After
after 5 failures, cleared on success, lazy GC), wired into `loginHandler` (checks before the bcrypt-cost
auth, records fail/success). Keyed by `realip` (trusted-proxy reliable; bcrypt backstops direct exposure).

### Batch C — ✅ Done, partial scope (gates green; awaiting commit)
**TEST-001** — the two highest-ROI security-regression tests: `http/login_throttle_test.go` (lockout /
isolation / expiry / reset / stale-window, proves SEC-001) and `files/confinement_test.go` (a scoped
`BasePathFs` rejects `..`/absolute escape — the core A1 primitive). **Remaining (larger):** handler-level
auth-method / share-IDOR / permission-gate tests need the full HTTP integration harness — left as the
tail of TEST-001.

### Batch D — ✅ Done (gates green; awaiting commit)
**SEC-002** webhook SSRF: new `webhooks/ssrf.go` — the delivery client's dialer resolves + rejects
loopback/private/link-local/metadata/multicast at connect time (defeats DNS-rebinding; redirects
re-enter the guard), with `webhooks/ssrf_test.go`. **SEC-003/004** in-code security docs on the
command-exec trust model (`runner/runner.go`, `http/commands.go`). **DEP-001/FE-002** EPUB: set
`allowScriptedContent:false` explicitly (epub.js is already latest and pins `@xmldom/xmldom` 0.7.x, so
the no-script iframe sandbox is the mitigation; residual is DoS-only since scripts can't run).

### Batch E — ✅ Done, core items (gates green; awaiting commit)
**COR-001** events bus: token-keyed (`map[uint64]`) subscribe/unsubscribe replacing the fragile
slot-index swap-remove. **COR-003** cache eviction: `sort.Slice` replacing the O(n²) insertion sort.
**SEC-006** branding static override: confine the joined path to `Branding.Files` (reject escapes).
**Deferred (ongoing tail):** SEC-007 (download-token-in-query → needs scoped download tokens), FE-001
(API-layer `any` typing), QUAL-006/PERF-001 (`FileListing.vue` decomposition — large, explicitly ongoing).

### Final gate sweep (all batches together)
`go build/vet ./...` + **`go test --race ./...`** + `GOOS=windows go build .` — all clean. Frontend
typecheck + eslint + prettier + **315 vitest tests** + build — all green. New tests added: 3 (throttle,
confinement, SSRF). **Net at this point: 19 of 29 findings fixed; 10 deferred.** *(Three more — DEP-003, TOOL-001, COR-004 —
were then fully fixed, and a fourth, FE-001, partially (its API layer); see "Deferred-plan execution" below.
Running total: **22 of 29 fixed + FE-001's API layer**. Open tail: FE-001 component-level `any`, SEC-007,
DEP-001 (`xmldom`, upstream-blocked), QUAL-006/PERF-001 (`FileListing.vue` decomposition), and TEST-001's
HTTP-integration tests.)*
NAS-RC pass still recommended for the filesystem-adjacent change (SEC-006 branding) before relying on it.

### Deferred-plan execution — DEP-003 / TOOL-001 / COR-004 / FE-001 (post-Batch E)
Four deferred items, executed per `docs/audit/remediation-plans.md`:

- **COR-004** ✅ — silenced gosec **G104** (unchecked errors) at the 14 best-effort / cleanup call
  sites flagged: `cmd/{config,users}.go` (`_ = w.Flush()`), `http/upload_cache_{memory,redis}.go`,
  `jobstore/jobstore.go` + `trash/trash.go` (`_ = db.Close()`), and `http/extract.go` ×8 (rc/f
  `Close()` on error/cleanup paths). gosec G104 **14 → 0** (total 63 → 46); behavior unchanged — only
  the linter intent is now explicit.
- **TOOL-001** ✅ — the CI govulncheck step (`.github/workflows/ci.yaml`) no longer masks failures with
  `|| true`: a real vuln now reds the step (job stays non-blocking via `continue-on-error`). It runs on
  the go.mod toolchain (1.25), where govulncheck works — it panics on a go1.26 *local* toolchain (x/tools
  bug). Local repro documented: `GOTOOLCHAIN=go1.25.0 go run golang.org/x/vuln/cmd/govulncheck@latest ./...`.
- **DEP-003** ✅ — added pnpm `overrides` for **esbuild `>=0.28.1`** + **rollup `>=4.59.0`**, clearing
  those transitive advisories. The planned `undici` override was **reverted**: forcing undici ≥7.28 into
  `jsdom@29.1.1` broke its dispatcher `require` (vitest then failed to load all 31 test files). undici is
  test-only (via jsdom) and the lowest-value advisory, so it's left to clear when jsdom updates —
  consistent with the audit. Only `@xmldom/xmldom` (DEP-001, upstream-blocked) advisory remains.
- **FE-001** ✅ — typed **all 13 API-layer `any` sites** across `api/{files,utils,pub,tus}.ts`:
  `(item: ResourceItem, index: number)` map callbacks, `DownloadFormat` (already defined in `file.d.ts`),
  `BodyInit`, `ApiOpts`, `boolean`, `string` message, plus a new shared `MoveCopyItem` interface and a
  `UploadProgress` type. The upload-progress callback is now `{ loaded, total }`-typed end to end, which
  also fixed a latent gap — the TUS path only forwarded `loaded`, so `tus.ts` `onProgress` now passes
  `total` too. `grep -rE ': any' src/api/` → **0**.

**DEP-002 / dompurify** — confirmed already at **3.4.11** (the npm_and_yarn group bump landed in Batch A).

Gates (all four together): Go `build` / `vet` / **`test --race ./...` (24 pkg ok)** + `GOOS=windows go
build .` — clean. Frontend typecheck + eslint + prettier + **315 vitest tests** + build — green. Only new
runtime behavior is the additive TUS `total` forward. No commits (manual, per project convention).
