<div align="center">

<img src="branding/banner.svg" width="900" alt="vitrine" />

# vitrine

Self-hosted file management.

</div>

- **Live updates** — Files added by a downloader, an SMB copy or another user appear on their own, in every open tab, in search and in folder sizes.
- **List, Icons + Gallery** — Dense lists, large tiles, or photo-first browsing; a details panel shows a preview, metadata, tags and actions.
- **Storage** — A treemap of what uses your disk, the largest files, and free space per drive.
- **Duplicate finder** — Find files with identical content, pick which copies to keep, and send the rest to the Trash.
- **Smart folders** — Save a search (`type:video size:>4GB`, `added:7d`, …) and it stays in the sidebar, updating as files change.
- **Split pane view** — Navigate multiple folders at once.
- **Image + EXIF** — Pixel-perfect previews with EXIF details.
- **Slideshow + photo map** — Full-screen slideshows of a folder; see where your photos were taken on a map.
- **Image** editor — Crop, rotate, and flip.
- **Image formats** — Thumbnails for WebP, HEIC and AVIF (HEIC/AVIF previews are converted for the browser).
- **Video** — Streams with tracks and subtitles. Picks up where you left off; watched videos are marked.
- **Continue shelf** — Books, comics and videos you started, one click from the sidebar, on every device.
- **Folder covers** — Folder tiles show a poster/folder/cover image or a music folder's album art.
- **Audio** — Album art, embedded tags and artwork.
- **Play queue** — Play a folder or album, shuffle and repeat; a mini-player keeps going while you browse, with media-key support.
- **ID3 tag editor** — Edit ID3 tag metadata, one track or a whole album at once.
- **PDF** — Page through PDFs with thumbnail previews and sharp rendering.
- **EPUB** — Read EPUBs with a live chapter list and location remembered.
- **Comic** reader — Read CBZ and CBR, optionally read manga right-to-left.
- **Text** — Read and edit text files.
- **Markdown** — Markdown, rendered or raw.
- **Command palette** — ⌘K (Ctrl+K) to open command palette, navigate files, folders, and actions.
- **Search-as-you-type** — Results the moment you start typing.
- **Breadcrumb navigation** — Move between folders without backtracking.
- **Context menu** — Context-aware right-click options throughout.
- **Favorites + Recent** — Pin favorites with a colour, rename them, and reopen recent files from their own page.
- **Drag & drop** — Drag to move. Folders spring open, quick access to parent directory.
- **Multi-select + lasso** — Select in bulk, click through or lasso a whole region.
- **Move/Copy + transfer dock** — Moves and copies run in the background.
- **Bulk rename** — Rename multiple files at once with a live preview.
- **Conflict resolution** — File and folder conflicts handled. Keep, replace, or skip.
- **Tagging** — Tag anything in color. Persistent across moves.
- **Trash** — Deleted files can be restored; old items are purged after a set number of days.
- **Extract** — Extract ZIP, 7z, and RAR files in-app.
- **Password-protected archive** — Support for extracting password-protected archives.
- **Upload dock** — Displays per-file progress, and resumes if the connection drops.
- **Themes** — Hand-crafted light and dark themes.
- **User Management** — Manage users and permissions.
- **Settings** — Global and per-user settings.
- **Audit log** — Actions taken in-app recorded to an audit log available to administrators.
- **Webhooks** — Fire a signed webhook on any file event, or have Jellyfin rescan its library when media changes.
- **Sessions** — View active sessions and sign out everywhere.
- **Two-factor sign-in** — Codes from any authenticator app, with recovery codes.
- **Single sign-on** — Sign in through Authelia, Authentik, Keycloak or any OpenID Connect provider.
- **Shares** — Share a link in seconds, see how often it's opened and downloaded, make it one-time, or turn a folder into a file request that anyone with the link can upload to.
- **Mobile** — Mobile design prioritized.
- **Mobile upload / pull-to-refresh** — Upload from your camera roll; pull to refresh.

