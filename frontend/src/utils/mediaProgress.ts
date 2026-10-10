/**
 * Shared helpers for the per-file progress maps kept in user preferences
 * (4.0 Phase 3.3): `epub.positions`, `comic.positions` and
 * `video.positions`, each a `Record<path, { at, … }>`.
 *
 * - continueItems: the "Continue" shelf — started, unfinished items across
 *   the three maps, most recent first.
 * - rekeyProgress / forgetProgress: keep the maps pointing at the right
 *   files after a rename, move or delete (a folder carries its subtree).
 */

export const PROGRESS_KEYS = {
  epub: "epub.positions",
  comic: "comic.positions",
  video: "video.positions",
} as const;

export type ProgressKind = keyof typeof PROGRESS_KEYS;

/** Minimal prefs surface (usePreferences satisfies it; tests stub it). */
export interface PrefsLike {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): unknown;
}

interface AnyEntry {
  at: number;
  // epub
  cfi?: string | number;
  pct?: number;
  // comic
  page?: number;
  total?: number;
  // video
  t?: number;
  dur?: number;
  watched?: boolean;
}

export interface ContinueItem {
  path: string;
  name: string;
  kind: ProgressKind;
  at: number;
  /** 0..1 when known, else null (an epub opened before 4.0). */
  fraction: number | null;
}

/** At or past this, an item counts as finished and leaves the shelf. */
export const SHELF_FINISHED = 0.98;

function fractionOf(kind: ProgressKind, e: AnyEntry): number | null {
  switch (kind) {
    case "epub":
      return typeof e.pct === "number" ? e.pct : null;
    case "comic":
      // Pages are 0-based: being on the last page means finished.
      return e.total && e.total > 0 && typeof e.page === "number"
        ? Math.min(1, (e.page + 1) / e.total)
        : null;
    case "video":
      if (e.watched) return 1;
      return e.dur && e.dur > 0 && typeof e.t === "number"
        ? Math.min(1, e.t / e.dur)
        : null;
  }
}

/** Whether an entry has been started (worth resuming) at all. */
function started(kind: ProgressKind, e: AnyEntry): boolean {
  switch (kind) {
    case "epub":
      return e.cfi !== 0 && e.cfi !== "" && e.cfi !== undefined;
    case "comic":
      return (e.page ?? 0) > 0;
    case "video":
      return (e.t ?? 0) > 0;
  }
}

const baseName = (p: string) => p.replace(/\/+$/, "").split("/").pop() ?? p;

/** Started, unfinished items across all maps, newest first. */
export function continueItems(prefs: PrefsLike, limit = 8): ContinueItem[] {
  const out: ContinueItem[] = [];
  for (const kind of Object.keys(PROGRESS_KEYS) as ProgressKind[]) {
    const map = prefs.get<Record<string, AnyEntry>>(PROGRESS_KEYS[kind], {});
    for (const [path, e] of Object.entries(map)) {
      if (!e || !started(kind, e)) continue;
      const fraction = fractionOf(kind, e);
      if (fraction !== null && fraction >= SHELF_FINISHED) continue;
      out.push({ path, name: baseName(path), kind, at: e.at ?? 0, fraction });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, limit);
}

/** Does `p` equal `base` or sit under it (as a folder)? */
function within(p: string, base: string): boolean {
  if (p === base) return true;
  const dir = base.endsWith("/") ? base : `${base}/`;
  return p.startsWith(dir);
}

function rewrite(
  prefs: PrefsLike,
  fn: (path: string) => string | null | undefined
): void {
  for (const key of Object.values(PROGRESS_KEYS)) {
    const map = prefs.get<Record<string, AnyEntry>>(key, {});
    let changed = false;
    const next: Record<string, AnyEntry> = {};
    for (const [p, e] of Object.entries(map)) {
      const r = fn(p);
      if (r === undefined) {
        next[p] = e;
        continue;
      }
      changed = true;
      if (r !== null) next[r] = e;
    }
    if (changed) prefs.set(key, next);
  }
}

/** A file or folder moved from `from` to `to`: carry its progress along. */
export function rekeyProgress(prefs: PrefsLike, from: string, to: string) {
  from = from.replace(/\/+$/, "");
  to = to.replace(/\/+$/, "");
  if (!from || from === to) return;
  rewrite(prefs, (p) =>
    within(p, from) ? to + p.slice(from.length) : undefined
  );
}

/** A file or folder was deleted: drop its progress (and its subtree's). */
export function forgetProgress(prefs: PrefsLike, path: string) {
  path = path.replace(/\/+$/, "");
  if (!path) return;
  rewrite(prefs, (p) => (within(p, path) ? null : undefined));
}

/** Rough share of an EPUB read, from the spine position epub.js reports on
 *  relocate: (chapter index + page-in-chapter) / chapters. */
export function spineFraction(
  loc: {
    start?: { index?: number; displayed?: { page?: number; total?: number } };
    atEnd?: boolean;
  },
  spineLength: number
): number | null {
  if (loc?.atEnd) return 1;
  const idx = loc?.start?.index;
  if (typeof idx !== "number" || !(spineLength > 0)) return null;
  const d = loc.start?.displayed;
  const inChapter =
    d?.total && d.total > 0 && d.page ? (d.page - 1) / d.total : 0;
  return Math.max(0, Math.min(1, (idx + inChapter) / spineLength));
}
