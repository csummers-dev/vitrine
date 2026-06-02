import { useToast } from "vue-toastification";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { files as api } from "@/api";
import * as upload from "@/utils/upload";
import { isSelfOrDescendantTarget, isNoopMove } from "@/utils/dragdrop";
import { useTransferIndicator } from "@/composables/useTransferIndicator";

/**
 * Drop-handler shared by anything in the file UI that can receive a
 * dragged selection — file rows (`ListingItem`) and breadcrumb
 * segments (drag-to-parent, F5). Centralizes the move-vs-copy decision
 * (modifier key), the conflict-resolution prompt, and error toast.
 *
 * Target URL is whatever the drop site is (a folder's URL, a
 * breadcrumb path) — the dragged items get moved into it.
 *
 * Usage from a component:
 *   const { performDrop } = useDropTarget();
 *   ...
 *   @drop="(e) => performDrop(e, targetUrl)"
 */
export function useDropTarget() {
  const fileStore = useFileStore();
  const layoutStore = useLayoutStore();
  const toast = useToast();
  const { runTransfer } = useTransferIndicator();

  const performDrop = async (event: DragEvent, targetUrl: string) => {
    event.preventDefault();

    // Read from the dragstart snapshot, not `selected`. Spring-load
    // navigation between dragstart and drop may have cleared `selected`
    // when the original items left the visible listing — the snapshot
    // survives those navigations.
    const snapshot = fileStore.draggedItems;
    if (snapshot.length === 0) {
      // Empty snapshot at drop time isn't a user-facing error (RC-12): a
      // single native drop bubbles to ancestor drop handlers, and by the
      // time a later one runs `dragend` may already have cleared the
      // snapshot. The real move was performed by the first handler — so
      // surfacing an error toast here was spurious. Silently no-op.
      return;
    }

    // Track whether the user is explicitly trying to drop a folder INTO
    // itself or its own subtree (a cycle the backend rejects). We warn for
    // that, but stay silent for a plain same-location no-op (below).
    const isCycleDrop = snapshot.some((it) =>
      isSelfOrDescendantTarget(it.url, it.isDir, targetUrl)
    );

    // Drop two classes of illegal/pointless targets up front:
    //   1. A folder moved INTO itself or its own subtree (cycle).
    //   2. An item dropped exactly where it ALREADY lives (no-op). Folder
    //      urls carry a trailing slash while the computed destination does
    //      not, so compare canonically — this trailing-slash mismatch is
    //      what previously let a folder be "dropped onto itself" and trip
    //      the conflict prompt instead of being refused.
    const dragged = snapshot.filter((it) => {
      const dest = targetUrl + encodeURIComponent(it.name);
      return (
        !isSelfOrDescendantTarget(it.url, it.isDir, targetUrl) &&
        !isNoopMove(it.url, dest)
      );
    });

    if (dragged.length === 0) {
      // Nothing legal left to move. Warn only when the user was actually
      // dropping a folder onto / into itself (the invalid action they
      // expect to be blocked); a pure same-spot no-op stays silent so an
      // accidental micro-drag doesn't nag.
      if (isCycleDrop) toast.warning("You can't move a folder onto itself.");
      return;
    }

    // Build the {from, to, ...} list the move/copy API expects.
    const items = dragged.map((it) => ({
      from: it.url,
      to: targetUrl + encodeURIComponent(it.name),
      name: it.name,
      size: it.size,
      modified: it.modified,
      isDir: it.isDir,
      overwrite: false,
      rename: false,
    }));

    if (items.length === 0) return;

    const isCopy = event.ctrlKey || event.metaKey;
    const action = (overwrite?: boolean, rename?: boolean) => {
      // runTransfer shows a delayed "Moving…/Copying…" toast, reloads the
      // listing + confirms on success, and surfaces errors (RC: drag-drop
      // moves used to give no in-progress indication).
      const op = isCopy ? api.copy : api.move;
      void runTransfer(() => op(items, overwrite, rename), isCopy, items);
    };

    const conflict = await upload.checkMoveConflict(items, targetUrl);

    if (conflict.length > 0) {
      // Derive a single source folder from the first dragged item's url
      // (parent dir). When the selection spans multiple source folders
      // this is a best-effort hint — it still tells the user where the
      // drag started from, even if not every item shares that origin.
      const firstFrom = dragged[0]?.url ?? "";
      const sourceUrl = firstFrom.replace(/[^/]+\/?$/, "");
      layoutStore.showHover({
        prompt: "resolve-conflict",
        props: { conflict, from: sourceUrl, to: targetUrl },
        confirm: (e: Event, result: Array<ConflictingResource>) => {
          e.preventDefault();
          layoutStore.closeHovers();
          for (let i = result.length - 1; i >= 0; i--) {
            const item = result[i];
            if (item.checked.length === 2) {
              items[item.index].rename = true;
            } else if (
              item.checked.length === 1 &&
              item.checked[0] === "origin"
            ) {
              items[item.index].overwrite = true;
            } else {
              items.splice(item.index, 1);
            }
          }
          if (items.length > 0) action();
        },
      });
      return;
    }

    action();
  };

  return { performDrop };
}
