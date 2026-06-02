<div align="center">

<img src="branding/banner.svg" width="900" alt="filebrowser pretty" />

# filebrowser pretty

[![Version](https://img.shields.io/badge/version-1.3.1-5e6ad2?style=flat-square)](#)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

</div>

<p align="center">
  <img src="docs/screenshots/listing-list.png" width="80%" alt="List view with file-icon system and inline meta" />
  <br/><em>List view with file-icon system and inline meta</em>
</p>

<p align="center">
  <img src="docs/screenshots/listing-grid.png" width="49%" alt="Grid view" />
  <img src="docs/screenshots/listing-gallery.png" width="49%" alt="Gallery view with image thumbnails" />
  <br/><em>Grid and gallery views with file-icon system and inline meta</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-image.png" width="80%" alt="Image preview with EXIF info" />
  <br/><em>Image preview with EXIF info</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-video.png" width="80%" alt="Video preview and playback with media info" />
  <br/><em>Video preview and playback with media info</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-audio.png" width="80%" alt="Audio preview and playback with album art and custom transport" />
  <br/><em>Audio preview and playback with album art and custom transport</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-pdf.png" width="80%" alt="PDF preview with thumbnail" />
  <br/><em>PDF preview with thumbnail</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-epub.png" width="80%" alt="EPUB preview" />
  <br/><em>EPUB preview</em>
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
  <img src="docs/screenshots/command-palette.png" width="70%" alt="⌘K command palette with file search" />
  <br/><em>⌘K command palette with file search</em>
</p>

<p align="center">
  <img src="docs/screenshots/mobile-drawer.png" width="32%" alt="Mobile sidebar drawer" />
  <img src="docs/screenshots/mobile-listing.png" width="32%" alt="Mobile file listing" />
  <img src="docs/screenshots/mobile-preview.png" width="32%" alt="Mobile preview" />
  <br/><em>Mobile-friendly design principles</em>
</p>

<p align="center">
  <img src="docs/screenshots/settings-profile.png" width="80%" alt="Global and per-user pofile settings" />
  <br/><em>Global and per-user pofile settings</em>
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
│  │  Go backend                                            │  │
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
| Uploads | **TUS (tus-js-client)** |
| Virtual list | **vue-virtual-scroller** |
| PDF | **pdfjs-dist 6** |
| Video | **video.js 8** + **ffmpeg** thumbnails |
| Audio | **music-metadata 11** |
| EPUB | **vue-reader + epub.js** |
| Code | **Ace 1.44** |
| Markdown | **marked + KaTeX** |
| EXIF | **exifr 7** |

---

### v1.3.1 — Cover thumbnails, favorites polish, and fixes

- **Cover-art thumbnails in the listing** — rows now show real artwork instead of a generic icon for three more formats: embedded **album art** for audio, **EPUB covers** (pulled from the book's OPF), and **PDF first pages**. They ride the same server-side thumbnail pipeline + disk cache as image and video thumbnails, generate once, and fall back to the colored icon when there's no cover. PDF rendering uses poppler's `pdftoppm` (bundled in the Docker image); absent → generic icon, like ffmpeg for video
- **Favorites — custom display titles** — give a pinned folder a friendlier sidebar name from its right-click menu, the section ⋯ menu, or the sidebar itself. Purely a display alias; the folder is never renamed
- **Favorites — pins survive a rename** — renaming a favorited folder (or any of its parents) now rewrites the pin so the link keeps working, instead of silently breaking
- **Favorites — dead-pin handling** — opening a favorite whose folder was renamed, moved, or deleted shows a tailored "Favorite unavailable" card with a one-click **Remove from Favorites**, instead of a bare 404
- **Sidebar right-click menus** — context menus on Favorites (open / set display title / remove) and Recent (open / copy path / remove from recent)
- **Colorful UI polish** — color-coded command-palette icons, a blue parent-folder nav arrow next to the FOLDER eyebrow, and a transparent list-view column header that blends into the background

### v1.3.0 — Tags, scale, and admin tooling

- **Tags & smart folders** — per-file color-coded tags with inline chips and a picker, plus saved-search "smart folders" over a compound `tag:` / `type:` / `name:` query syntax. Tags follow files through renames and moves
- **Right-click context menus** — on file rows and empty listing space, with keyboard navigation and type-ahead
- **Bulk rename** — pattern and find-and-replace modes in a slide-over, with live preview and conflict highlighting
- **Drag-select lasso** — rubber-band selection in grid and gallery; a drag ghost shows what's being moved; spring-loaded folders open on hover
- **Preview enhancements** — PDF text search with highlights; rendered Markdown (toggle to raw); an image film strip and basic editing (rotate / flip / crop, saved as a copy); EPUB chapter list and remembered reading position; subtitle upload and picture-in-picture for video; size-capped image hover-preview in the listing
- **Virtual scrolling** — the list view stays smooth in folders with tens of thousands of files
- **Server-side video thumbnails** — ffmpeg-generated poster frames, bundled in the Docker image, with a clean fall back to the generic icon when ffmpeg isn't present
- **Resumable uploads** — uploads survive a dropped connection and resume from where they left off; per-file cancel / remove in the dock; smarter retry handling
- **Offline app shell** — the interface loads without a connection, with an "offline" indicator and clear, named error states (server unreachable / permission denied / not found) with one-click retry
- **Mobile gestures** — pull-to-refresh, camera-roll / photo upload, and swipe between files (plus swipe-down to close) in the preview
- **Audit log** — admin page recording file operations, shares, sign-ins, and settings changes, filterable by action / user / date / path
- **Webhooks** — POST a JSON payload to configured endpoints on file events, with per-endpoint event filters, a test button, last-delivery status, and retry with backoff
- **Session management** — "sign out everywhere" revokes every other session at once
- **Accent color** — six-preset picker that recolors the whole interface, synced per user
- **Power-user navigation** — recents and favorites in the sidebar, per-folder view-mode memory, multi-column sort (including by extension), breadcrumb depth-ellipsis with a sibling-folder dropdown, and command-palette recents

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

## Credits

This project began as a fork of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) by [@hacdias](https://github.com/hacdias) and the original maintainers.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

---

<div align="center">

**Built with love by csummers-dev.**

</div>
