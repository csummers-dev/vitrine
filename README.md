<div align="center">

<img src="branding/logo.svg" width="120" alt="filebrowser pretty" />

# filebrowser pretty

### A self-hosted file browser.

A redesigned and improved refactor of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser). Built from the project's trusted Go backend, transformed into a modern experience with a beautiful design system, theming, a command palette, drag-and-drop everywhere, rich previews for images, video, audio, PDF, EPUB, code, and (much) more.

[![Version](https://img.shields.io/badge/version-1.2.1-5e6ad2?style=flat-square)](#)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

[Highlights](#highlights) ·
[Quick start](#quick-start) ·
[Architecture](#architecture) ·
[Roadmap](#roadmap)

</div>

---

## Why this fork

The project `filebrowser/filebrowser` is one of my most-often used applications in my homelab. Since the maintainers have moved it into "maintenance-only" mode I wanted to create a redesigned and updated version to bring it up to higher usability and quality standards.

**filebrowser pretty** is a full redesign starting from the `filebrowser/filebrowser v2.63.5` version.

---

## Highlights

| --- | --- |
| **Full design system** | Tailwind v4 tokens, type scaling, accent + surface variables, scoped components. |
| **First-class dark mode** | Light · Dark · System per-user, persisted in localStorage. Every surface — including EPUB chapter text and PDF.js chrome — repaints live without a refresh. |
| **⌘K command palette** | Linear-style fuzzy command runner. Backend search is wired into the same palette so files and commands surface together. |
| **Three view modes** | List · Grid · Gallery, all with the same selection model and keyboard shortcuts. Press `1` / `2` / `3` to swap. |
| **Drag everywhere** | Move/copy by dragging onto folders, breadcrumb segments, or the section title (= parent folder). Spring-loading: hover any drop target for 2 s during a drag and it opens, so you can chain drops through nested directories without ever releasing. Hold ⌘ to copy instead of move. |
| **Rich previews** | Image (EXIF panel) · Video (video.js with track info) · Audio (custom transport + ID3 APIC album art) · PDF (PDF.js with thumbnail rail + page nav) · EPUB (vue-reader with proper dark theme) · CSV (parsed table) · Text/code (Ace editor). |
| **Keyboard-friendly** | Press `?` for the shortcut cheat sheet. `g f` → files, `g s` → settings, arrows nav between files in preview, `Esc` closes everything. |
| **Mobile drawer + touch targets** | Purpose-built `SidebarDrawer` for narrow viewports, 44 px tap targets across every interactive surface, swipe-friendly preview. |
| **Inline file ops** | Create / rename / delete inline in the row with no modal interrupts. Delete uses optimistic UI with an Undo toast. |
| **Zip extract** | Server-side ZIP extraction with a slide-over panel, an "open the destination after extract" toggle, and an optional "delete the original on success" toggle. |
| **Shares with depth** | Manage shares from a dedicated settings page; per-share password + expiry; public share view repainted to match the app's surface. |
| **Live file metadata** | EXIF for photos (camera / lens / focal length / exposure / ISO / date taken), ID3 for audio (title / artist / album / year / artwork), track info for video. All extracted client-side, gracefully degrading. |
| **Per-user everything** | View mode, theme, locale, Ace editor theme, dotfile visibility, date format, single-click — all per-user, persisted via the existing user store. |

---

### The file listing

<p align="center">
  <img src="docs/screenshots/listing-list.png" width="80%" alt="List view with file-icon system and inline meta" />
</p>

Single-line rows with a clean icon system, hover affordances for the actions menu, a multi-select pill that turns into bulk action buttons, and a sort-by header that locks in width so the layout doesn't jitter.

<p align="center">
  <img src="docs/screenshots/listing-grid.png" width="49%" alt="Grid view" />
  <img src="docs/screenshots/listing-gallery.png" width="49%" alt="Gallery view with image thumbnails" />
</p>

Swap views with `1` / `2` / `3` or the segmented control in the header. Gallery view uses lazy-loaded thumbnails so a directory of thousands of photos still scrolls smoothly.

### The preview shell

<p align="center">
  <img src="docs/screenshots/preview-image.png" width="80%" alt="Image preview with EXIF info rail" />
</p>

A persistent right-rail with file properties, a format-specific metadata section (EXIF here), and primary actions (Share · Download · Rename · Delete). Move · Copy · Extract · Open sit in the secondary row.

<details>
<summary><b>More preview formats</b> — click to expand</summary>

<br/>

<p align="center">
  <img src="docs/screenshots/preview-video.png" width="80%" alt="Video preview with track info" />
  <br/><em>Video — video.js with a themed skin and a Tracks section in the info rail</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-audio.png" width="80%" alt="Audio preview with album art and custom transport" />
  <br/><em>Audio — ID3 album art, custom scrubber, ID3 tags surfaced</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-pdf.png" width="80%" alt="PDF preview with thumbnail rail" />
  <br/><em>PDF — PDF.js-rendered pages with a thumbnail rail; toolbar drives zoom and page-jumps</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-epub.png" width="80%" alt="EPUB preview with dark mode applied to chapter text" />
  <br/><em>EPUB — vue-reader with our dark theme injected into the iframe via <code>themes.override</code> (the only API that reliably beats the book's own CSS)</em>
</p>

</details>

### Light and Dark themes

The light and dark themes are a true ground-up rebuild, not a `filter: invert`. Every component re-themed against the same token palette, with surface-by-surface fixes so contrast never falls below WCAG AA. The user picks Light / Dark / System in Settings → Profile, and the choice is persisted in localStorage (per-user, per-browser). Defaults to System.

<table>
  <tr>
    <th align="center" width="50%">Light</th>
    <th align="center" width="50%">Dark</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/light-listing.png" alt="Light mode listing" /></td>
    <td><img src="docs/screenshots/dark-listing.png" alt="Dark mode listing" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/light-preview.png" alt="Light mode preview" /></td>
    <td><img src="docs/screenshots/dark-preview.png" alt="Dark mode preview" /></td>
  </tr>
</table>

The theme switch is live — flipping it doesn't refresh the page and doesn't lose state.

### Command palette

<p align="center">
  <img src="docs/screenshots/command-palette.png" width="70%" alt="⌘K command palette with backend file search" />
</p>

`⌘K` (or `/`) opens the palette. Backend file search is the same palette as the command list — debounced live results, keyboard-first, no separate "search modal".

### Mobile

<p align="center">
  <img src="docs/screenshots/mobile-drawer.png" width="32%" alt="Mobile sidebar drawer" />
  <img src="docs/screenshots/mobile-listing.png" width="32%" alt="Mobile file listing" />
  <img src="docs/screenshots/mobile-preview.png" width="32%" alt="Mobile preview" />
</p>

A dedicated `SidebarDrawer` for narrow viewports. 44 px tap targets across every control.

### Settings

<p align="center">
  <img src="docs/screenshots/settings-profile.png" width="80%" alt="Profile settings with theme switcher and auto-save indicator" />
</p>

Settings rebuilt around a left-rail sub-nav with shared `SettingsSection` / `SettingsRow` / `Toggle` primitives. Auto-saves with a bottom-right status pill (Saving → Saved → fade out). Password and other sensitive fields stay explicit-save.

---

## Quick start

The published image lives at **`ghcr.io/csummers-dev/filebrowser-pretty:latest`** and works on any Linux x86_64 host (NAS, mini-PC, VPS, your homelab).

### Run it with `docker run`

```bash
# Named volumes — Docker handles ownership, no host-side chown dance
docker run -d \
  --name filebrowser \
  --restart unless-stopped \
  -p 8080:80 \
  -v fb-data:/srv \
  -v fb-db:/database \
  -v fb-config:/config \
  ghcr.io/csummers-dev/filebrowser-pretty:latest

docker logs filebrowser | grep "password for"
# Copy the randomly-generated admin password — you'll need it for first login.
```

Open <http://localhost:8080>, log in as `admin` with the password from the logs, and change it immediately in **Settings → Profile**.

### Run it with Docker Compose

The recommended layout — mounts under `/srv/` so the filebrowser scope (default `/srv`) just works:

```yaml
services:
  filebrowser:
    image: ghcr.io/csummers-dev/filebrowser-pretty:latest
    container_name: filebrowser-pretty
    restart: unless-stopped
    user: "1000:1000"        # match the UID/GID that owns your storage dirs
    ports:
      - "8080:80"
    volumes:
      # Your real data — mount user-owned SUBDIRECTORIES,
      # not whole NAS volume roots (those are owned by root and you'll hit
      # 403s on uploads).
      - /path/to/your/movies:/srv/Movies
      - /path/to/your/music:/srv/Music
      - /path/to/your/downloads:/srv/Downloads
      # Filebrowser's own state — keep on a fast disk if you have one
      - ./filebrowser/database:/database
      - ./filebrowser/config:/config
    environment:
      TZ: America/Los_Angeles
    healthcheck:
      test: ["CMD", "/healthcheck.sh"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Behind a reverse proxy (Traefik shown here — adapt for Caddy / nginx / your stack):

```yaml
    networks: [web]
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.filebrowser-pretty.rule=Host(`files.yourdomain.com`)
      - traefik.http.routers.filebrowser-pretty.entrypoints=websecure
      - traefik.http.routers.filebrowser-pretty.tls.certresolver=letsencrypt
      - traefik.http.services.filebrowser-pretty.loadbalancer.server.port=80
```

Then:

```bash
docker compose up -d filebrowser
docker compose logs filebrowser | grep "password for"
```

### From source

You need **Go ≥ 1.25**, **Node ≥ 24**, and **pnpm ≥ 10**, plus Docker if you want to package the result.

```bash
git clone https://github.com/csummers-dev/filebrowser-pretty.git
cd filebrowser-pretty

# 1) Build the frontend (bundled into the Go binary)
cd frontend
pnpm install --frozen-lockfile
pnpm build                                 # produces frontend/dist/
cd ..

# 2) Cross-compile the Go binary for the platform you'll deploy on.
#    GOARCH=amd64 for Intel/AMD servers (most NASes, mini-PCs);
#    GOARCH=arm64 for Raspberry Pi 4/5 + Apple silicon native Docker.
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build \
  -ldflags "-X github.com/filebrowser/filebrowser/v2/version.Version=1.2.1" \
  -o filebrowser .

# 3) Sanity check (catches the #1 deployment trap)
file filebrowser
# Want: "ELF 64-bit LSB executable, x86-64, ... statically linked"

# 4) Build the Docker image — explicit --platform avoids Apple-silicon
#    surprises where docker silently picks the host arch.
docker build --platform linux/amd64 \
  -t ghcr.io/<your-namespace>/filebrowser-pretty:latest \
  .

# 5) (Optional) Verify the binary inside the image is the right arch
docker run --rm --entrypoint sh \
  ghcr.io/<your-namespace>/filebrowser-pretty:latest \
  -c "file /bin/filebrowser"

# 6) Push to your registry
docker push ghcr.io/<your-namespace>/filebrowser-pretty:latest
```

Or skip Docker entirely and run the binary directly: `./filebrowser` — opens on <http://localhost:8080>.

### Upgrading

```bash
docker compose pull filebrowser
docker compose up -d filebrowser
# Your /srv data + /database state persist across upgrades — users, shares,
# settings all survive.
```

### Common deployment gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| `exec format error` / garbled bytes in logs | Binary built for wrong arch (host instead of target) | Rebuild with explicit `GOOS=linux GOARCH=amd64` |
| `no matching manifest for linux/amd64` | Docker image built for the wrong platform | Add `--platform linux/amd64` to `docker build` |
| 403 on every upload | Host volume owned by root; container can't write | Mount user-owned **subdirectories**, not whole NAS volume roots; or set `user:` in compose to match owner |
| Reverse proxy serves 404 | Traefik can't find the router | Network label has to match the actual Docker network name — check `docker inspect <container> --format '{{.HostConfig.NetworkMode}}'` |
| First-login password scrolled off | Detached `docker run` ate the logs | `docker exec <container> filebrowser users update admin --password "newpass" --config /config/settings.json` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Vue 3 + TypeScript + Pinia                            │  │
│  │  • Composition API, <script setup>                     │  │
│  │  • Tailwind v4 design tokens                           │  │
│  │  • Composables for shortcuts, drag, focus, theme       │  │
│  │  • Format-specific viewers: pdfjs / videojs /          │  │
│  │    vue-reader (EPUB) / Ace / music-metadata / exifr    │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │ HTTP / WebSocket                │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Go backend (unchanged from upstream)                  │  │
│  │  • Gorilla mux router                                  │  │
│  │  • Storm/BoltDB for users + shares + settings          │  │
│  │  • afero filesystem abstraction                        │  │
│  │  • JWT auth (or proxy / noauth / hooks)                │  │
│  │  • Embedded frontend assets (one binary deploys)       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | **Go 1.25** | Single binary, fast, mature ecosystem |
| DB | **Storm/BoltDB** | Embedded — no separate database to operate |
| Frontend | **Vue 3 + TypeScript** | Reactive + typed; SFCs keep component CSS scoped |
| State | **Pinia** | Tiny, typed, composable |
| Styling | **Tailwind v4** | Token-driven, no global cascade fights |
| Build | **Vite + Rolldown** | Fast HMR, fast prod builds |
| Routing | **vue-router 5** | Standard |
| i18n | **vue-i18n** | 31 languages inherited from upstream |
| PDF | **pdfjs-dist 6** | Mozilla's reference renderer |
| Video | **video.js 8** | Themed skin, subtitle support |
| Audio | **music-metadata 11** | ID3v2 APIC artwork extraction (Range-fetched) |
| EPUB | **vue-reader + epub.js** | Iframe-based reader with our theme injection |
| Code | **Ace 1.44** | Same editor users already know |
| EXIF | **exifr 7** | Range requests so we don't download the full image |

---

## Project layout

```
.
├── auth/             # JWT, proxy, noauth, hooks
├── cmd/              # CLI entry points (root, users, version, etc.)
├── docker/           # Docker build helpers
├── files/            # File ops (move/copy/listing/search/share)
├── fileutils/        # Path + symlink helpers
├── frontend/         # Vue 3 app (built and embedded into the binary)
│   ├── public/       # Static assets shipped at /
│   └── src/
│       ├── components/    # SFCs, organized by feature area
│       ├── composables/   # Reusable reactive logic (shortcuts, drag, theme)
│       ├── stores/        # Pinia stores
│       ├── views/         # Route-level pages
│       ├── utils/         # Pure helpers (file icons, constants, upload)
│       └── css/           # Token + listing + dashboard CSS
├── http/             # HTTP handlers + routing
├── img/              # Server-side image processing (thumbnails)
├── rules/            # Per-user access rule engine
├── search/           # File search backend
├── settings/         # Site-wide settings store
├── share/            # Public share machinery
├── users/            # User model + permission gates
└── version/          # Version constant (overridable via ldflags)
```

---

## What I've done

This README marks **v1.2.1** — a keyboard + paper-cuts round on top of the v1.2.0 audio polish + bundle-split work.

### v1.2.1 — Keyboard, drag, paper cuts

- **Keyboard shortcuts I expected to already exist** — `Cmd+A` / `Ctrl+A` select all in the listing (with a proper input-focus guard so it doesn't hijack the search bar's native select-all), `r` to refresh the current folder, `j` / `k` for previous / next track inside the audio preview, `PageUp` / `PageDown` / `Home` / `End` for page navigation inside the PDF preview
- **Copy path action** — small button next to the Location label in the details sidebar. Copies the relative path to the clipboard, flashes "Copied" inline, and surfaces a toast. Falls back to `execCommand("copy")` on HTTP-only homelab deployments where the modern clipboard API isn't available
- **Searching… indicator in the command palette** — the palette no longer looks empty during the debounce + fetch window. A small accent-tinted spinner row appears as soon as the user types ≥ 2 characters and clears when the search resolves
- **Spring-load on breadcrumbs and section title** — extending the spring-loaded folders pattern from row drops to header navigation: hovering a breadcrumb segment during a drag for 2 s navigates to that folder; hovering the section title navigates to the parent folder. Drop still wins over the timer
- **Command palette no-results bug** — backend search results were being silently filtered out by a client-side fuzzy-score pass over the basename. Now the file group bypasses the fuzzy filter and trusts what the backend returned; static commands still go through scoring as before
- **Mobile multi-select pill styling** — the `#file-selection` row that shows up on narrow viewports had no CSS at all (legacy `.action` class with dead tokens). Now a proper toolbar — surface background, border-bottom, 36 px rounded tap targets, destructive-tinted Delete hover
- **Audio preview reliability** — fixed a temporal-dead-zone bug where `AudioViewer`'s `immediate: true` watch fired before its helper functions were initialized. Audio previews work again
- **Theme default is explicit System** — first-init writes `"system"` to localStorage immediately, instead of just falling back to it in memory. Visible in DevTools and consistent across tabs from the moment the user loads the app
- **Text-preview Edit button styling** — `.preview-toolbar-format__btn` was referenced in markup but never defined in CSS, so the button rendered with browser defaults next to the styled soft-wrap toggle. Defined the class to match its sibling chrome
- **Vue Router deprecation cleanup** — converted both navigation guards from the legacy `next(value)` callback to the return-value pattern. Removes a stream of deprecation warnings from every navigation

### v1.2.0 — Audio polish + lazy-loaded viewers

- **Album artwork on the audio info-rail** — embedded APIC artwork (extracted client-side via music-metadata) now renders as a square tile at the top of the Track section, matching the chrome of the AudioViewer card itself
- **Audio preview reliability fix** — temporal-dead-zone bug in `AudioViewer.vue` where an `immediate: true` watch fired before its helper functions were initialized; surfaced as paired "watcher callback" + "setup function" errors and broke audio previews entirely. Resolved by reordering the declarations
- **Lazy-loaded format viewers** — `PdfViewer` / `VideoViewer` / `AudioViewer` / `EpubViewer` / `TextViewer` / `CsvViewer` now load on demand via `defineAsyncComponent` instead of bundling into the main chunk. Pulled ~1.7 MB of viewer code (pdfjs-dist, video.js, ace-builds, epub.js, music-metadata) out of first-load. Image previews stay statically loaded — they're the most common path and the cheapest viewer
- **CI workflow hardening** — branch name fixed (`master` → `main`), upstream-only release + docs deploy jobs trimmed, `lint-pr.yaml` removed
- **Docs polish** — Docker section in the README replaced with the real cross-compile + buildx + GHCR flow I hammered out in actual deployment, including a gotchas table for the traps I hit (wrong-arch binaries, manifest mismatches, 403 on upload, etc.)

### v1.1.1 — Surface polish

- **Upload dock redesign** — the floating progress card got a ground-up restyle: design-system tokens, live aggregate bar at the bottom edge of the head, per-file rows, dark mode, mobile full-width layout, completion checkmark, reduced-motion respect
- **Inline rename for the current folder** — new "Rename folder" action in the section-title ⋯ menu; swaps the h1 for an input with the same Enter/Esc/blur UX as inline row rename
- **Avatar tinted accent** — the user-row gradient now matches the brand mark (lilac) instead of the legacy emerald
- **Removed dead UI** — stripped the no-op More (⋯) button from the preview header
- **Tightened deploy docs** — Docker section in the README now matches the actual cross-compile + buildx flow with the gotchas I hit during real deployment

### v1.1.0 — Drag, preview, polish

- **Spring-loaded folders** — hover-to-open on drag, 2 s with a clockwise progress ring
- **Breadcrumb drop targets** — drag-to-parent (or any ancestor) without leaving the folder
- **Rich preview metadata** — EXIF for photos, ID3 for audio (with APIC artwork), track info for video, full PDF.js chrome
- **EPUB dark mode that actually works** — `themes.override` with the priority flag so the book's own CSS doesn't win specificity
- **Cross-format arrow nav** — `←` / `→` reliably step between previewable files even from inside EPUB iframes and PDF.js viewers
- **Zip extract with delete-original** — server-side extraction, with an optional "remove the archive after success" toggle
- **Shared drag composable** (`useDropTarget`) — single source of truth for move-vs-copy, conflict resolution, and error toasts

### v1.0 — Full UI rewrite

Stage-by-stage, in order:

<details>
<summary><b>Stage 5–6:</b> Grid + Gallery views, multi-select pill, responsive sweep</summary>

Rebuilt against the static mockups in `mockup-*.html`. Three view modes share one selection model. The header gracefully degrades at every breakpoint.
</details>

<details>
<summary><b>Stage 7:</b> Command palette + search</summary>

Linear-style ⌘K with a registry-driven command list. Backend search lives in the same palette — debounced live results.
</details>

<details>
<summary><b>Stage 8:</b> Inline file operations</summary>

New folder, new file, rename, and delete all happen inline in the row. Delete is optimistic with an Undo toast so it never feels destructive.
</details>

<details>
<summary><b>Stage 9:</b> Slide-overs, settings rebuild, user admin</summary>

`SlideOver.vue` primitive replaces the old prompt soup. FolderPicker / MoveCopy / Share / Extract all share the chrome. Settings shell rebuilt with a left-rail sub-nav.
</details>

<details>
<summary><b>Stage 10:</b> Login + share-view rewrites</summary>

The public surfaces (login + share view) got the same design language as the authed app.
</details>

<details>
<summary><b>Stage 11:</b> A11y, dark mode, mobile, keyboard, polish</summary>

Eleven sub-stages: ARIA sweep, dark mode tokens + per-user persistence, mobile drawer + 44 px tap targets, global shortcut dispatcher, focus management. 
</details>

<details>
<summary><b>Stage 12 (Preview rebuild):</b> All seven format viewers</summary>

Each format has its own viewer component (Image · Video · Audio · PDF · EPUB · CSV · Text) with a shared `PreviewShell` + `PreviewInfoRail` chrome. Format-specific metadata surfaces in a `format-section` slot.
</details>

<details>
<summary><b>Stage 13:</b> Build pipeline, prettier sweep, dead code, Docker</summary>

End-of-cycle housekeeping: whole-codebase prettier pass, dead code audit, production build smoke test, Docker image build verified.
</details>

---

## Roadmap

The next release is **v1.3.0**, planned as a large feature drop. 

- `User.Preferences` JSON field, API round-trip, migration safety
- `usePreferences` frontend composable with debounced persistence
- `ContextMenu.vue` primitive — smart viewport positioning, keyboard nav, separators, destructive variant
- Event bus package with sync dispatch and panic-safe subscribers
- Audit log backbone — BoltDB bucket, event subscriber, query API (no UI yet)
- File ops + auth flows wired to publish events
- `/cache` package — filesystem-backed LRU with background eviction tick

### Tags + smart folders

- Tag schema + CRUD API (`/api/tags`, file ↔ tag association)
- `<TagChip>` primitive (colored, removable, focusable)
- Tag display on file rows and in the info pane
- Tag picker SlideOver with search + on-the-fly create
- Smart folders — saved tag queries surfaced as virtual entries in the sidebar
- Palette `tag:foo` syntax in command palette and header search
- 8-color tag palette tied to design-system accent variables

### Discovery and navigation

- Recently accessed (per-user log, surfaced in sidebar + palette `recents` group)
- Favorites / pinned folders (sidebar pin list, star toggle on rows)
- Per-folder view-mode memory (list / grid / gallery remembered per directory)
- Multi-column sort (primary + secondary criteria, persisted)
- Sort by extension
- Better breadcrumbs at depth — middle-ellipsis dropdown when path is long
- Breadcrumb hover dropdown — shows siblings of any path segment
- Quick-action row in command palette empty state — top 5 most-used commands

### Interaction model

- Right-click context menu on file rows (built on the Stage 1 primitive)
- Bulk rename SlideOver — pattern input with `{n}` / `{ext}` / `{####}` placeholders, find/replace, live preview
- Drag-select lasso in gallery + grid views
- Custom drag preview ghost showing file icon + count badge
- `Delete` shortcut prompts confirmation; `Shift+Delete` skips the prompt for power users

### Preview enhancements

- PDF text search (`Cmd+F`) using PDF.js's existing text-content API
- Markdown rendered preview with GFM extensions (toggle in TextViewer toolbar)
- Image film strip — thumbnail row of siblings below the image preview
- Image basic edit — canvas rotate + crop, backend save as a copy
- EPUB chapter list (TOC) in info-rail
- EPUB persistent position + bookmarks; CFI carried in the URL hash for deep links
- Subtitle upload UI in video preview info-rail
- Picture-in-picture toggle in video preview
- Hover preview tooltip for image rows (500 ms delay)

### Performance and scale

- Virtual scrolling for huge folders (list / grid / gallery; tested against 10k+ files)
- Server-side video thumbnails — ffmpeg frame extraction, cached in `/cache`, backgrounded queue
- Resumable uploads via TUS protocol (`tus-js-client` + `tusd` backend handler)
- Service worker — shell + last-viewed listing caching only; offline overlay for uncached routes
- Better error states — "Server unreachable" / "Permission denied" / "Not found" overlays replacing silent fetch failures

### Mobile polish

- Pull-to-refresh
- Camera roll upload (`accept="image/*,video/*" capture`)
- Swipe gestures in preview for previous/next file

### Admin and integrations

- Audit log UI — `Settings → Audit` page, filterable by user / action / date
- Webhooks — event bus subscriber posting to user-configured URLs on file change, with retry/backoff; Settings page to manage endpoints
- Session management UI — list active JWTs, revoke per-session
- Theme accent color picker — 6-preset chooser in Profile, tokenized so the cascade just works

### Beyond v1.3.0

- **ID3 tag editing** — edit title / artist / album / year / track number / artwork in place from the audio preview rail, write back to the file
- **Full-text content search** — index document text (PDFs, code, plaintext, EPUB) so the palette finds matches inside files, not just filenames
- **Pluggable preview types** — register a new format viewer via a config file
- **WebDAV polish** — works today, but the UX for mounting it could be friendlier
- **Multi-tenant scopes** — multiple roots per user with independent permissions
- **2FA / WebAuthn passkeys** — passwordless login at the front door
- **Per-folder + per-user storage analytics**

Issues + PRs welcome.

---

## Keyboard shortcuts

| Key | What it does |
| --- | --- |
| `?` | Show shortcuts overlay |
| `⌘K` / `/` | Open command palette |
| `g f` | Go to files |
| `g s` | Go to settings |
| `1` / `2` / `3` | Switch to List / Grid / Gallery view |
| `n` | New folder (inline) |
| `u` | Upload |
| `r` | Refresh current folder |
| `e` | Extract zip (when a `.zip` is selected) |
| `⌘A` / `Ctrl+A` | Select all (in listing, skipped while typing) |
| `←` / `→` | Previous / next file in preview |
| `Esc` | Close preview / dismiss prompts |
| `Space` | Play / pause (audio preview) |
| `j` / `k` | Previous / next track (audio preview) |
| `PageUp` / `PageDown` | Previous / next page (PDF preview) |
| `Home` / `End` | First / last page (PDF preview) |
| `f` | Toggle full-size image in preview |

The full list is always one `?` away.

---

## Development

```bash
# Frontend dev server with HMR
cd frontend
pnpm dev          # → http://localhost:5173 (proxied to backend)

# Backend with embedded frontend
go run .

# Typecheck + lint + production build (the full check)
cd frontend
pnpm typecheck
pnpm lint
pnpm build
```

---

## Credits

This project stands on the shoulders of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) by [@hacdias](https://github.com/hacdias) and the original maintainers. Their work is the reason this project could happen at all.

---

## License

Apache License 2.0, same as upstream. See [LICENSE](LICENSE).

---

<div align="center">

**Built with love.**

</div>
