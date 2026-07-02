# Security & Architecture Audit — filebrowser-pretty 2.6.2

**Date:** 2026-06-30
**Scope:** Read-only audit of the local checkout (`/Users/cory/Developer/filebrowser-pretty`).
**Method:** Static review of the Go backend (`http/`, `auth/`, `webhooks/`, `runner/`,
`settings/`, `users/`, `files/`) and the Vue 3 frontend (`frontend/src`), prioritized
for a self-hosted file browser: filesystem/path safety, archive extraction, share/public
access, command execution, SSRF, JWT, and frontend HTML sinks.
**Charter:** Report-only. No files were modified. This is the single output artifact.

Rubric source: sanitized "NextToken" AI-audit rubric, re-targeted to this repo's actual
stack (Go + Vue, embedded bbolt/storm KV store — **no SQL layer**; cobra/viper config —
**not `process.env`**). SQL-injection, CORS-on-JWT, Express-middleware, and
package-hallucination checks were dropped as inapplicable.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| Informational | 3 |
| Accepted risk (already documented in-code) | 1 |

**Headline:** This is a mature fork with a prior security pass already applied — the code
carries remediation tags (`SEC-001/002/003/009`, `S8-3`, `RC-18`) and matching defenses.
The high-value attack surfaces for a file browser (path traversal, zip-slip, decompression
bombs, share access, SSRF, JWT, command exec) are all explicitly defended. No new
Critical/High/Medium issues were found. The items below are hardening notes and one
previously-accepted risk, not exploitable defects.

---

## Findings

### LOW-1 — Command WebSocket upgrader sets no explicit `CheckOrigin`
- **File:** `http/commands.go:22`
- **Evidence:** `var upgrader = websocket.Upgrader{ReadBufferSize:1024, WriteBufferSize:1024}` — no `CheckOrigin`.
- **Why it matters:** With no `CheckOrigin`, gorilla applies its default same-origin check
  (rejects a present, mismatched `Origin`; allows a missing `Origin`). The endpoint is
  already gated by a valid JWT **and** server `EnableExec` **and** per-user `Perm.Execute`,
  so cross-site WebSocket hijacking is not practically reachable — but relying on the
  library default is implicit.
- **Suggested (unapplied):** Set an explicit `CheckOrigin` that validates against the
  configured base URL / same host, so the policy is stated rather than inherited.

### LOW-2 — SSRF guard doesn't normalize exotic IPv6→IPv4 embeddings (NAT64)
- **File:** `webhooks/ssrf.go:20`
- **Evidence:** `isBlockedIP` uses `IsLoopback/IsPrivate/IsLinkLocal*/IsUnspecified/IsMulticast`.
  Go normalizes IPv4-mapped IPv6 (`::ffff:127.0.0.1`) so those *are* caught, but a NAT64
  address (`64:ff9b::/96`) embedding a private IPv4 is not decoded and would pass the check.
- **Why it matters:** Only exploitable in an environment that actually runs NAT64 to reach
  internal IPv4 — a narrow, non-default deployment. The core guard (resolve-then-dial-by-IP,
  redirect re-entry) is otherwise strong.
- **Suggested (unapplied):** If NAT64 is in scope, additionally reject `64:ff9b::/96` (and
  decode the embedded v4) in `isBlockedIP`.

---

## Accepted risk (already documented in-code)

### ACC-1 — Shell-mode command allowlist gates only the first token
- **File:** `http/commands.go:80` (see the in-code `SECURITY (audit SEC-003)` comment)
- **Evidence:** The allowlist `slices.Contains(d.user.Commands, name)` matches only the first
  argv token. When `settings.Shell` is configured, `runner.ParseCommand` runs the **entire**
  raw line via `sh -c`, so a user allowed `ls` can send `ls; <anything>`.
- **Status:** Already identified, documented, and accepted in-code. It is gated behind
  server `EnableExec` + admin-granted per-user `Perm.Execute` — treated as a
  server-privileged capability by design.
- **Suggested (unapplied):** Keep this called out in the ops runbook; consider a settings
  note that "Shell mode + Execute = shell access for that user."

---

## Informational

- **INFO-1 — `d.Check()` rule scope vs. rebased share FS.** In `http/public.go:69` the share
  FS is rebased with `afero.NewBasePathFs` (which itself blocks `..` escapes), while the
  per-user rules in `data.Check` (`http/data.go:33`) evaluate paths against the user's
  original root. Not a traversal (BasePathFs contains it), but the two scopes are worth a
  mental note when reasoning about share ACLs.
