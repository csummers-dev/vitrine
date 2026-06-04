# Changelog

All notable changes to **filebrowser pretty**.

## v2.1.3 — Audio volume bar fill

- **The audio player's volume slider now fills lilac** — the track read as a flat grey bar with only the drag handle accented, out of step with the lilac scrubber and the rest of the player. The portion up to the handle now fills with the accent (lilac), matching the playback scrubber, across Chrome/Safari and Firefox

## v2.1.2 — Drag-drop into-folder precision

- **Dropping a file "into" a folder now requires the exact spot that highlights — on mouse *and* touch** — a file dropped anywhere over a folder's name could land *inside* that folder even when the row never highlighted, because the drop re-measured the target zone and the glyph-width measurement is unreliable during the drop event (it fell back to the full name column). The drop now reuses the same state that drives the highlight + spring-load countdown, so a folder only receives the drop where it actually lit up; releasing anywhere else drops alongside, into the current folder. Desktop and touch drag now share one drop-zone definition, so the tightening behaves identically across phone, tablet, and desktop

## v2.1.1 — Sidebar & move/paste fixes

- **Search bar no longer shoves the header around** — opening the search used to expand it inside the toolbar row, squeezing the folder title and meta into a tiny column. It now floats as a compact, centered overlay above the header while it's the active element instead of displacing anything; closing it restores the row untouched
- **Sidebar no longer overflows the page** — with enough pinned Favorites (or Recents), the sidebar used to grow past the bottom of the window, pushing the storage meter and the account/logout row off-screen. The header and the main folder link now stay fixed at the top, the storage card and the user/logout row stay fixed at the bottom, and only the Favorites + Recents lists scroll when they run long
- **Cmd+V paste now shows progress and refreshes** — pasting a cut/copied file ran silently through a different code path than the move/copy tool: no progress indicator, and the listing didn't refresh so the pasted file wasn't visible. Paste now uses the same background transfer as the move tool and drag-and-drop, so the floating transfer dock shows progress and the listing refreshes the moment the job finishes
- **Conflict dialog "Skip all" gives feedback** — when a move/copy/paste hit a name conflict and you chose **Skip all conflicting files**, the dialog just closed with no indication of what happened. It now shows a toast ("All conflicting items were skipped — nothing was moved/copied.") so it's clear the action completed with nothing to do — in both the paste flow and the move/copy tool

## v2.1.0 — Listing, drag & preview polish

- **Listing no longer hides behind the breadcrumb bar** — the bottom breadcrumb strip was sitting under an oversized scroll area, so the last rows/tiles could disappear behind it. The listing now fills its scroll section as a proper flex child (the section gained the missing `min-height: 0` so its overflow actually scrolls), leaving just the intended slim gap above the bar. The virtualized list view also shed a stray 1rem bottom padding that was lifting its scroll viewport off the breadcrumb, so list rows now run all the way down to the bar
- **Drag-highlight works from any direction** — hovering a file over a folder now lights it up fully no matter which side you approach from. Previously the full highlight only "took" when you came in from the right; from any other direction it fell back to the dimmed state. The un-dim is now re-asserted on every drag-over frame so the document-wide drag dim can't win on a timing race
- **Countdown ring stands out** — the spring-load "open this folder" countdown ring is now **vivid blue** instead of white, so it no longer blends into the white folder glyph on the amber tile
- **Text preview controls moved to the details panel** — the Rendered/Raw, Soft-wrap, and Edit controls left the floating bottom pill and now live as colorful, full-width buttons in the details rail, keeping the reading area clear
- **Exit button** — slightly smaller (the arrow sits closer to "Exit"), and in the text preview the reading card now drops below it so the two never overlap
- **Album art for `.opus`** — the audio player now shows cover art for Opus files. The client-side metadata reader (`music-metadata`) throws on Opus's embedded picture and aborts, so the player falls back to the server-extracted cover (which the backend reads reliably for every audio format)
- **Album art is a 10px squircle** — the square cover in the audio player gets softly rounded corners so it doesn't read as a flat slab (still square)
- **Kobo `.kepub.epub` books render** — Kobo kepub chapters showed blank pages. The cause: Kobo injects a self-closing `<script src="kobo.js"/>` into every chapter's `<head>`, and since epub.js parses spine documents (whose filenames end in `.html`) as HTML — where a self-closing `<script/>` isn't valid — the parser swallowed the rest of the chapter as unterminated script text, leaving an empty page. The reader now closes self-closing raw-text tags in spine documents before parsing (scoped to content documents, never the package/OPF XML), so kepub files page through normally like any other epub. This also fixes a kepub that's simply been renamed to `.epub`
- **Comic & PDF chrome auto-hides** — in comic and PDF previews the Exit and details buttons now fade out together with the controls pill after a spell of inactivity (and return on movement), for a cleaner full-screen read. Other previews keep them always visible
- **Conflict dialog "Decide" button** — recoloured from amber (which darkened to an unpleasant brown on the light surface) to a positive-action **green**, tuned per theme for AA contrast (a deepened green with a white label on light; the bright green token with a near-black label on dark), with its icon matching the label. Fixed a hover bug where the button washed out to an unreadable near-white on the light theme (the generic button-hover rule was overriding the accent fill; the accent hover now declares its own green)

