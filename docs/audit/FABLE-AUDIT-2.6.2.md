# Security & Quality Audit — filebrowser-pretty 2.6.2

**Auditor:** Claude Fable 5 (read-only audit; no code changed)
**Date:** 2026-07-01
**Scope:** repo at commit `868303e` (release/2.6.2 merge)
**Ground rules:** findings only — every "Recommendation" below is a description of a fix for a human to apply, not an applied change.

---

## Executive summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 6 |
| Info | 6 |

**Top themes**

1. **The core file-server attack surface is in good shape.** Path confinement (afero `BasePathFs` + per-request `d.Check` + explicit `filepath.Rel` escape checks), the archive-extraction hardening in `http/extract.go` (dual zip-slip passes, link-entry skip, ratio/size/count/lying-header caps, all-or-nothing password validation), JWT handling (HS256 pinned, expiry required, session-epoch revocation), the SSRF-guarded webhook dialer, and bcrypt everywhere are all sound. Prior audit fixes (SEC-001/002/003/006/009) are present and effective.
2. **Every scanner ran clean or near-clean.** `go vet`, `go build`, `staticcheck`: zero findings. `go test ./...`: all 24 packages pass. Frontend: `vue-tsc` 0 errors, `eslint` 0 findings, `vitest` 383/383 pass. `govulncheck`: **0 vulnerabilities affecting called code** (the go 1.25.11 + x/image v0.43.0 patch is confirmed effective). gosec produced 37 findings; after triage, all but a handful are false positives (details in Pass A).
3. **What remains is perimeter polish, not core defects:** token exposure in GET query strings, missing `Secure` cookie flag / anti-clickjacking headers, a couple of un-throttled or spoofable rate-limit paths, and a stale `golang.org/x/net` with advisories in uncalled code.
4. **Quality:** the Go side is well-factored; the frontend has one god-component (`FileListing.vue`, ~4.7k lines) that dominates maintenance risk.

**Passes completed:** A (automated), B (security hotspots), C (backend spot-checks), D (frontend), E (quality, abbreviated), F (dependencies). Pass C was targeted rather than exhaustive (noted per finding).

---

## Findings

Severity · Effort (S/M/L) · Confidence: **Confirmed** = verified in source; **NHV** = Needs-human-verification.

### Medium

| ID | Sev | Effort | Location | Finding |
|---|---|---|---|---|
| F-01 | Medium | M | `http/auth.go:66` | **JWT accepted as `?auth=` query parameter on GET.** Media tags can't send headers, so the full session token rides in URLs for thumbnails/previews/raw. Query strings land in reverse-proxy and access logs, browser history, and (for previewed HTML-ish content) potentially `Referer`. A leaked URL = a live session for up to 2 h. **Impact:** session hijack via log/history exposure. **Recommendation:** mint a separate short-lived (~1 min), download-scoped token for media URLs (claim restricting it to GET `/api/raw|preview|subtitle|transcode`), keep the primary token header/cookie-only; alternatively rely on the `auth` cookie for GETs and drop the query path. Confirmed (deliberate, per RC-18 comment — but scope-narrowing is still worthwhile). |
| F-02 | Medium | S | `frontend/src/utils/auth.ts:13` | **`auth` cookie set without `Secure` (and necessarily without `HttpOnly`).** `document.cookie = \`auth=${token}; Path=/; SameSite=Strict;\``. Without `Secure`, a plain-HTTP request (misconfigured proxy, direct-IP access) sends the token in cleartext. `HttpOnly` can't be set from JS at all — the token is also in localStorage, so XSS-theft parity is inherent to the design. **Recommendation:** append `; Secure` when `location.protocol === "https:"`; longer-term, consider issuing the cookie server-side (`Set-Cookie: HttpOnly; Secure; SameSite=Strict`) from `/api/login` so JS never handles it. Confirmed. |
| F-03 | Medium | S | `http/http.go:47` | **Global CSP lacks `frame-ancestors`; no `X-Content-Type-Options: nosniff` or `X-Frame-Options` anywhere.** The app (and password-protected share pages) can be framed by any origin → clickjacking against logged-in users (drag-drop upload tricks, share-dialog clicks). Missing `nosniff` invites MIME-sniffing of user-uploaded content served via `/api/raw` (partly mitigated by the per-response `script-src 'none'` CSP and `Content-Disposition`). **Recommendation:** extend the middleware CSP to `…; frame-ancestors 'self'` (or `'none'`), and set `X-Content-Type-Options: nosniff` globally. Confirmed. |

### Low