[![Version](https://img.shields.io/badge/version-4.0.0-6e72d9?style=flat-square)](#)
[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

</div>

## Screenshots

<p align="center">
  <img src="docs/screenshots/hero.png" width="100%" alt="vitrine — gallery view" />
</p>

<p align="center">
  <img src="docs/screenshots/listing-list-light.png" width="49%" alt="List view (light)" />
  <img src="docs/screenshots/listing-list-dark.png" width="49%" alt="List view (dark)" />
</p>

<p align="center">
  <img src="docs/screenshots/listing-grid-light.png" width="49%" alt="Grid view (light)" />
  <img src="docs/screenshots/listing-grid-dark.png" width="49%" alt="Grid view (dark)" />
</p>

<p align="center">
  <img src="docs/screenshots/listing-gallery-light.png" width="49%" alt="Gallery view (light)" />
  <img src="docs/screenshots/listing-gallery-dark.png" width="49%" alt="Gallery view (dark)" />
</p>

<p align="center">
  <img src="docs/screenshots/split-view.png" width="80%" alt="Split (dual-pane) view" />
</p>

<p align="center">
  <img src="docs/screenshots/command-palette.png" width="80%" alt="Command palette (⌘K)" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-image.png" width="80%" alt="Image preview with EXIF" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-video.png" width="80%" alt="Video preview" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-audio.png" width="80%" alt="Audio preview with album art" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-pdf.png" width="80%" alt="PDF preview" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-epub.png" width="80%" alt="EPUB reader" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-comic.png" width="80%" alt="Comic (CBZ / CBR) reader" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-text.png" width="80%" alt="Text preview" />
</p>

<p align="center">
  <img src="docs/screenshots/preview-markdown.png" width="80%" alt="Markdown preview" />
</p>

<p align="center">
  <img src="docs/screenshots/edit-image.png" width="80%" alt="Image editor" />
</p>

<p align="center">
  <img src="docs/screenshots/edit-markdown.png" width="80%" alt="Markdown editor" />
</p>

<p align="center">
  <img src="docs/screenshots/edit-tags.png" width="80%" alt="Audio tag editor" />
</p>

<p align="center">
  <img src="docs/screenshots/mobile-list-view.png" width="32%" alt="Mobile list view" />
  <img src="docs/screenshots/mobile-grid-view.png" width="32%" alt="Mobile grid view" />
  <img src="docs/screenshots/mobile-gallery-view.png" width="32%" alt="Mobile gallery view" />
</p>

<p align="center">
  <img src="docs/screenshots/user-settings.png" width="80%" alt="Profile settings" />
</p>

<p align="center">
  <img src="docs/screenshots/global-settings.png" width="80%" alt="Global settings" />
</p>

<p align="center">
  <img src="docs/screenshots/login.png" width="80%" alt="Login" />
</p>

---

The published image lives at **`ghcr.io/csummers-dev/vitrine:latest`** and is multi-arch — it runs on any Linux **amd64** or **arm64** host (NAS, mini-PC, Raspberry Pi, VPS, homelab).

### Docker Compose

```yaml
services:
  vitrine:
    image: ghcr.io/csummers-dev/vitrine:latest
    container_name: vitrine
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      # Your real data — mount user-owned SUBDIRECTORIES,
      # not whole NAS volume roots (those are owned by root and you'll hit
      # 403s on uploads).
      - /path/to/your/movies:/srv/Movies
      - /path/to/your/music:/srv/Music
      - /path/to/your/downloads:/srv/Downloads
      # vitrine's own state — keep on a fast disk if you have one
      - ./vitrine/database:/database
      - ./vitrine/config:/config
    environment:
      # The host user that owns your mounted data — run `id -u` / `id -g`.
      PUID: 1000
      PGID: 1000
      TZ: America/Los_Angeles
    healthcheck:
      test: ["CMD", "/healthcheck.sh"]
      interval: 30s
      timeout: 5s
      retries: 3
```

#### Upgrading from 3.x

Pull the 4.0 image and start it as usual. On the first start vitrine copies the database to `/database/vitrine.db.pre-4.0.bak`, then upgrades it in place and logs each step; if a step fails, startup stops and the message names the backup. To go back to 3.x, stop the container, put the backup back as `vitrine.db` and start the 3.x image. Don't run 3.x against a database 4.0 has used: it would treat upload-only links as ordinary shares.

Back up `vitrine-2fa.key` with the database (two-factor secrets); `vitrine-hashes.db` is only the duplicate finder's cache.

#### Permissions

On startup the container reads `PUID`/`PGID`, fixes the ownership of its own data to match, then **drops to that unprivileged user** to run the app — so vitrine never runs as root, and you never have to `chown` your media or juggle a `user:` line. Just point it at whoever owns your files:

```yaml
    environment:
      PUID: 1000   # host user ID that owns your mounted data  (run `id -u`)
      PGID: 1000   # its group ID                              (run `id -g`)
```

- The app's own `/config` + `/database` are re-owned to `PUID:PGID` automatically on every start, so the database is always writable — even if Docker first created those folders as `root`.
- Your media under `/srv` is **not** touched: mount folders already owned by `PUID` (use user-owned **subdirectories**, not root-owned NAS volume roots, or uploads 403).
- **Need strictly non-root** (no root at all, e.g. a hardened host)? Set `user: "<uid>:<gid>"` on the service instead — the container detects it, skips the root/ownership step, and runs only as that user (you manage folder ownership yourself).

Behind a reverse proxy (Traefik shown here — adapt for Caddy / nginx / your stack):

```yaml
    networks: [web]
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.vitrine.rule=Host(`files.yourdomain.com`)
      - traefik.http.routers.vitrine.entrypoints=websecure
      - traefik.http.routers.vitrine.tls.certresolver=letsencrypt
      - traefik.http.services.vitrine.loadbalancer.server.port=80
```

Then:

```bash
docker compose up -d vitrine
docker compose logs vitrine | grep "password for"
```

Or skip Docker entirely and run the binary directly: `./vitrine` — opens on <http://localhost:8080>.

#### Files changed outside vitrine

vitrine watches the folders it serves, so files added, renamed or removed by anything else — a downloader, an SMB copy, the host shell — show up in open browser tabs, in search and in folder sizes within a second or two, without a refresh.

- **Linux file-watch limit.** Watching uses inotify, which needs one watch per folder. Very large libraries can exceed the host's limit (`fs.inotify.max_user_watches`, often 8,192 or 65,536). vitrine then logs a warning and falls back to checking folders every minute. Raise the limit on the host for instant updates: `sudo sysctl fs.inotify.max_user_watches=524288` (add it to `/etc/sysctl.conf` to keep it).
- **Network mounts.** inotify can't see changes other machines make on NFS or SMB mounts. Set `--fileWatching=poll` (env `VITRINE_FILE_WATCHING=poll`) to check folders every minute instead, or `off` to disable watching.
- **Status.** Settings → Global → *File watching* shows whether changes arrive instantly or every minute, and the command to raise the limit if it was reached.
- **Disk cache.** If `--cacheDir` is inside a served folder, vitrine doesn't watch it, so thumbnails being written don't count as changes.
- **Reverse proxies.** Live updates use a long-lived server-sent-events connection at `/api/events/stream`. vitrine disables proxy buffering with `X-Accel-Buffering: no`; if your proxy still holds responses, turn buffering off for that path.

Search answers from an in-memory index that updates as changes are reported. As a backstop, an index older than 10 minutes is rebuilt in the background on the next search. Tune this with `--searchIndexMaxAge` (env `VITRINE_SEARCH_INDEX_MAX_AGE`, e.g. `5m`; `0` turns it off). The **Rebuild search index** action in the command palette (⌘K) forces an immediate refresh.

#### Media extras

- **Folder covers.** In grid and gallery views a folder shows the first of `poster`, `folder`, `cover` or `fanart` (`.jpg`, `.jpeg`, `.png`, `.webp`, any case) inside it; a music folder without one shows its first track's embedded album art. Turn it off under Settings → Profile → Folder cover art.
- **HEIC, HEIF and AVIF.** Thumbnails and previews are converted to JPEG with ffmpeg (bundled in the Docker image) or, outside Docker, `heif-convert` from libheif. Without either, these files keep the generic image icon. WebP thumbnails need nothing extra.
- **Music.** A folder that's mostly audio gets an album header with Play, Shuffle and Add to queue. Right-click a track to play the folder from there, or a folder to play it. The mini-player (bottom left) has shuffle, repeat and the queue, and responds to your keyboard's media keys.
- **Slideshow.** Right-click empty space in a folder → *Slideshow*, or a photo → *Slideshow from here*. ←/→ step, Space pauses, F goes full screen, Esc leaves.
- **Photo map.** Right-click empty space → *Photo map* to see the folder's photos where they were taken (from their EXIF GPS position). Map tiles are fetched and cached by the vitrine server, so browsers only ever talk to vitrine. The map is off until an admin picks a tile source with `--mapTiles` (env `VITRINE_MAP_TILES`): `osm` for OpenStreetMap's public tiles, or a `{z}/{x}/{y}` URL of your own tile server. It's off by default because the tiles requested reveal roughly where your photos were taken to whoever serves them, and OpenStreetMap's servers are donation-run (see their tile usage policy).
- **Resume and watched.** Videos of five minutes or more resume where you stopped (with a *Start over* button); reaching 98% marks a video watched. Right-click videos to mark them watched or unwatched. Positions, like book and comic positions, are saved to your account and follow renames and moves.

#### Storage, duplicates and smart folders

- **Storage** (sidebar) maps the open folder as a treemap coloured by file type, with the largest files beside it and the drive's free space above. Click a folder to go into it; right-click a block to open it, show it in the listing or move it to the Trash. The ranked list is the keyboard and screen-reader equivalent of the map.
- **Duplicates** compares files by content, not name: only files of the same size are read, and their hashes are cached (in `vitrine-hashes.db`), so a second scan is quick. Choose a folder, a smallest size and folders to skip; then keep the newest, the oldest or the copies in a chosen folder with one click. Nothing is selected for you, and deleting goes to the Trash.
- **Smart folders.** Search, then *Save this search* to keep it in the sidebar. Searches understand `type:` (image, video, audio, pdf, text, archive), `ext:`, `size:>4GB` / `size:<1MB`, `added:7d` and plain words. A smart folder opens as an ordinary listing and stays current as files change.

#### Extracting archives

Right-click a zip, 7z, rar (including split `.partN.rar` sets) or tar archive (`.tar`, `.tar.gz`, `.tar.bz2`, `.tar.xz`, `.tar.zst`) → *Extract*. Archives of any size extract as long as they fit on the disk; a 50 GB disk image in a rar is fine. vitrine protects the server in three ways:

- **Free space.** Before writing anything it adds up what the archive says it contains (zip, 7z, rar and plain tar list this up front) and refuses if it wouldn't fit while keeping a margin free: "Not enough space: needs 48.2 GB, 31.0 GB free". Compressed tars can't say up front, so each file is checked before it's written, and free space is re-checked as extraction goes.
- **Compression ratio.** An archive (and each zip entry) may unpack to at most 100 times its size on disk, so a "zip bomb" is stopped however it's packed, while ordinary archives, which rarely pass 10:1, and near-1:1 disk images pass. Small files are exempt up to 100 MB, so a compressed text file or an empty disk image still extracts.
- **Honest headers.** An entry that writes more than its header claimed, or an archive that writes more than its headers add up to, is stopped.

If extraction stops part-way, everything it created is removed. Files it replaces (when you choose to overwrite) are only swapped out once the new copy is complete, so an existing file is never lost. Paths that point outside the destination are refused, and links and device files are skipped.

| Setting | Flag / environment | Default |
|---|---|---|
| Ratio limit (0 turns it off) | `--extractMaxRatio` / `VITRINE_EXTRACT_MAX_RATIO` | `100` |
| Space kept free on the disk | `--extractFreeSpaceMargin` / `VITRINE_EXTRACT_FREE_SPACE_MARGIN` | 1 GiB (`1073741824`) |
| Largest single extracted file | `--maxUncompressedFileSize` / `VITRINE_MAX_UNCOMPRESSED_FILE_SIZE` | none (`0`) |
| Most entries in one archive | `maxZipFileEntries` (config file) | `100000` |

`maxTotalUncompressedSize` and `maxZipFileSize` in the config file still set optional caps on an archive's unpacked and packed size; both are off by default.

#### Two-factor sign-in

Each user can turn on two-factor sign-in under Settings → Profile: scan the QR code with an authenticator app (1Password, Aegis, Google Authenticator…), confirm a code, and save the ten recovery codes, each of which works once. Signing in then asks for a code after the password; failed codes count toward the same lockout as wrong passwords. An admin can reset a user's second factor from the user's page in Settings → Users.

Admins can make it mandatory for themselves under Settings → Global → *Require two-factor sign-in for admins* (or `vitrine config set --requireAdminTwoFactor`). An admin without a second factor can still sign in and use their files, but is asked to set one up and admin pages stay locked until they do. You can only turn the requirement on once your own account has two-factor sign-in.

**If an admin is locked out** (lost phone and recovery codes, or a lost key file), stop vitrine and run `vitrine users reset-2fa <username>`; they can then sign in with the password and set it up again. `vitrine config set --requireAdminTwoFactor=false` turns the requirement off from the command line.

It applies to password sign-in; with proxy or hook authentication, use your identity provider's own second factor. The secrets are encrypted with a key stored beside the database as `<database name>-2fa.key` (for example `vitrine-2fa.key`). **Back it up with the database**: without it, users with two-factor sign-in can't log in until an admin resets them.

#### Single sign-on (OpenID Connect)

vitrine can sign people in through an OpenID Connect provider such as Authelia, Authentik or Keycloak. Register a client with the provider, using the redirect URI `https://<your vitrine address>/api/auth/oidc/callback` and the scopes `openid profile email` (plus `groups` to sync admins), then configure vitrine with the server stopped:

```sh
vitrine config set --auth.method=oidc \
  --oidc.issuer=https://auth.example.com \
  --oidc.clientId=vitrine --oidc.clientSecret='<secret>' \
  --oidc.name=Authelia --oidc.adminGroup=admins
```

- The login page shows *Sign in with Authelia*. The username comes from the `preferred_username` claim (`--oidc.usernameClaim` to change it).
- New users get an account with the default permissions on first sign-in; `--oidc.autoCreate=false` admits only existing usernames.
- With `--oidc.adminGroup`, members of that group (from the `groups` claim, `--oidc.groupsClaim`) are admins, and lose admin on their next sign-in after leaving it.
- Password sign-in stays available beside SSO so you can't lock yourself out; turn it off with `--oidc.passwordLogin=false` once SSO works.
- Behind a proxy that changes the host or scheme, set `--oidc.redirectURL` to the exact callback URL registered with the provider.

Sessions from SSO are ordinary vitrine sessions: they show under Settings → Sessions and end with *Sign out everywhere*.

#### Shares and webhooks

- **Share usage.** Each link shows its views, downloads and when it was last opened, updating live. A download limit (one-time, 5, 10 or 25) ends the link once it's used up; the visitor then sees "This link is no longer available". On limited links every download counts, previews included, so the public page doesn't preview them.
- **File requests (upload-only links).** Share a folder as *Upload only* and anyone with the link can send you files without seeing what's already there. Optional limits: largest file, total size, allowed file types, and a subfolder per sender (named after what they type). Files never overwrite each other — a clash gets a " (2)" suffix — and are written with your permissions and rules. Each IP can send up to 300 files an hour and each link takes 3 uploads at a time; wrong passwords are throttled like logins. File requests are off until an admin turns them on in Settings → Global, since they let anyone with a link write to your server; turning them off again stops existing links accepting files. Uploads don't resume after a dropped connection.
- **Signed webhooks.** In Settings → Webhooks, edit an endpoint and choose *Generate* under *Signing secret*. Each delivery then carries `X-Vitrine-Signature: t=<unix time>,v1=<hex>`, where `v1` is HMAC-SHA256 with the secret over `<t>.<raw body>`. Check it in constant time and reject old timestamps:

  ```python
  import hashlib, hmac, time

  def verify(secret: str, header: str, body: bytes, tolerance=300) -> bool:
      parts = dict(p.split("=", 1) for p in header.split(","))
      if abs(time.time() - int(parts["t"])) > tolerance:
          return False
      mac = hmac.new(secret.encode(), f"{parts['t']}.".encode() + body, hashlib.sha256)
      return hmac.compare_digest(mac.hexdigest(), parts["v1"])
  ```

  Endpoints without a secret are sent unsigned, as before. Retries of one delivery carry the same signature.
- **Jellyfin.** Add an endpoint of type *Jellyfin library refresh* with your server's URL and an API key (Jellyfin → Dashboard → API Keys). When files change in its folders (all folders if you list none), vitrine asks Jellyfin for a library scan a minute later; changes during that minute share one scan.
- **Local addresses.** Webhooks refuse private and loopback addresses unless *Allow addresses on the local network* is on (it is by default for Jellyfin). Link-local and cloud-metadata addresses are always refused.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Vue 3 + TypeScript + Pinia                              │  │
│  │  • Composition API, <script setup>                       │  │
│  │  • Tailwind v4 design tokens                             │  │
│  │  • Composables for shortcuts, drag, focus, theme         │  │
│  │  • Format viewers: pdfjs / videojs / vue-reader (EPUB) / │  │
│  │    comic (CBZ·CBR) / marked (Markdown) /                 │  │
│  │    music-metadata / exifr                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                │ HTTP · server-sent events (live updates)      │
│                               ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Go backend                                              │  │
│  │  • Gorilla mux router                                    │  │
│  │  • Storm v3 / bbolt — users · shares · settings ·        │  │
│  │    tags · audit · webhooks · sessions · trash · hashes   │  │
│  │  • fsnotify file watcher → events bus → search index,    │  │
│  │    folder sizes, open tabs, webhooks                     │  │
│  │  • afero filesystem abstraction                          │  │
│  │  • JWT auth (or proxy / noauth / hooks)                  │  │
│  │  • Embedded frontend assets (one binary deploys)         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Tech stack

| Layer | Choice |
| --- | --- |
| Backend | **Go 1.26** |
| DB | **Storm v3 / bbolt** |
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
| Audio tags (read/write) | **id3v2 + go-flac** (MP3 / FLAC) · **TagLib**/Wasm (M4A / OGG) |
| Archives | **mholt/archives** (zip / 7z / rar / tar) · **yeka/zip** (password-protected ZIP) |
| EPUB | **vue-reader + epub.js** |
| Code / text edit | **native `<textarea>`** |
| Markdown | **marked + KaTeX** |
| EXIF | **exifr 7** |
| File watching | **fsnotify** (inotify), polling fallback |
| Maps | **Leaflet** (tiles proxied and cached by the server) |
| Sign-in | **TOTP** two-factor · **OpenID Connect** with PKCE (built in) |
| Fonts | **Figtree** + **JetBrains Mono** (self-hosted) |

---

## Credits

This project began as a fork of [filebrowser/filebrowser](https://github.com/filebrowser/filebrowser) by [@hacdias](https://github.com/hacdias) and the original maintainers.

---

## License

Apache License 2.0. See [LICENSE](LICENSE). Third-party components bundled in the binary — notably **TagLib** (LGPL-2.1), used for M4A / OGG tag editing — are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

---

<div align="center">

**Built with love by csummers-dev.**

</div>