## v2.0.0 — The "pretty" milestone

filebrowser pretty 2.0 is a top-to-bottom reimagining of upstream File Browser: a redesigned interface, in-browser viewers for every common format, real keyboard-driven navigation, tags, an audio-tag editor, admin tooling, and a deep performance pass. This single entry consolidates everything that defines the 2.0 product.

### Breaking / upgrade notes

- **English-only.** The legacy multi-language system — inaccurate translations carried over from upstream and incompatible with the reworked UI — was removed: all non-English locale bundles, the in-app language picker, the RTL machinery, and the per-user `Locale` field (model, settings, `--locale` flag, auth payloads) are gone. **Existing databases keep working** — a stored locale is simply ignored and dropped on next save.
- Otherwise drop-in: **no schema migration is required**, and existing users, shares, tags, and settings are preserved.

### Interface & design

- **A cohesive, modern shell** — rebuilt **List**, **Grid** (media cards with a thumbnail + name/meta footer), and **Gallery** views; a redesigned sidebar with Recent / Favorites / Tags + a storage meter; slide-over panels for move / copy / share; and a settings area with a full-height left rail where each page carries its own tinted icon + title + description. Full **light & dark themes**, with a six-preset **accent color** picker synced per user.
- **Header-less, unified layout** — the top toolbars are gone. The listing runs edge-to-edge into a slim floating control cluster (search · view · sort · direction · upload · More), with the directory breadcrumb in a quiet bar pinned to the bottom. Search is a compact "⌘K" pill that expands into a real input on focus. Sidebar → primary → details rails read as one continuous frosted surface.
- **Color, used deliberately** — file-type icons, per-action buttons (share / download / rename / move / copy / extract / delete), settings nav chips, the command palette, and the storage gradient are all color-coded for fast scanning, consistent across both themes.
- **Brand** — uniformly **filebrowser pretty** (lowercase) with a lilac (`#5e6ad2`) accent applied to the theme-color, favicon, and PWA manifest (an admin `branding.color` override still wins). Rename the storage root ("My files") to a custom label that syncs across devices, and give favorited folders friendly display names.

### File previews

- **Seven format viewers** — **image** (zoom / fit, basic rotate · flip · crop saved as a copy), **video** (themed video.js skin, subtitle upload, on-the-fly transcode with a live progress label), **audio**, **PDF** (full PDF.js chrome with a thumbnail rail and lazy, resolution-capped page rendering so huge documents stay sharp), **EPUB** (chapter list, remembered reading position, an independent dark-reading toggle), **CSV**, and **code / text**. Markdown renders, with a toggle back to raw.
- **Comic reader** — open a `.cbz` / `.cbr` and page through it (edge taps, chevrons, keyboard, fullscreen, right-to-left for manga); pages stream and pre-cache, and it resumes on the page you left off.
- **Floating preview shell** — previews are a docked region beside the sidebar (not a take-over modal): **Exit** floats top-left, a single **details** toggle floats top-right, and per-format controls (zoom / page / fit) sit in a bottom-center pill that auto-hides on inactivity like a media player. Arrow keys step between files; swipe does the same on touch (swipe-down closes a fit image).
- **Rich metadata + cover art** — EXIF for photos, ID3 / Vorbis for audio (with embedded album art shown full + square), and track info for video. The details-rail file icon matches the listing row exactly, and listing rows show real cover thumbnails for **audio** (album art), **EPUB**, **PDF** (first page), and **`.cbr`** (first page) — extracted server-side and disk-cached.

### Browsing & navigation