| ID | Sev | Effort | Location | Finding |
|---|---|---|---|---|
| F-04 | Low | S | `webhooks/ssrf.go:20` | **SSRF blocklist gaps:** `isBlockedIP` blocks loopback/private/link-local/multicast/unspecified, but not **100.64.0.0/10** (CGNAT — used by Tailscale; a webhook URL could reach tailnet peers), 192.0.0.0/24, 198.18.0.0/15, or NAT64 `64:ff9b::/96`. The dialer design itself (post-DNS IP pinning, redirect-safe) is excellent. **Recommendation:** add these ranges via `netip.Prefix` table. Confirmed (webhooks are admin-configured, which caps severity). |
| F-05 | Low | M | `http/auth.go:146` | **Login throttle keyed on spoofable client IP.** `realip.FromRequest` trusts `X-Forwarded-For` from anyone, so a direct-connecting attacker rotates XFF values to dodge SEC-001 lockout (bcrypt cost remains the real brake), or spoofs a victim's IP to lock them out. Already documented as accepted in `http/login_throttle.go:17`. **Recommendation:** honor XFF only from a configured trusted-proxy list; else use `RemoteAddr`. Confirmed / accepted-risk. |
| F-06 | Low | S | `http/public.go:140-153` | **No rate limit on share-password guessing.** `loginThrottler` protects `/api/login` only; `X-SHARE-PASSWORD` on public share routes can be brute-forced at bcrypt speed with no lockout or audit event. **Recommendation:** reuse `loginThrottler` (keyed IP+hash) on failed share auth; consider publishing an audit event on repeated failures. Confirmed. |
| F-07 | Low | S | `http/transcode.go:151` | **`transcodeLocks sync.Map` never evicts.** One mutex per unique video path lives for the process lifetime; cache eviction removes the `.mp4` but not the lock entry. Slow, unbounded (small) memory growth on large libraries. **Recommendation:** delete the entry after unlock when uncontended, or key a small LRU. Confirmed. |
| F-08 | Low | S | `http/extract.go:472` | **Cumulative extraction cap checked after each entry is written**, so `MaxTotalUncompressed` can be overshot by up to one `MaxUncompressedFileSize` (default headroom = one entry). Related: `int64(fileRef.UncompressedSize64)` at `:344` can wrap negative for an absurd declared size, skipping the *declared-size* early reject — the bounded `LimitReader` copy and the zip ratio check still cap actual bytes, so this is belt-and-suspenders only. **Recommendation:** check `c.totalBytes + declared > cap` *before* the copy, and reject entries with `UncompressedSize64 > MaxInt64`. Confirmed (defense-in-depth, not exploitable for unbounded writes). |
| F-09 | Low | L | `frontend/src/views/files/FileListing.vue` | **God component: ~4,724 lines** (next: `Preview.vue` 2,079; `ComparePane.vue` 1,556). Listing, selection, drag-drop, uploads, context menus, and keyboard handling in one SFC — highest regression-risk file in the repo. **Recommendation (document-only):** extract composables (selection, dnd, shortcuts) incrementally under test. Confirmed size; refactor value NHV. |

### Info

| ID | Sev | Effort | Location | Finding |
|---|---|---|---|---|
| F-10 | Info | — | `files/`, `http/raw.go:112` (getFiles) | **Symlinks inside a user scope are followed.** `BasePathFs` confines paths, not link targets: a symlink *within* the scope pointing outside it is readable/downloadable. Users can't create symlinks through the app; risk exists only when an admin mounts trees containing untrusted symlinks. Long-standing upstream filebrowser behavior. NHV whether any deployment mounts such trees; if so, add an `Lstat`-based skip like extract's link-entry skip. |
| F-11 | Info | — | `http/commands.go:80-86` | **Shell-mode command allowlist gates only the first token** (`ls; anything` passes if `ls` is allowed and `settings.Shell` is set). Documented in-code (SEC-003) as an admin-granted, server-privileged capability. Accepted risk; no change recommended beyond keeping `Execute` grants rare. |
| F-12 | Info | — | `http/static.go:152` | Deprecated `X-XSS-Protection: 1; mode=block` header — obsolete in all modern browsers, harmless. Can be dropped when convenient. |
| F-13 | Info | — | gosec G401/G501/G505 (`files/file.go`, `diskcache/file_cache.go`, `http/transcode.go:93`) | MD5/SHA1 usage is **non-cryptographic** (user-requested file checksums, cache keys). False positives. |
| F-14 | Info | — | gosec assorted | Remaining gosec results triaged as false positives: G204/G702 exec sites all use argv arrays with absolute trusted paths (no shell, no leading-dash injection — `runner/runner.go:99`, `auth/hook.go:106`, ffmpeg/ffprobe/pdftoppm call sites); G120 `http/audiotags.go:181` is bounded by `MaxBytesReader` + `RemoveAll`; G110 `http/static.go:220` gunzips embedded (trusted) assets; G602 `http/transfers.go:154` indexing is provably in-bounds (`maxAttempts=3`, `len(backoff)=2`, index `attempt-1 ∈ {0,1}`); G118 `http/video_thumbnail.go:104` `context.Background` is intentional (cache write must outlive the response); G703 `http/static.go:179/183` is mitigated by the SEC-006 `filepath.Rel` confinement directly above; G706 log-injection sites log server-derived values. |
| F-15 | Info | — | `go.mod` (`golang.org/x/net v0.54.0`) | **6 advisories in imported-but-uncalled code** (GO-2026-5025/5026/5027/5028/5029/5030 — `x/net/html` parsing + `idna` Punycode). govulncheck confirms no affecting call path. **Recommendation:** bump `golang.org/x/net` at the next routine dependency update (human-applied; no action taken here). |

