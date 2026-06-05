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
 *  (same-volume) rename, which finishes near-instantly, never flashes a row. */
export const TRANSFER_REVEAL_MS = 350;

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
