// Shared archive helpers for the Extract feature.
//
// The backend (`http/extract.go`) extracts zip, 7z, rar (incl. RAR
// multi-volume), and the tar family via github.com/mholt/archives. These
// helpers gate the frontend Extract affordances to the same set and derive a
// sensible default folder name. Keep this list in lockstep with
// `detectArchive` on the backend.

// Single-file / first-volume archive suffixes we offer Extract for.
// NOTE: `.tar.gz` etc. are matched by full-suffix endsWith; lone `.gz`/`.bz2`
// (a single compressed file, not an archive) is deliberately excluded.
const EXTRACTABLE_SUFFIXES = [
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tar.xz",
  ".tar.zst",
];

// Longest-first so compound suffixes (.tar.gz) win over their tail (.gz is
// not in the list anyway, but .tar must be tried after .tar.gz).
const STRIP_SUFFIXES = [
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tar.zst",
  ".tgz",
  ".tar",
  ".zip",
  ".7z",
  ".rar",
];

const RAR_PART_RE = /\.part\d+\.rar$/i; // new-style multi-volume: name.part01.rar
const RAR_OLD_RE = /\.r\d+$/i; // old-style multi-volume: name.r00
const SPLIT_ZIP_RE = /\.z\d+$/i; // split zip: name.z01  (unsupported)
const MULTIVOL_7Z_RE = /\.7z\.\d+$/i; // multi-volume 7z: name.7z.001 (unsupported)

/**
 * True when `name` is an archive the backend can extract. Rejects the
 * split/multi-volume formats we explicitly don't support (`.z01`, `.7z.001`)
 * so no Extract affordance appears for them.
 */
export function isExtractable(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  // Explicit rejections first.
  if (SPLIT_ZIP_RE.test(lower) || MULTIVOL_7Z_RE.test(lower)) return false;
  // Supported single / first-volume formats.
  if (EXTRACTABLE_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  // Old-style RAR volume parts (.r00, .r01 …). New-style `.partNN.rar`
  // already ends in `.rar`, so it's covered above.
  if (RAR_OLD_RE.test(lower)) return true;
  return false;
}

/**
 * Default subfolder name for "extract into a new folder": strips the archive
 * suffix. Handles compound tar suffixes and RAR multi-volume parts.
 *
 *   photos.zip          → photos
 *   backup.tar.gz       → backup
 *   movie.part01.rar    → movie
 *   movie.r00           → movie
 *   noext               → noext (unchanged)
 */
// Comic-book archives (CBZ = zip, CBR = rar of images). These get the paged
// comic reader instead of the generic Extract affordance, so they're kept OUT
// of EXTRACTABLE_SUFFIXES above and gated separately here.
const COMIC_SUFFIXES = [".cbz", ".cbr"];

/** True when `name` is a comic-book archive the comic reader can open. */
export function isComic(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return COMIC_SUFFIXES.some((s) => lower.endsWith(s));
}

export function archiveBaseName(name: string): string {
  if (!name) return name;
  // RAR multi-volume parts strip the whole volume marker.
  let m = name.match(RAR_PART_RE);
  if (m && m.index !== undefined) return name.slice(0, m.index);
  m = name.match(RAR_OLD_RE);
  if (m && m.index !== undefined) return name.slice(0, m.index);
  const lower = name.toLowerCase();
  for (const suf of STRIP_SUFFIXES) {
    if (lower.endsWith(suf)) return name.slice(0, name.length - suf.length);
  }
  return name;
}