---

## Pass notes

- **Pass A (automated):** `go vet` ✅ 0 · `go build ./...` ✅ · `staticcheck` ✅ 0 · `go test ./...` ✅ 24/24 pkgs · `gosec` 37 raw → triaged above · `govulncheck` ✅ 0 affecting · `vue-tsc --noEmit` ✅ 0 · `eslint src` ✅ 0 · `vitest run` ✅ 383/383. (`golangci-lint`, `semgrep`, `gitleaks` not on PATH — skipped per scope. `prettier --check` skipped as low-signal.)
- **Pass B (security):** reviewed `http/extract.go` (full), `http/auth.go`, `http/users.go` + `users/storage.go` + `storage/bolt/users.go` (the `Which` title-casing gate is backstopped by exact-match `reflect.FieldByName`, so casing tricks fail closed), `http/public.go` (+ share expiry enforced in `share/storage.go`), `http/raw.go`, `http/resource.go` (PATCH path checks sound), `http/static.go`, `http/commands.go`, `webhooks/ssrf.go`, `users/password.go` (bcrypt DefaultCost + common-password list + crypto/rand), exec call sites. Cross-referenced `http/authz_test.go` IDOR suite — not duplicated here. JWT: alg pinned HS256, `WithExpirationRequired`, key from settings DB (not hardcoded), settings GET handler does not expose the key.
- **Pass C (backend, targeted):** no `time.Tick` leaks; webhook dispatcher goroutine is semaphore-bounded with bounded retries; transfer retry/backoff bounds verified. Not exhaustively swept: `foldersize/`, `searchindex/`, `jobstore/` internals (tests pass; no scanner flags).
- **Pass D (frontend):** single `v-html` (TextViewer markdown) is DOMPurify-sanitized with a target/rel hook; every file with `addEventListener` has ≥ matching `removeEventListener`; no `innerHTML` with untrusted data (buttons.ts writes constant icon strings; Shell.vue clears content).
- **Pass E (quality, abbreviated):** Go files all < 800 lines; frontend outliers listed in F-09. No dead-code hunt performed (embed/i18n/dynamic-import false-positive risk) — **not reached** beyond size survey.
- **Pass F (dependencies):** Go deps current (jwt v5.3.1, bbolt 1.4.3, archives 0.1.5, x/crypto 0.52.0, x/image 0.43.0 ✅ patched); frontend majors current (Vue 3.5, Pinia 3, marked 18, DOMPurify 3.4). Only advisory: F-15 (x/net).

---

## Prioritized remediation backlog (severity × effort)

| # | ID | Action | Sev | Effort |
|---|---|---|---|---|
| 1 | F-03 | Add `frame-ancestors` to CSP + global `X-Content-Type-Options: nosniff` | Medium | S |
| 2 | F-02 | Add `Secure` to the auth cookie on HTTPS (consider server-set cookie) | Medium | S |
| 3 | F-01 | Scope/short-lived media token instead of full JWT in `?auth=` | Medium | M |
| 4 | F-06 | Throttle share-password attempts | Low | S |
| 5 | F-04 | Add CGNAT/benchmark/NAT64 ranges to SSRF blocklist | Low | S |
| 6 | F-08 | Pre-copy cumulative cap + declared-size overflow reject in extract | Low | S |
| 7 | F-07 | Evict `transcodeLocks` entries | Low | S |
| 8 | F-15 | Bump `golang.org/x/net` at next routine update | Info | S |
| 9 | F-05 | Trusted-proxy handling for realip (config surface) | Low | M |
| 10 | F-09 | Incremental `FileListing.vue` decomposition | Low | L |
| — | F-12 | Drop `X-XSS-Protection` opportunistically | Info | S |

**Scope confirmation:** no source, config, dependency, or build artifact was modified. A pre-existing untracked `docs/audit/AUDIT-2.6.2.md` was present before this audit began and was not touched.
