# UI inventory (Phase 6, Step 0)

Where the interface stands before the "Soft native" refresh, and the guardrails that keep the refresh honest. Numbers are from `next` at the start of Phase 6.

## Size

| | |
|---|---|
| Vue components | 90 (22 top-level, 38 files/, 13 prompts/, 10 settings/, 2 header/) plus 11 views |
| Style blocks | 94 |
| CSS files | 19 in `src/css`, about 5,200 lines; tokens live in `tokens.css` (Tailwind 4 `@theme`) |
| Raw style literals | hex 1,505 · rgb/hsl 461 · px radius 385 · box-shadow 145, across 102 files |
| Bundle (gzip) | initial load 339 KiB · all JS 1,382 KiB · CSS 108 KiB · fonts 399 KiB |

The literal counts are larger than the earlier quick count (1,192 hex) because the check also counts `var(--x, #fallback)` fallbacks, `style=""` attributes and plain `.css` files.

## Worst files for raw literals

These are where the token migration (Step 2) starts.

| File | Total | hex | rgb/hsl | radius | shadow |
|---|---|---|---|---|---|
| css/listing.css | 97 | 27 | 38 | 11 | 21 |
| views/Share.vue | 79 | 47 | 13 | 15 | 4 |
| views/files/Preview.vue | 77 | 47 | 14 | 13 | 3 |
| views/files/FileListing.vue | 69 | 35 | 14 | 13 | 7 |
| css/styles.css | 59 | 36 | 14 | 3 | 6 |
| views/Login.vue | 58 | 29 | 14 | 9 | 6 |
| files/BulkRenamePanel.vue | 56 | 39 | 7 | 8 | 2 |
| prompts/ResolveConflict.vue | 55 | 41 | 6 | 7 | 1 |
| files/ImageEditor.vue | 54 | 33 | 9 | 8 | 4 |
| SidebarDrawer.vue | 52 | 36 | 2 | 12 | 2 |
| css/dark-icon-colors.css | 51 | 33 | 18 | | |
| prompts/UploadFiles.vue | 47 | 24 | 13 | 8 | 2 |
| files/AudioViewer.vue | 46 | 20 | 10 | 14 | 2 |
| files/SharePanel.vue | 45 | 34 | 3 | 6 | 2 |
| views/Storage.vue | 44 | 36 | | 7 | 1 |

The full per-file list is `frontend/scripts/style-token-baseline.json`.

## Theming in place

- Accent colour: 7 presets (default iris), `useAccentColor`.
- Theme: light, dark or system (`useThemePreference`, `html.dark`), stored per user in the browser.
- Background gradient preference.
- Admin branding: colour, theme and `custom.css`.
- Kind tints: `--tint-*` tokens for file types.
- RTL rules exist; strings are English only.

## Screens

| Area | Screens |
|---|---|
| Shell | sidebar (SidebarDrawer), header, details rail (InfoPane), transfer dock, command palette |
| Files | list (default), mosaic, mosaic gallery; context menus; saved-search head; empty states |
| Viewers | image, video, audio, PDF, EPUB, comic, CSV, markdown, editor, image editor |
| Prompts | upload, conflict, bulk rename, share panel, save search, move/copy |
| Pages | login, share (public), trash, storage, duplicates, two-factor setup, errors |
| Settings | profile, shares, sessions, global, users, user, audit, webhooks |

## States to check

Every screen and overlay with the states it must be checked in. "Shot" marks states the screenshot suite already covers (`e2e/visual/screens.spec.ts`); later steps add shots as they restyle each screen and tick the "Done" column.

### Pages

| Screen | States | Shot | Done |
|---|---|---|---|
| Login | password, code step, SSO button, error, throttled | password | |
| Shell | sidebar expanded and collapsed, phone drawer, back/forward | collapsed, drawer | Step 3 |
| Files | List, Icons, Gallery | List, Icons, Gallery | Step 4 |
| Files | empty folder, loading, error, 403, broken favorite | empty, error | Step 4 |
| Files | split view, saved search, drag over, selection | split view, saved search, selection | Step 4 |
| Details panel | one item, several, the folder, over the list (768–1099 px), phone sheet | one, several, over the list, sheet | Step 4 |
| Files | inline rename, new folder | | |
| Preview | image, video, audio, PDF, EPUB, comic, CSV, text, editor | | |
| Trash | empty, with items | empty | |
| Storage | treemap, largest files, loading | treemap | |
| Duplicates | idle, scanning, results, none found | | |
| Recent | list, empty (if Decision 1) | list | Step 3 |
| Settings | Profile, Shares, Sessions, Global, Users, User, Audit, Webhooks | Profile, Global | |
| Two-factor set-up | required by admin policy | yes | |
| Public share | folder, file, password, limited, gone | | |
| Drop-box page | upload, done, closed | | |
| Errors | 404, 403, 500, offline | | |

### Overlays

| Overlay | Shot | Done |
|---|---|---|
| Command palette | | |
| Search dropdown | | |
| Context menus (row, background) | row | |
| Toasts, undo toast | | |
| Prompts: Delete, Replace, Resolve conflict, Upload, Info, Download, Current password, Discard changes, Share delete, Delete user | | |
| Panels: Share, Move/Copy, Extract, Bulk rename, Tag picker, Audio tags, Folder picker, Save search, Favorite title, Root label | | |
| Transfer dock | | |
| Mini player | | |
| Slideshow | | |
| Photo map | | |
| Quick peek | | |
| Shortcuts overlay | | |
| Offline banner | | |

## Known issues to fix in Phase 6

- Storage treemap and photo map labels overlap at small block sizes.
- `EmptyState` takes `message` in some callers and `hint` in others, so some hints never show.
- axe on the files page (serious or critical): `aria-allowed-attr`, `color-contrast`, `image-alt`, `nested-interactive`.
- A frozen `Date.now()` stops the row context menu from opening (found while building the screenshot harness; harmless for users, but it shows click handling depends on elapsed time).

## Guardrails added in Step 0

| Check | Command | Where it runs |
|---|---|---|
| Raw style literals may only go down | `pnpm run check:tokens` (`--update` to lock in a drop) | CI lint-frontend |
| Bundle stays within 2% of budget | `pnpm run check:bundle` after a build (`--update` with a reason) | CI bundle job |
| Screenshot baselines | `pnpm run e2e:visual` in the Playwright image, `scripts/visual-docker.sh` | CI visual job, once baselines exist |
| Accessibility | `expectAccessible(page)` from `e2e/support/a11y.ts` | wired into suites in Step 3 |

Screenshots of every baseline state before the refresh are in `docs/ui-before/` (light and dark; desktop 1440×900, laptop 1280×720, phone 390×844). They were taken outside the Playwright image, so they are a record, not baselines.
