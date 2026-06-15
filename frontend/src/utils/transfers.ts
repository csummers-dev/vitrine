/**
 * Helpers to start a background move/copy job from the listing-shaped items the
 * move/copy panel and drag-drop already build ({ from, to } as `/files`-prefixed,
 * URL-encoded resource URLs). The job API wants scope-relative, decoded paths
 * (what the server's filesystem uses), so we normalize here in one place.
 */
import { removePrefix } from "@/api/utils";
import { useTransfers } from "@/composables/useTransfers";
import type { TransferItem, TransferJob, TransferKind } from "@/api/jobs";

interface RawItem {
  from: string;
  to: string;
  overwrite?: boolean;
  rename?: boolean;
}

/** A listing item that can be moved/copied (the subset the panel + drag read). */
export interface MoveCopySource {
  url: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

/** The `{ from, to, … }` shape `checkMoveConflict` + `startTransfer` consume. */
export interface MoveCopyItem {
  from: string;
  to: string;
  name: string;
  size: number;
  modified: string;
  isDir: boolean;
  overwrite: boolean;
  rename: boolean;
}

/**
 * Build the move/copy `{ from, to, … }` list: each item's destination is the
 * target folder (`destUrl`, which must end in a slash) plus its URL-encoded
 * name; overwrite/rename default false (set later by conflict resolution).
 * Shared by the move/copy panel (pane A + pane B's `override`) so the
 * destination math lives in one tested place.
 */
export function buildMoveCopyItems(
  items: MoveCopySource[],
  destUrl: string
): MoveCopyItem[] {
  return items.map((i) => ({
    from: i.url,
    to: destUrl + encodeURIComponent(i.name),
    name: i.name,
    size: i.size,
    modified: i.modified,
    isDir: i.isDir,
    overwrite: false,
    rename: false,
  }));
}

const norm = (p: string): string => {
  const stripped = removePrefix(p);
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
};

/** Convert listing-shaped items into job items (scope-relative + decoded). */
function toTransferItems(items: RawItem[]): TransferItem[] {
  return items.map((it) => ({
    from: norm(it.from),
    to: norm(it.to),
    overwrite: !!it.overwrite,
    rename: !!it.rename,
  }));
}

/** Start a move/copy as a background job; resolves with the initial snapshot.
 *  Rejects on a failed POST (perm / conflict) so the caller can surface it. */
export function startTransfer(
  kind: TransferKind,
  items: RawItem[]
): Promise<TransferJob> {
  return useTransfers().start(kind, toTransferItems(items));
}

/** Don't reveal a transfer row until it has lasted this long — so an instant
 *  (same-volume) rename, which finishes near-instantly, never flashes a row.
 *  Kept short so a real transfer's dock appears effectively immediately; the
 *  dock re-checks this on a fast ticker, not just the slower data poll. */
export const TRANSFER_REVEAL_MS = 180;

type RevealJob = Pick<TransferJob, "status" | "createdAt" | "finishedAt">;

/**
 * Whether a transfer row should be visible in the floating dock.
 *
 *   - failed / canceled → always (an error must never be silently hidden);
 *   - finished (completed) → reveal once its SERVER-measured span
 *     (`createdAt`→`finishedAt`, a single clock) clears the threshold — so an
 *     instant same-volume rename, which spans ~0ms, still doesn't flash;
 *   - running → reveal once it has been observed on THIS client long enough,
 *     measured from `firstSeenAt` (the browser's own clock) — NEVER the
 *     server's `createdAt`. Mixing the two breaks under server/client clock
 *     skew (common on self-hosted setups): when the server runs ahead the
 *     elapsed time reads as under-threshold and the dock stays hidden for a
 *     whole long transfer (e.g. a cross-volume move). `undefined` firstSeenAt
 *     means "not recorded yet" → not visible this tick.
 */
export function isTransferRowVisible(
  job: RevealJob,
  firstSeenAt: number | undefined,
  now: number,
  revealMs: number = TRANSFER_REVEAL_MS
): boolean {
  if (job.status === "failed" || job.status === "canceled") return true;
  if (job.finishedAt) {
    const created = Date.parse(job.createdAt);
    const finished = Date.parse(job.finishedAt);
    if (Number.isNaN(created) || Number.isNaN(finished)) return true;
    return finished - created >= revealMs;
  }
  if (firstSeenAt === undefined) return false;
  return now - firstSeenAt >= revealMs;
}

/**
 * One byte-progress observation for the rolling throughput/ETA estimate
 * (2.4.0 Stage 3 / I): the client-clock time and the job's doneBytes then.
 */
export interface RateSample {
  t: number; // ms (performance-style monotonic-ish; Date.now is fine)
  bytes: number;
}

/**
 * Bytes/sec over the samples spanning at least `windowMs` back from the latest,
 * or 0 when there isn't enough signal (fewer than 2 samples, no time elapsed, or
 * a non-increasing byte count — e.g. a stall or a fresh retry reset). A rolling
 * window (not cumulative) so the rate tracks the CURRENT speed, recovering after
 * a stall instead of being dragged down by early slowness.
 */
export function rollingRate(samples: RateSample[], windowMs = 5000): number {
  if (samples.length < 2) return 0;
  const latest = samples[samples.length - 1];
  // Oldest sample still inside the window (fall back to the first sample).
  let oldest = samples[0];
  for (let i = samples.length - 1; i >= 0; i--) {
    oldest = samples[i];
    if (latest.t - samples[i].t >= windowMs) break;
  }
  const dt = (latest.t - oldest.t) / 1000;
  const db = latest.bytes - oldest.bytes;
  if (dt <= 0 || db <= 0) return 0;
  return db / dt;
}

/**
 * Whole seconds remaining at the given bytes/sec, or null when it can't be
 * estimated (no rate, unknown total, or already complete). Capped so a near-zero
 * rate doesn't produce an absurd multi-day ETA.
 */
export function etaSeconds(
  doneBytes: number,
  totalBytes: number,
  bytesPerSec: number
): number | null {
  if (bytesPerSec <= 0 || totalBytes <= 0) return null;
  const remaining = totalBytes - doneBytes;
  if (remaining <= 0) return null;
  const secs = remaining / bytesPerSec;
  if (secs > 24 * 3600) return null; // > a day → don't pretend to know
  return Math.max(1, Math.round(secs));
}

/** "1.2 MB/s" — bytes/sec for the dock, reusing the project filesize helper. */
export function formatRate(
  bytesPerSec: number,
  filesize: (n: number) => string
): string {
  return `${filesize(bytesPerSec)}/s`;
}

/** "8s left" / "3m left" / "1h 4m left" — compact remaining-time label. */
export function formatEta(secs: number): string {
  if (secs < 60) return `${secs}s left`;
  if (secs < 3600) {
    const m = Math.round(secs / 60);
    return `${m}m left`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
}

/** Order-independent equality of two path lists. */
function samePathSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((p) => b.includes(p));
}

type AutoSelectJob = Pick<TransferJob, "status" | "toPaths" | "fromPaths">;

/**
 * Whether a settled transfer should auto-select the files it produced
 * (`toPaths`) in the listing — for any move OR copy, same- or cross-volume.
 * True only for a COMPLETED transfer that produced something, EXCEPT when the
 * user has MOVED ON: a non-empty current selection that isn't the transfer's
 * own source items (`fromPaths`), so a long transfer never yanks the selection
 * away from whatever they're now working on.
 *
 * "Are you viewing the destination?" is handled by the CALLER, not here: the
 * produced `toPaths` are queued for selection, but a path that isn't present in
 * the folder currently on screen simply doesn't match — so if you're not
 * looking at where the files landed, nothing gets selected. `fromPaths` is
 * server-reported; when absent a non-empty selection counts as "moved on".
 */
export function shouldAutoSelectTransfer(
  job: AutoSelectJob,
  currentSelection: string[]
): boolean {
  if (job.status !== "completed") return false;
  if (!job.toPaths?.length) return false;
  const movedOn =
    currentSelection.length > 0 &&
    !samePathSet(currentSelection, job.fromPaths ?? []);
  return !movedOn;
}

/**
 * Whether `path` is part of an in-flight move, given the set of move source
 * paths (`useTransfers().movingPaths`) — drives the "being moved" shimmer.
 *
 * Two ways to match:
 *   - EXACT — `path` is itself a moved item (a moved file, or the moved folder's
 *     own row in the source listing);
 *   - DESCENDANT — `path` lives inside a moved folder (`<from>/…`), so browsing
 *     INTO a folder while it's still being moved lights up its whole subtree at
 *     any depth. Single-level listings never show a folder beside its children,
 *     so this only surfaces once you navigate in (or in search results).
 *
 * The prefix test is anchored to a "/" boundary (`from + "/"`) so a moved
 * `/a/sub` never matches the sibling `/a/subtle`. Matching files as prefixes is
 * harmless — no item path is ever `<file>/…` — so we don't need an is-dir flag.
 * Paths are the normalized decoded scope-relative form used throughout (folders
 * carry no trailing slash), the same key the exact-match selection logic uses.
 */
export function isPathInMove(
  path: string,
  movingPaths: ReadonlySet<string>
): boolean {
  if (movingPaths.has(path)) return true;
  for (const from of movingPaths) {
    if (path.startsWith(from + "/")) return true;
  }
  return false;
}

const stripTrailingSlash = (p: string): string =>
  p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

const parentDir = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
};