- **Finder-style keyboard navigation** — arrows / Home / End / Enter to move and open, Shift to range-select, and **type-ahead** to jump to a name as you type (a space extends a multi-word prefix). Plus `Cmd/Ctrl+A` select-all, `/` to refresh, PDF page keys, and audio prev/next-track keys. A shortcuts cheat-sheet overlay lists them.
- **Command palette + search** — a ⌘K palette with recents and quick actions, and a fast backend-backed file search with live, debounced results.
- **Power-user sidebar** — Recent and Favorites (drag-reorder, custom display names, graceful dead-pin handling), per-folder view-mode memory, multi-column sort (including by extension) with a persistent ascending/descending toggle, breadcrumb depth-ellipsis, and right-click context menus on rows and empty space.
- **Tags** — per-file, color-coded tags shown as inline dots on each row (alphabetical, expanding on hover) with a picker; tags follow files through renames and moves.

### File operations

- Inline **new folder / file**, inline **rename**, and **delete** with an optimistic **Undo** toast.
- **Move / copy** run in the background via a floating transfer indicator, with an optional "open destination" toggle; **bulk rename** offers pattern and find-and-replace modes with live preview and conflict highlighting.
- **Drag & drop** — spring-loaded folders open on hover (with a countdown ring), breadcrumb segments are drop targets (drag to any ancestor), a drag ghost shows what's moving, and grid / gallery support marquee selection. The drop-into-folder zone hugs the icon + name so dropping *alongside* into the current folder is easy.
- **Archive extraction** — extract `.zip` / `.7z` / `.rar` server-side, including **password-protected** archives (detect-and-prompt — the password travels in a request header, never the URL or audit log, and a wrong password leaves no half-extracted files behind), with an optional "delete the archive after success" toggle and a destination picker.
- **Uploads** — a redesigned upload dock with per-file rows, an aggregate progress bar, per-file cancel, and **resumable** transfers that survive a dropped connection; each row names its destination folder.

### Audio tag editing

- Edit **title, artist, album, album artist, year, track / disc, genre, composer, and comment**, plus embedded **cover art** (add / replace / remove), for **MP3, FLAC, M4A** (MP4 / AAC / ALAC), and the **Ogg** family (Vorbis / Opus) — single-file or **batch** (the editor applies only the fields you actually change across a selection). Writes are atomic (temp file → rename); the newer formats use TagLib compiled to WebAssembly via the pure-Go `wazero` runtime (no cgo). Requires the **modify** permission.

### Admin & operations

- **Audit log** recording file operations, shares, sign-ins, and settings changes, filterable by action / user / date / path.
- **Webhooks** that POST a JSON payload on file events, with per-endpoint event filters, a test button, last-delivery status, and retry-with-backoff.
- **Session management** with "sign out everywhere."

### Performance & platform

- **Faster large folders** — file type is taken from the extension whenever that's definitive, and the few remaining header reads run in parallel; a ~2,000-file NAS folder drops from ~15 s to a second or two (`--disable-type-detection-by-header` skips header reads entirely).
- **Virtual scrolling** keeps folders with tens of thousands of files smooth; **format viewers lazy-load** (~1.7 MB of pdfjs / video.js / ace / epub.js / music-metadata pulled out of first load); and an **offline app shell** loads without a connection, with named error states (server unreachable / permission denied / not found) and one-click retry.
- Server-side **video thumbnails** (ffmpeg) and the audio / EPUB / PDF / CBR cover pipeline are bundled in the Docker image and fall back to colored icons when a tool isn't present. Robust cover extraction — including a lenient ID3 fallback for MP3s whose malformed tag frames defeat the strict parser.

### Mobile

- Pull-to-refresh, camera-roll / photo upload, swipe between files (and swipe-down to close) in previews, a navigation drawer (Recent + collapsible Favorites), tap-to-select with an opt-in **Details** sheet, and a pinned header so the app chrome can't scroll off-screen. Login fields carry proper `name` attributes so password managers (Bitwarden / 1Password / iOS Keychain) detect and fill them.

### Build & internals

- **SemVer** releases published to GHCR (`X.Y.Z` plus rolling `X.Y` / `X` / `latest`, and `nightly` + dated snapshots from `main`), with the in-app version stamped from the git tag and OCI provenance labels.
- A design-token system (color / motion / radius); pure-Go media libraries (no cgo) so the static cross-platform builds are unaffected; and lint + type-check + unit tests on every push. Third-party licenses are tracked in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
