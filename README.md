<div align="center">

<img src="branding/banner.svg" width="900" alt="filebrowser pretty" />

# filebrowser pretty

[![Version](https://img.shields.io/badge/version-2.1.1-5e6ad2?style=flat-square)](#)
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
| Audio tags (read/write) | **id3v2 + go-flac** (MP3 / FLAC) · **TagLib**/Wasm (M4A / OGG) |
| Archives | **mholt/archives** (zip / 7z / rar / tar) |
| EPUB | **vue-reader + epub.js** |
| Code / text edit | **native `<textarea>`** |
| Markdown | **marked + KaTeX** |
| EXIF | **exifr 7** |

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
