<div align="center">

<img src="branding/logo.svg" width="120" alt="filebrowser pretty" />

# filebrowser pretty

[![Version](https://img.shields.io/badge/version-1.2.1-5e6ad2?style=flat-square)](#)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

</div>

---

<p align="center">
  <img src="docs/screenshots/listing-list.png" width="80%" alt="List view with file-icon system and inline meta" />
</p>

<p align="center">
  <img src="docs/screenshots/listing-grid.png" width="49%" alt="Grid view" />
  <img src="docs/screenshots/listing-gallery.png" width="49%" alt="Gallery view with image thumbnails" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-image.png" width="80%" alt="Image preview with EXIF info rail" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-video.png" width="80%" alt="Video preview with track info" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-audio.png" width="80%" alt="Audio preview with album art and custom transport" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-pdf.png" width="80%" alt="PDF preview with thumbnail rail" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-epub.png" width="80%" alt="EPUB preview with dark mode applied to chapter text" />
</p>

<table>
  <tr>
    <th align="center" width="50%">Light theme</th>
    <th align="center" width="50%">Dark theme</th>
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

<p align="center">
  <img src="docs/screenshots/command-palette.png" width="70%" alt="⌘K command palette with backend file search" />
</p>

<p align="center">
  <img src="docs/screenshots/mobile-drawer.png" width="32%" alt="Mobile sidebar drawer" />
  <img src="docs/screenshots/mobile-listing.png" width="32%" alt="Mobile file listing" />
  <img src="docs/screenshots/mobile-preview.png" width="32%" alt="Mobile preview" />
</p>

<p align="center">
  <img src="docs/screenshots/settings-profile.png" width="80%" alt="Profile settings with theme switcher and auto-save indicator" />
</p>

---

The published image lives at **`ghcr.io/csummers-dev/filebrowser-pretty:latest`** and works on any Linux x86_64 host (NAS, mini-PC, VPS, homelab).

### Docker Compose

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

Or skip Docker entirely and run the binary directly: `./filebrowser` — opens on <http://localhost:8080>.

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

| Layer | Choice |
| --- | --- |
| Backend | **Go 1.25** |
| DB | **Storm/BoltDB** |
| Frontend | **Vue 3 + TypeScript** |
| State | **Pinia** |
| Styling | **Tailwind v4** |
| Build | **Vite + Rolldown** |
| Routing | **vue-router 5** |
| i18n | **vue-i18n** |
| PDF | **pdfjs-dist 6** |
| Video | **video.js 8** |
| Audio | **music-metadata 11** |
| EPUB | **vue-reader + epub.js** |
| Code | **Ace 1.44** |
| EXIF | **exifr 7** |

---

### v1.2.1 — Keyboard + search + preview

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

### v1.2.0 — Audio + lazy-loaded viewers

- **Album artwork on the audio info-rail** — embedded APIC artwork (extracted client-side via music-metadata) now renders as a square tile at the top of the Track section, matching the chrome of the AudioViewer card itself
- **Audio preview reliability fix** — temporal-dead-zone bug in `AudioViewer.vue` where an `immediate: true` watch fired before its helper functions were initialized; surfaced as paired "watcher callback" + "setup function" errors and broke audio previews entirely. Resolved by reordering the declarations
- **Lazy-loaded format viewers** — `PdfViewer` / `VideoViewer` / `AudioViewer` / `EpubViewer` / `TextViewer` / `CsvViewer` now load on demand via `defineAsyncComponent` instead of bundling into the main chunk. Pulled ~1.7 MB of viewer code (pdfjs-dist, video.js, ace-builds, epub.js, music-metadata) out of first-load. Image previews stay statically loaded.
- **CI workflow hardening** — branch name fixed (`master` → `main`), upstream-only release + docs deploy jobs trimmed, `lint-pr.yaml` removed
- **Docs polish** — Docker section in the README replaced with the real cross-compile + buildx + GHCR flow

### v1.1.1 — Surface polish

- **Upload dock redesign** — the floating progress card got a ground-up restyle: design-system tokens, live aggregate bar at the bottom edge of the head, per-file rows, dark mode, mobile full-width layout, completion checkmark, reduced-motion respect
- **Inline rename for the current folder** — new "Rename folder" action in the section-title ⋯ menu; swaps the h1 for an input with the same Enter/Esc/blur UX as inline row rename
- **Avatar tinted accent** — the user-row gradient now matches the brand mark (lilac) instead of the legacy emerald
- **Removed dead UI** — stripped the no-op More (⋯) button from the preview header
- **Tightened deploy docs** — Docker section in the README now matches the actual cross-compile + buildx flow

### v1.1.0 — Drag, preview, polish

- **Spring-loaded folders** — hover-to-open on drag, 2 s with a clockwise progress ring
- **Breadcrumb drop targets** — drag-to-parent (or any ancestor) without leaving the folder
- **Rich preview metadata** — EXIF for photos, ID3 for audio (with APIC artwork), track info for video, full PDF.js chrome
- **EPUB dark mode that actually works** — `themes.override` with the priority flag so the book's own CSS doesn't win specificity
- **Cross-format arrow nav** — `←` / `→` reliably step between previewable files even from inside EPUB iframes and PDF.js viewers
- **Zip extract with delete-original** — server-side extraction, with an optional "remove the archive after success" toggle
- **Shared drag composable** (`useDropTarget`) — single source of truth for move-vs-copy, conflict resolution, and error toasts

### v1.0

- Grid + Gallery views, multi-select pill, responsive sweep
- Command palette + search
- Inline file operations
- Slide-overs, settings rebuild, user admin
- Login + share-view rewrites
- A11y, dark mode, mobile, keyboard, polish
- Preview rebuild: All seven format viewers
- Build pipeline, prettier sweep, dead code, Docker

---

The next release is **v1.3.0**. 

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

This project began as a fork of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) by [@hacdias](https://github.com/hacdias) and the original maintainers.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

---

<div align="center">

**Built with love.**

</div>
