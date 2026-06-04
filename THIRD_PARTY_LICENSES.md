# Third-Party Licenses

**filebrowser pretty** is licensed under the Apache License 2.0 (see
[LICENSE](LICENSE)). The distributed binary statically embeds the third-party
components below; their licenses and obligations are reproduced or referenced
here.

## TagLib (audio metadata) — LGPL-2.1

The audio-tag editor reads and writes **M4A** and **Ogg** (Vorbis / Opus)
metadata using [TagLib](https://taglib.org/), compiled to WebAssembly and
invoked through the pure-Go
[`go.senan.xyz/taglib`](https://github.com/sentriz/go-taglib) wrapper.

- **TagLib** is licensed under the **GNU Lesser General Public License,
  version 2.1** (it is additionally available under the Mozilla Public
  License 1.1).
- **go.senan.xyz/taglib** is licensed under the **GNU Lesser General Public
  License, version 2.1**.

The full text of the LGPL-2.1 is included at
[`licenses/LGPL-2.1.txt`](licenses/LGPL-2.1.txt).

TagLib is used here as an unmodified library. The exact version of every
dependency is pinned in [`go.mod`](go.mod) / [`go.sum`](go.sum), so the
corresponding source of TagLib and its wrapper is publicly available, and the
binary can be rebuilt (re-linked) against a modified version of TagLib by
editing the dependency and running `go build` — satisfying the LGPL's relinking
provision.

## wazero (WebAssembly runtime) — Apache-2.0

The TagLib WebAssembly module runs on [wazero](https://wazero.io/)
(`github.com/tetratelabs/wazero`), licensed under the Apache License 2.0.

## yeka/zip (encrypted-ZIP extraction) — MIT

Extraction of **password-protected ZIP** archives (ZipCrypto and WinZip-AES) uses
[`github.com/yeka/zip`](https://github.com/yeka/zip), a fork of the Go standard
library's `archive/zip`. It is licensed under the **MIT License** (Copyright ©
2015 Alex Mullins), which the distributed binary carries by reproducing the
notice here. 7z and RAR password support is provided natively by
`github.com/mholt/archives` (and `github.com/bodgit/sevenzip`), both permissively
licensed.

## Other dependencies

All remaining Go and JavaScript dependencies are distributed under permissive
licenses (Apache-2.0, MIT, BSD, ISC). See [`go.mod`](go.mod) and
[`frontend/package.json`](frontend/package.json) for the authoritative,
version-pinned list.
