<div align="center">

<img src="branding/banner.svg" width="900" alt="filebrowser pretty" />

# filebrowser pretty

[![Version](https://img.shields.io/badge/version-1.6.3-5e6ad2?style=flat-square)](#)
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
│  │    vue-reader (EPUB) / music-metadata / exifr          │  │
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
| Audio metadata (read) | **music-metadata 11** |
| Audio tags (read/write) | **id3v2 + go-flac** (MP3 / FLAC) |
| Archives | **mholt/archives** (zip / 7z / rar / tar) |
| EPUB | **vue-reader + epub.js** |
| Code / text edit | **native `<textarea>`** |
| Markdown | **marked + KaTeX** |
| EXIF | **exifr 7** |

---

### v1.6.3 — Preview & details panel refinements

- **Details panel now matches the sidebar** — the listing details rail was using a more opaque white fill, so it looked starkly whiter than the sidebar in light mode. It now uses the same frosted `--color-canvas` surface as the sidebar / header, so the app's background gradient glows through it consistently
- **Calmer details panels** — removed the divider lines between the action buttons, Properties, Tags and Location in both the listing details panel (desktop + mobile) and the preview details rail so they read as one continuous surface
- **Gallery hover seam fixed** — eliminated a faint 1px "red" line that could appear between a tile's thumbnail and its name on hover. Thumbnail tiles no longer carry a colored icon background, so a cover image that lands a sub-pixel short of an edge can't leak the vivid (pink / rose) bg as a seam — most visible with the details panel open
- **Folder header buttons** — the Share / Download / More cluster now sits at the top-right of the folder header instead of sinking to the middle
- **Colorful image Edit icon** — the Edit control's icon in the image preview toolbar is now accent-tinted to stand out from the neutral zoom / fit controls
- **Storage bar gradient** — dropped the blue stop that clashed with the green; it's now a clean teal→green gradient that still reads clearly in light mode

### v1.6.2 — Details panel & tile polish

- **Colorful preview tiles in the details panel** — a selected folder or any non-image file (archives, code, blobs…) now fills the whole details preview area with that file type's vivid color + a soft gradient and a matching icon, instead of a small icon on an empty card. Folders show the same gold gradient + white folder as the grid/gallery tile
- **Gallery folders match the grid exactly** — the gallery folder tile now uses the same amber token as the grid tile (the previous hand-picked hex read slightly off / less vibrant)
- **More previews in the details panel** — selecting a video or PDF now shows its thumbnail in the details panel (it previously only showed an icon, even though the listing had the thumbnail); audio falls back to album art, then the color tile
- **Images fill the preview frame** — a selected image now fills the details preview area instead of being letterboxed with gaps on the sides
- **Tidier file names** — long names in the details panel now wrap at natural separators (`.`, `-`, `_`, `/`) instead of splitting mid-word
- **Calmer details panel** — removed the divider under the "Details" header and matched the panel background to the sidebar so the two rails read as one surface; the collapse/expand control is now accent-colored
- **Visible list checkboxes** — an unchecked checkbox in list view now sits on a soft fill so it reads as a real control rather than blank white
- **Storage bar gradient in light mode** — the storage meter now shows its gradient in light mode too (the old two-tone stops were nearly flat there)
- **Wording** — the preview header's **Back** button now reads **Exit Preview**

### v1.6.1 — Audio-tag hardening & UI polish

- **Sturdier audio tag writes** — editing an MP3 comment now leaves technical frames (iTunes `iTunNORM`/`iTunSMPB`) intact instead of wiping them; a FLAC that stores its track as `5/12` keeps the total when you change just the number (no more lost "of 12"); a genre like `Folk/Rock` is treated as one genre, not two; and cover uploads are validated as real images, size-bounded, and no longer leave temp files behind. Save errors now read as friendly messages instead of leaking server paths
- **Gallery folders match grid** — folder tiles in gallery view now use the same compact card (amber media block + name footer) as grid view, instead of the full-bleed hero treatment meant for media files
- **View mode sticks to your account** — list / grid / gallery is now a single per-user preference that carries across folders, so navigating no longer resets your chosen layout
- **Clearer sort control** — a dedicated ascending/descending toggle replaces the old "click the active field again to flip it"; the direction persists per user across folders, and the sort menu now just picks the field
- **Details panel polish** — the folder Path is shown in full (it was being cut off), and the "current folder" icon matches the gold folder glyph used in the listing
- **Mobile settings** — your account + Sign Out are pinned to the bottom of the settings drawer, matching the main sidebar
- **More color** — the Download button above listings, the sidebar Storage and New File icons, and the ⌘K search hint are now accent-tinted instead of flat grey

### v1.6.0 — Audio tag editor

- **Edit ID3 / Vorbis tags in place** — right-click an **MP3** or **FLAC** (or open the Edit tags button on its preview details rail) to edit **title, artist, album, album artist, year, track / disc numbers, genre, composer, and comment**, plus **embedded cover art** — add, replace, or remove the artwork without leaving the browser. Writes happen atomically (temp file → rename) so a half-written tag can never corrupt the original
- **Batch-apply across a selection** — select several audio files and choose **Edit tags** from the selection bar or right-click menu to edit them together. The editor opens blank and applies **only the fields you actually change** to every file, so you can stamp a shared Album / Album artist / Year (or a single cover) across a whole album in one save while each track keeps its own title and track number
- **Honest, safe writes** — only the two formats we can losslessly round-trip (MP3, FLAC) are offered; the action requires the **modify** permission, and a partial batch failure is reported clearly (e.g. "Updated 9 of 10 files") rather than silently
- Built on pure-Go tag libraries — no `ffmpeg`/`cgo` dependency added

### v1.5.1 — Mobile follow-ups

- **Dropped the left-edge swipe-to-open** — that rightward edge swipe is reserved by iOS Safari / Android for back-navigation and can't be reliably overridden by a web page, so it fought the browser's "back." Open the drawer with the hamburger; swiping the open drawer left to close it (a leftward gesture) still works
- **Mobile settings sidebar** — the settings drawer now carries a **My Files** link at the top and your account + **Sign Out** at the bottom (on mobile it's the only sidebar there); the old bottom "Back to files" link moved up
- **Header always visible on mobile** — pinned the app to the visible viewport so the document can no longer scroll the sticky header off the top of the screen (where you'd get stuck below it with no way back); signing in lands you at the top with the header in view
- **Folder context-menu wording** — right-clicking a folder now reads **Move folder** / **Copy folder** instead of "Move file" / "Copy file"

### v1.5.0 — Mobile gestures, faster folders, and a grid redesign

- **Faster large folders** — a directory listing no longer opens and reads every file just to detect its type. The type is taken from the file extension whenever that's definitive (images, video, audio, PDFs, text…), and the few remaining header reads now run in parallel. A ~2,000-file folder on a NAS that took ~15 s now loads in a second or two. (Prefer extension-only typing? `--disable-type-detection-by-header` skips header reads entirely.)
- **Grid view redesign** — grid tiles are now proper "media cards": a full-width thumbnail (or a large tinted file icon) on top with a name + meta footer below, so images actually preview at a glance. On mobile the selection checkbox now sits on the thumbnail instead of nearly overlapping it
- **Mobile — swipe the sidebar** — swipe in from the left edge to open the navigation drawer, and swipe it left to close
- **Mobile drawer parity** — the drawer now has the **Recent** files section, and **Favorites / Recent are collapsible** (the collapsed state syncs with the desktop sidebar). Removed the redundant Settings link (it's reachable from your account row)
- **Mobile — tap a file to select** — a single tap on a file now selects it (and offers a **Details** toggle) instead of yanking you into a full-screen preview; folders still open on a tap, and a double-tap opens a file
- **Login lands at the top** — signing in no longer inherits the login screen's scroll position, so you arrive at the top of your files instead of part-way down the page
- **Password managers detect the login form** — the username / password fields now carry proper `name` attributes, so mobile and third-party managers (Bitwarden, 1Password, iOS Keychain) recognize and fill them
- **Breadcrumb path scrolls** — a long path scrolls horizontally instead of being clipped behind the search box on narrow / mobile windows; removed the hover-to-list-sibling-folders dropdown
- **Consistent branding** — the app is now uniformly **filebrowser pretty** (lowercase) everywhere it's printed, in every language, and the wordmark renders bold
- **Copy & i18n cleanup** — standardized settings wording (Sign In / Sign Up / Sign Out, sentence-case field labels, several grammar/typo fixes) and removed 76 dead / unreferenced translation keys

### v1.4.0 — Color, mobile, and naming polish

- **Preview icons are color-coded** — the action icons in the preview details rail (Share / Download / Rename / Move / Copy / Extract / Open / Delete) now use the same per-action hues as the file-listing details pane, consistently across every preview tool; the preview toolbar's **Download** (blue) and **Share** (teal) glyphs are tinted to match
- **Color in Settings** — each left-rail nav icon is now its own brand color, and every settings page (Profile, Shares, Sessions, Global, Users, Audit, Webhooks) opens with a matching tinted icon chip in its header
- **Mobile — tap to open** — a single tap now opens a folder/file on touch (selecting moved to the row checkbox); the details sheet no longer auto-opens and hijacks your next tap (it's opt-in via a **Details** button)
- **Mobile fixes** — removed the empty gap between the header and the file list when nothing is selected; the sidebar drawer's user / sign-out row no longer gets cut off on short screens; removed the redundant "Profile" entry from the drawer
- **Rename "My files"** — right-click the **My files** entry to set a custom label (syncs across devices); it shows in the sidebar and the listing header
- **Favorite display names in the header** — opening a folder you've given a favorite display name now shows it beside the real name, e.g. _Documents (Work)_; these custom names now appear on mobile too
- **Smaller folder tiles in gallery view** — folders render as a tighter grid so they read as quiet markers rather than dominating the page
- **Login & sidebar polish** — "Login" → **Sign In**, "Signup" → **Sign Up**, "Already have an account**?**", and the create-account prompt now reads "Click **here** to create an account"; the version number links to the source repo; the sign-out button is rose-tinted
- **Consistency cleanup** — added motion (`--dur` / `--ease`) and `--radius-xs` design tokens and adopted them across the styles; centralized the preview file-type tint colors into shared tokens so the toolbar and details rail can't drift apart
- **Release & tooling** — adopted SemVer with images published to GHCR: releases get `X.Y.Z` plus rolling `X.Y` / `X` / `latest`, and `main` builds publish `nightly` + dated snapshots. Images now carry OCI provenance labels, and the in-app version is stamped from the git tag at build time

### v1.3.2 — Preview, drag & drop, and notification fixes

- **PDF previews fixed for large documents** — pages now render lazily (only what's near the viewport, released as you scroll away) with a per-page resolution cap, so long or high-resolution PDFs no longer go blank partway through
- **Cover thumbnails made reliable** — fixed PDF / audio / EPUB cover generation (`pdftoppm` renders to a temp file instead of an unreliable stdout mode that failed on many files)
- **Multi-file zip download** — selecting several files and downloading them as a zip no longer returns a 401
- **Favorites drag fixed** — reordering pinned folders, and dragging a pin out of the section to remove it, work again (the row was a link that hijacked the drag)
- **Video preview** — the transcode wait now reads "Converting video for playback…" with a live elapsed timer instead of an open-ended spinner; Picture-in-Picture was removed
- **EPUB preview** — fixed chapter-list (TOC) overlap and added a dark-mode toggle that's independent of the app theme
- **Notifications** — every toast now appears bottom-center, newest stacked on top, with semantic colors (green = success, red = failure, amber = attention) and a separating border
- **Details panel** — the action buttons (Share / Download / Rename / Delete / …) are color-coded for faster scanning
- **Drag & drop** — the drop-target folder shows a clear accent ring + tint; the marquee/lasso no longer selects page text, and Ctrl-drag no longer opens a context menu
- **Folder header** — removed the misleading folder "size" (it showed the directory's own bytes, not the size of its contents)
- **Reliability** — keyboard shortcuts now unregister correctly when leaving a view, and the dispatcher is hardened so one bad handler can't disable every shortcut; creating a folder over a misconfigured mount returns a clear 409 instead of a 500; fixed a stray missing-import console warning
- **Tests & CI** — +37 frontend unit tests (113 total) covering sort, palette, favorites, recents, MRU, and keyboard logic; CI now runs lint + type-check + tests on every push

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