- **INFO-2 — Verbose operational logging.** `wsErr` (`http/commands.go:34`) logs
  `URL.Path`, status, `RemoteAddr`. This is operational metadata, not secrets — extraction
  deliberately keeps archive passwords out of logs (`http/extract.go` header comment). No
  action needed; noted for completeness.
- **INFO-3 — Frontend HTML sinks are safe.** The only `v-html` sink
  (`frontend/src/components/files/TextViewer.vue:12`) is `DOMPurify.sanitize`d before
  binding (with an `afterSanitizeAttributes` hook). The `innerHTML` writes in
  `utils/buttons.ts` and `components/Shell.vue` assign static icon strings / clear to `""`,
  never user content.

---

## Verified clean (checked, no issue)

- **JWT hardening** — `http/auth.go:102`: parser pins `HS256` via `WithValidMethods` and
  requires expiry via `WithExpirationRequired`; `alg=none`/alg-confusion is rejected.
  Signing key is 512-bit `crypto/rand` (`settings/settings.go:132`), generated at init — no
  hardcoded/default secret.
- **Session revocation** — `http/auth.go:123`: tokens issued before `SessionsRevokedAt` are
  rejected ("sign out everywhere").
- **Login throttling** — `http/auth.go:144` (`SEC-001`): per-IP lockout runs *before* the
  bcrypt check, mitigating online guessing.
- **Password storage** — `users/password.go:27`: bcrypt (`DefaultCost`). No MD5/SHA-1.
- **Share access** — `http/public.go:130`: constant-time token compare (`subtle.ConstantTimeCompare`,
  `SEC-009`) + bcrypt password; share downloads require `Perm.Share` and `Perm.Download`.
- **Zip-Slip** — `http/extract.go:394-412`: dual defense (string-prefix pass + `filepath.Rel`
  pass) plus per-entry `Check`; symlinks/hardlinks/devices are skipped (`:375`).
- **Decompression bombs** — `http/extract.go`: entry-count cap, per-file and cumulative
  uncompressed caps, compression-ratio guard, bounded `io.LimitReader` copy, and a
  "lying header" post-check.
- **Archive password handling** — passwords ride a base64 header (never the URL/audit log);
  all-or-nothing validation before any write.
- **SSRF** — `webhooks/ssrf.go`: DNS-resolve then dial the vetted **IP** (closes DNS-rebinding),
  every redirect hop re-enters the guard, blocks loopback/private/link-local (incl. cloud
  metadata `169.254.169.254`)/unspecified/multicast (`SEC-002`).
- **Command execution** — `http/commands.go:94`: `exec.Command(argv...)` (no shell) in the
  default (no-`settings.Shell`) configuration; gated by `EnableExec` + `Perm.Execute` +
  per-user allowlist.
- **Path scoping** — all resource/raw/preview/comic/tags/tus routes run under `withUser`;
  filesystem access is via each user's scoped `afero` FS + `rules.Checker`.
- **No SQL layer** — storage is bbolt + asdine/storm (embedded KV); SQL-injection checks N/A.
- **Secrets** — no hardcoded credentials/keys/tokens found in `auth/`, `http/`, `settings/`,
  or `frontend/src`; `os.Getenv` limited to `FB_BASEURL` and intentional hook/runner env
  expansion.

---

## Not applicable (dropped from the generic rubric)

SQL injection (no SQL), `process.env` startup validation (Go uses cobra/viper),
Express async-handler error middleware (Go net/http is synchronous), React unmount/stale-closure
checks (Vue Composition API), CORS-wildcard-on-JWT (token is header/query/cookie, not
cross-origin credentialed), npm/PyPI package hallucination (deps are Dependabot/Renovate-managed
with committed lockfiles).

---

## Method notes / limitations

- Read-only, static review only. No build, no execution, no dependency resolution, no lockfile
  or CI changes — per audit charter.
- Dependency CVE status was not independently verified; the repo already runs Dependabot +
  Renovate, so that surface is covered by existing automation.
- Cyclomatic-complexity/duplication metrics were not run (would require tooling install,
  out of charter); the manual read found no monolith or copy-paste hotspot worth flagging on
  a fork of this maturity.
