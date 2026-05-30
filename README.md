<div align="center">

<img src="branding/logo.svg" width="120" alt="filebrowser pretty" />

# filebrowser pretty

### A self-hosted file browser that actually feels like 2026.

A complete front-end rewrite of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) — same trusted Go backend, dragged into a modern UI with a real design system, dark mode, a command palette, drag-and-drop everywhere, and rich previews for images, video, audio, PDF, EPUB, code, and more.

[![Version](https://img.shields.io/badge/version-1.1.0-5e6ad2?style=flat-square)](#)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

[Highlights](#-highlights) ·
[Screenshots](#-a-tour) ·
[Quick start](#-quick-start) ·
[Architecture](#-architecture) ·
[Roadmap](#-roadmap)

</div>

---

## ✨ Why this fork

The upstream `filebrowser/filebrowser` is rock-solid software — a single Go binary that drops onto any homelab and serves files over a web UI. It works, and it has worked for years. But the UI was showing its age, the design system was patchy, the dark mode was an afterthought, and the file-preview experience hadn't kept up with what we expect from a modern app.

**filebrowser pretty** keeps the dependable backend and rebuilds the entire frontend on top of it. Same data, same APIs, same operational story. Brand-new everything-you-see-and-touch.

This is a personal homelab tool first; the goal isn't to replace the upstream — it's to scratch a very specific itch: **what would filebrowser look like if it were designed today, for a single user who cares about typography, motion, and consistency?**

---

## 🌟 Highlights

> Each item below was a project unto itself. There are ~135 individually-tracked changes behind 1.1.0.

|  | Feature | What it actually does |
| --- | --- | --- |
| 🎨 | **Full design system** | Tailwind v4 tokens, a real type scale, accent + surface variables, scoped components — no more cascading-LESS spaghetti. |
| 🌗 | **First-class dark mode** | Light · Dark · System per-user, persisted via the backend. Every surface — including EPUB chapter text and PDF.js chrome — repaints live without a refresh. |
| 🔍 | **⌘K command palette** | Linear-style fuzzy command runner. Backend search is wired into the same palette so files and commands surface together. |
| 📂 | **Three view modes** | List · Grid · Gallery, all with the same selection model and keyboard shortcuts. Press `1` / `2` / `3` to swap. |
| 🖱️ | **Drag everywhere** | Move/copy by dragging onto folders, **breadcrumb segments** (jump to any ancestor without leaving the page), or **spring-loaded folders** (hover 2 s with a progress ring → folder opens so you can chain drops). Hold ⌘ to copy instead of move. |
| 🖼️ | **Rich previews** | Image (EXIF panel) · Video (video.js with track info) · Audio (custom transport + ID3 APIC album art) · PDF (PDF.js with thumbnail rail + page nav) · EPUB (vue-reader with proper dark theme) · CSV (parsed table) · Text/code (Ace editor). |
| ⌨️ | **Keyboard-first** | Press `?` for the shortcut cheat sheet. `g f` → files, `g s` → settings, arrows nav between files in preview, `Esc` closes everything. |
| 📱 | **Mobile drawer + touch targets** | Purpose-built `SidebarDrawer` for narrow viewports, 44 px tap targets across every interactive surface, swipe-friendly preview. |
| 🗂️ | **Inline file ops** | Create / rename / delete inline in the row — no modal interrupts. Delete uses optimistic UI with an Undo toast. |
| 🗜️ | **Zip extract** | Server-side ZIP extraction with a slide-over panel, an "open the destination after extract" toggle, and an optional "delete the original on success" toggle. |
| 🔗 | **Shares with depth** | Manage shares from a dedicated settings page; per-share password + expiry; public share view repainted to match the app's surface. |
| 🧭 | **Live file metadata** | EXIF for photos (camera / lens / focal length / exposure / ISO / date taken), ID3 for audio (title / artist / album / year / artwork), track info for video. All extracted client-side, gracefully degrading. |
| 🔐 | **Per-user everything** | View mode, theme, locale, Ace editor theme, dotfile visibility, date format, single-click — all per-user, persisted via the existing user store. |

---

## 📸 A tour

> _Screenshots live in `docs/screenshots/`. Drop your captures there with these filenames and they'll render here automatically._

### The file listing

<p align="center">
  <img src="docs/screenshots/listing-list.png" width="80%" alt="List view with file-icon system and inline meta" />
</p>

Single-line rows with a clean icon system, hover affordances for the actions menu, a multi-select pill that turns into bulk action buttons, and a sort-by header that locks in width so the layout doesn't jitter.

<p align="center">
  <img src="docs/screenshots/listing-grid.png" width="49%" alt="Grid view" />
  <img src="docs/screenshots/listing-gallery.png" width="49%" alt="Gallery view with image thumbnails" />
</p>

Swap views with `1` / `2` / `3` or the segmented control in the header. Gallery view uses lazy-loaded thumbnails so a directory of 2000 photos still scrolls smoothly.

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
  <br/><em>Audio — ID3 album art (Range-fetched so it doesn't starve playback), custom scrubber, ID3 tags surface in the rail</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-pdf.png" width="80%" alt="PDF preview with thumbnail rail" />
  <br/><em>PDF — PDF.js-rendered pages with a thumbnail rail; toolbar drives zoom and page-jump</em>
</p>

<p align="center">
  <img src="docs/screenshots/preview-epub.png" width="80%" alt="EPUB preview with dark mode applied to chapter text" />
  <br/><em>EPUB — vue-reader with our dark theme injected into the iframe via <code>themes.override</code> (the only API that reliably beats the book's own CSS)</em>
</p>

</details>

### Dark mode

<p align="center">
  <img src="docs/screenshots/dark-listing.png" width="49%" alt="Dark mode listing" />
  <img src="docs/screenshots/dark-preview.png" width="49%" alt="Dark mode preview" />
</p>

Not a CSS filter. Every component re-themed against the same token palette, with surface-by-surface fixes so contrast never falls below WCAG AA.

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

A dedicated `SidebarDrawer` for narrow viewports (not just a force-expanded desktop sidebar). 44 px tap targets across every control.

### Settings

<p align="center">
  <img src="docs/screenshots/settings-profile.png" width="80%" alt="Profile settings with theme switcher and auto-save indicator" />
</p>

Settings rebuilt around a left-rail sub-nav with shared `SettingsSection` / `SettingsRow` / `Toggle` primitives. Auto-saves with a bottom-right status pill (Saving → Saved → fade out). Password and other sensitive fields stay explicit-save.

---

## 🚀 Quick start

### Docker

```bash
docker run \
  -v /your/data:/srv \
  -v /your/config:/database \
  -p 8080:80 \
  ghcr.io/your-namespace/filebrowser-pretty:1.1.0
```

Then open <http://localhost:8080>. Default credentials are `admin` / `admin` — change them immediately in Settings → Users.

### Docker Compose

```yaml
services:
  filebrowser:
    image: ghcr.io/your-namespace/filebrowser-pretty:1.1.0
    container_name: filebrowser
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./data:/srv
      - ./config:/database
    environment:
      TZ: America/Los_Angeles
```

### From source

You need **Go ≥ 1.25**, **Node ≥ 24**, and **pnpm ≥ 10**.

```bash
git clone https://github.com/<you>/filebrowser-pretty.git
cd filebrowser-pretty

# Frontend
cd frontend
pnpm install
pnpm build      # production bundle → frontend/dist
cd ..

# Backend (embeds the built frontend)
go build -ldflags "-X github.com/filebrowser/filebrowser/v2/version.Version=1.1.0" -o filebrowser .

./filebrowser
```

Visit <http://localhost:8080>.

---

## 🛠️ Architecture

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

## 📂 Project layout

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
├── version/          # Version constant (overridable via ldflags)
└── mockup-*.html     # The static design mockups that anchored the rewrite
```

---

## 🎯 What we've done

This README marks **v1.1.0**, which closes out the design rewrite started in v1.0 and adds the drag/preview/extract polish pass.

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

Eleven sub-stages: ARIA sweep, dark mode tokens + per-user persistence, mobile drawer + 44 px tap targets, global shortcut dispatcher, focus management. The unglamorous work that makes everything else feel right.
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

## 🗺️ Roadmap

Things on the wishlist:

- [ ] **Image film strip** — keyboard-navigable lightbox-style strip below image previews
- [ ] **Tags / smart folders** — server-side tag store, palette-driven tag filtering
- [ ] **Pluggable preview types** — register a new format viewer via a config file
- [ ] **WebDAV polish** — works today, but the UX for mounting it could be friendlier
- [ ] **Multi-tenant scopes** — multiple roots per user with independent permissions
- [ ] **Server-side video thumbnails** — frame extraction so the gallery view shows real previews

Most of these are "scratch the itch when it appears" — there's no fixed schedule. Issues + PRs welcome.

---

## ⌨️ Keyboard shortcuts

| Key | What it does |
| --- | --- |
| `?` | Show shortcuts overlay |
| `⌘K` / `/` | Open command palette |
| `g f` | Go to files |
| `g s` | Go to settings |
| `1` / `2` / `3` | Switch to List / Grid / Gallery view |
| `n` | New folder (inline) |
| `u` | Upload |
| `←` / `→` | Previous / next file in preview |
| `Esc` | Close preview / dismiss prompts |
| `Space` | Play/pause (in audio preview) |
| `f` | Toggle full-size image in preview |

The full list is always one `?` away.

---

## 🧪 Development

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

### Conventions

- **SFCs everywhere.** `<script setup lang="ts">` is the default. Avoid Options API in new components.
- **Composables for shared logic.** Anything reactive that more than one component uses lives in `src/composables/`.
- **Scoped CSS, never global.** Global tokens live in `src/css/styles.css`; component CSS goes in the component's `<style scoped>` block.
- **Why-comments, not what-comments.** Code says what; comments say why. Especially around backend quirks, browser bugs, and CSS specificity workarounds.

---

## 🙏 Credits

This project stands entirely on the shoulders of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) by [@hacdias](https://github.com/hacdias) and the original maintainers. The backend, the binary, the auth story, the database — all of it is their work. This fork is just a UI.

The design language draws from Linear, Raycast, and Things 3 — three apps that taught us small interactions can carry a whole product.

---

## 📜 License

Apache License 2.0, same as upstream. See [LICENSE](LICENSE).

---

<div align="center">

**Built with care for a homelab of one.**

</div>
