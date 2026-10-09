/**
 * The app's own cut/copy/paste of files (not the OS clipboard): ⌘X / ⌘C
 * capture the selection, and paste runs it through the background transfer
 * pipeline with conflict resolution. Extracted from FileListing.vue (4.0
 * Phase 1) with no behavior change.
 */
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { startTransfer } from "@/utils/transfers";
import * as upload from "@/utils/upload";

export interface ListingClipboardDeps {
  routePath: () => string;
  showError: (e: Error | string) => void;
  showSuccess: (message: string) => void;
}

export function useListingClipboard(deps: ListingClipboardDeps) {
  const authStore = useAuthStore();
  const clipboardStore = useClipboardStore();
  const fileStore = useFileStore();
  const layoutStore = useLayoutStore();

  /**
   * Capture the current selection into the app clipboard (NOT the OS clipboard —
   * items are pasted via the background transfer pipeline). `mode` is explicit so
   * the context menu can call this without synthesizing keyboard events.
   * Permission gates mirror the backend's transfer checks: a cut pastes as a
   * MOVE (perm.rename), a copy pastes as a COPY (perm.create). With nothing
   * selected (or no permission) this no-ops WITHOUT preventDefault, so ⌘C still
   * performs the browser's native text-selection copy.
   */
  const clipboardCapture = (mode: "copy" | "cut", event?: Event): void => {
    if (fileStore.req === null) return;
    if (mode === "cut" && !authStore.user?.perm.rename) return;
    if (mode === "copy" && !authStore.user?.perm.create) return;

    const items: ClipItem[] = [];
    for (const i of fileStore.selected) {
      items.push({
        from: fileStore.req.items[i].url,
        name: fileStore.req.items[i].name,
        size: fileStore.req.items[i].size,
        modified: fileStore.req.items[i].modified,
      });
    }
    if (items.length === 0) return;

    event?.preventDefault();
    clipboardStore.$patch({
      key: mode,
      items,
      path: deps.routePath(),
    });
  };

  /**
   * Paste the app clipboard into `dest` (a folder URL; defaults to the current
   * folder). Runs through the shared background transfer pipeline, so a
   * same-volume cut→paste lands on the 2.3.0 fast lane automatically.
   *
   * Same-folder handling (Stage 1):
   *   - CUT pasted back into its source folder is a NO-OP that just disarms the
   *     clipboard (Finder semantics) — previously this moved every item onto a
   *     "(1)" suffix of itself, effectively renaming the originals.
   *   - COPY pasted into its source folder duplicates every item with the
   *     backend's "(N)" suffix directly — no conflict prompt. Every item
   *     trivially collides with itself there, and surfacing "Override" for a
   *     self-copy is a destructive trap, so keep-both is the only resolution.
   */
  const paste = async (dest?: string) => {
    if (clipboardStore.items.length === 0) return;

    const rawDest = dest ?? deps.routePath();
    const path = rawDest.endsWith("/") ? rawDest : rawDest + "/";
    const clipSrc = clipboardStore.path
      ? clipboardStore.path.endsWith("/")
        ? clipboardStore.path
        : clipboardStore.path + "/"
      : "";
    const samePlace = clipSrc === path;

    const isMove = clipboardStore.key === "cut";
    const kind: "move" | "copy" = isMove ? "move" : "copy";

    if (isMove && samePlace) {
      clipboardStore.resetClipboard();
      return;
    }

    const items: {
      from: string;
      to: string;
      name: string;
      size?: number;
      modified?: string;
      overwrite: boolean;
      rename: boolean;
    }[] = [];
    for (const item of clipboardStore.items) {
      const from = item.from.endsWith("/") ? item.from.slice(0, -1) : item.from;
      const to = path + encodeURIComponent(item.name);
      items.push({
        from,
        to,
        name: item.name,
        size: item.size,
        modified: item.modified,
        overwrite: false,
        rename: samePlace,
      });
    }

    if (items.length === 0) {
      return;
    }

    // Run the paste through the SHARED background transfer — the same path the
    // move/copy tool and drag-drop use. The floating transfer dock then (a) shows
    // the progress notification the user expects and (b) refreshes the listing
    // when the job settles, so the pasted file becomes visible without a manual
    // reload. (Previously paste called api.move/api.copy directly: no dock, and
    // the refresh hung on a one-off `fileStore.reload` flag.) Per-item overwrite /
    // rename flags set during conflict resolution are carried through by
    // `startTransfer` → `toTransferItems`.
    const run = () => {
      if (items.length === 0) return;
      void startTransfer(kind, items)
        .then(() => {
          // Selecting the pasted items in the destination is handled centrally
          // when the job settles (TransferDock), using the server's resolved
          // destination names — so it works whether you paste in place (the new
          // copies get a "(1)" suffix and the originals drop out) or after
          // navigating to another folder. A cut+paste consumes the clipboard; a
          // copy+paste keeps it so you can paste again elsewhere.
          if (isMove) clipboardStore.resetClipboard();
        })
        .catch((e) => deps.showError(e instanceof Error ? e : String(e)));
    };

    // Same-folder copy: every item collides with itself, so skip the conflict
    // prompt and duplicate with the backend "(N)" suffix (rename was set above).
    if (samePlace) {
      run();
      return;
    }

    const conflict = await upload.checkMoveConflict(items, path);

    if (conflict.length > 0) {
      // Paste path: source is the clipboard's origin folder, target is
      // the current route. clipboardStore.path is the directory the cut
      // / copied items came from.
      layoutStore.showHover({
        prompt: "resolve-conflict",
        props: {
          conflict: conflict,
          from: clipboardStore.path,
          to: path,
        },
        confirm: (ev: Event, result: Array<ConflictingResource>) => {
          ev.preventDefault();
          layoutStore.closeHovers();
          for (let i = result.length - 1; i >= 0; i--) {
            const item = result[i];
            if (item.checked.length == 2) {
              items[item.index].rename = true;
            } else if (
              item.checked.length == 1 &&
              item.checked[0] == "origin"
            ) {
              items[item.index].overwrite = true;
            } else {
              // Skipped (this is what "Skip all conflicting files" produces for
              // every row) — drop it from the batch.
              items.splice(item.index, 1);
            }
          }
          if (items.length > 0) {
            run();
          } else {
            // Every conflicting item was skipped, so there's nothing left to
            // transfer. Without this the dialog just closed silently and the
            // user had no idea whether anything happened (the reported bug).
            deps.showSuccess(
              `All conflicting items were skipped — nothing was ${
                isMove ? "moved" : "copied"
              }.`
            );
          }
        },
      });

      return;
    }

    run();
  };

  return { clipboardCapture, paste };
}