type FolderTouchJob = Pick<
  TransferJob,
  "kind" | "fromPaths" | "toPaths" | "dest"
>;

/**
 * Whether an in-flight transfer's progress is relevant to the folder currently
 * on screen — items are arriving in it or leaving it — so the listing can be
 * refreshed in place as files complete. `folder` is the current folder's decoded
 * scope-relative path (leading slash, no trailing slash, e.g. "/Movies"); the
 * same namespace as `fromPaths` / `toPaths` / `dest`.
 *
 *   - DESTINATION (move OR copy): a produced item (`toPaths`, or the shared
 *     `dest` directory) lands directly in this folder, so a new row should
 *     appear; OR this folder is itself a folder being created at the destination
 *     (you've browsed into it), so its incoming children should appear.
 *   - SOURCE (move only — a copy leaves its source in place): a moved item
 *     (`fromPaths`) lives directly in this folder and is leaving it; OR this
 *     folder is inside a folder being moved away.
 *
 * Path boundaries are anchored on "/" (`p + "/"`) so "/a/sub" never matches the
 * sibling "/a/subtle".
 */
export function transferTouchesFolder(
  job: FolderTouchJob,
  folder: string
): boolean {
  const f = stripTrailingSlash(folder);

  const lands = (paths: string[] | undefined): boolean => {
    for (const raw of paths ?? []) {
      const p = stripTrailingSlash(raw);
      if (parentDir(p) === f) return true; // lands as a direct row here
      if (p === f || f.startsWith(p + "/")) return true; // we're inside it
    }
    return false;
  };

  // Destination — for any transfer (the new copies/moves appear here).
  if (lands(job.toPaths)) return true;
  if (job.dest && stripTrailingSlash(job.dest) === f) return true;
  // Source — only a move empties its source folder.
  if (job.kind === "move" && lands(job.fromPaths)) return true;
  return false;
}
