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
export function toTransferItems(items: RawItem[]): TransferItem[] {
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
