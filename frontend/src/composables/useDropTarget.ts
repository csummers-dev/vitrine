import { inject } from "vue";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { files as api } from "@/api";
import * as upload from "@/utils/upload";

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
  const $showError = inject<IToastError>("$showError")!;

  const performDrop = async (event: DragEvent, targetUrl: string) => {
    event.preventDefault();
    if (fileStore.selectedCount === 0) return;
    if (!fileStore.req) return;

    // Build the {from, to, ...} list the move/copy API expects.
    const items = fileStore.selected
      .map((i) => fileStore.req!.items[i])
      .filter(Boolean)
      .map((it) => ({
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

    // Same source folder + same target = no-op.
    if (items.every((it) => it.from === it.to)) return;

    const action = (overwrite?: boolean, rename?: boolean) => {
      const op = event.ctrlKey || event.metaKey ? api.copy : api.move;
      op(items, overwrite, rename)
        .then(() => {
          fileStore.reload = true;
        })
        .catch($showError);
    };

    const conflict = await upload.checkConflict(items, targetUrl);

    if (conflict.length > 0) {
      layoutStore.showHover({
        prompt: "resolve-conflict",
        props: { conflict },
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
