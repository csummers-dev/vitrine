/**
 * Delete → confirm → trash, with an Undo toast that restores. Extracted from
 * FileListing.vue (4.0 Phase 1) with no behavior change.
 *
 * (Stage 8 flow, rebuilt for the 2.4.0 Stage 2 recycle bin.) Flow:
 *   1. Any "delete" trigger (header button, palette, pill, ctx menu, the
 *      Delete key) routes through the confirm dialog.
 *   2. Confirm → the delete API runs IMMEDIATELY — the backend MOVES the
 *      items into the trash (an instant same-volume rename) and returns a
 *      trashId per item.
 *   3. An Undo toast shows for 5s (UNDO_WINDOW_MS); Undo RESTORES the
 *      trashed entries (the delete already happened — undo is a real
 *      round-trip, so it works even after navigating away). Items also remain recoverable from the
 *      Trash view long after the toast is gone.
 *   4. Shift+Delete (or the Trash view) deletes permanently: same confirm
 *      dialog with "Delete forever" wording, no undo.
 * The legacy modal is still kept in Prompts.vue for the file-editor
 * delete case (where `isListing === false`).
 */
import { ref, watch } from "vue";
import { useToast } from "vue-toastification";
import { files as api, trash as trashApi } from "@/api";
import UndoToast from "@/components/UndoToast.vue";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

export const UNDO_WINDOW_MS = 5000;

export interface DeleteItem {
  url: string;
  name: string;
}

export interface ListingDeleteDeps {
  /** The listing's rows in render order (folders, then files). */
  visibleItems: () => ResourceItem[];
  showError: (e: Error) => void;
}

export function useListingDelete(deps: ListingDeleteDeps) {
  const fileStore = useFileStore();
  const layoutStore = useLayoutStore();
  const $toast = useToast();

  const confirmOpen = ref(false);
  const confirmTitle = ref("");
  const confirmMessage = ref("");
  const pendingConfirm = ref<{ url: string; name: string }[]>([]);
  const pendingPermanent = ref(false);

  // After an optimistic delete, move the selection to the nearest remaining
  // item so a follow-up Shift+Delete (RC-10) has a target instead of
  // no-opping on an empty selection. Mirrors the image-preview delete flow,
  // which already advances to a neighbor. Runs BEFORE the deleted items are
  // hidden by the pending filter, so the pre-delete visual order is intact.
  const selectNeighborAfterDelete = (deletedUrls: Set<string>) => {
    // dirs-then-files matches the listing's render order.
    const visible = deps.visibleItems();
    const firstDeletedPos = visible.findIndex((it) => deletedUrls.has(it.url));
    const remaining = visible.filter((it) => !deletedUrls.has(it.url));
    fileStore.multiple = false;
    if (remaining.length === 0) {
      // Deleted the whole folder's worth of items — nothing left to select.
      fileStore.selected = [];
      return;
    }
    // The item that slides up into the first deleted slot (or the last
    // remaining item if the deletion was at the end of the list).
    const pos = firstDeletedPos === -1 ? 0 : firstDeletedPos;
    const neighbor = remaining[Math.min(pos, remaining.length - 1)];
    // Immediate re-selection — `index` is the same key space the rows bind
    // to, so the selection ring + a follow-up keyboard delete both work now.
    fileStore.selected = [neighbor.index];
    // Survive the eventual reload: performDelete sets reload=true, and
    // Files.vue re-resolves queued preselect paths into the selection.
    if (neighbor.path) fileStore.setPreselect(neighbor.path);
  };

  // Undo = restore the just-trashed entries by id. A real API round-trip (the
  // delete already happened), so it works even after navigating away.
  const undoRestore = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => trashApi.restore(id)));
    } catch (e) {
      if (e instanceof Error) deps.showError(e);
    } finally {
      fileStore.reload = true;
    }
  };

  const startUndoDelete = async (
    items: { url: string; name: string }[],
    permanent: boolean
  ) => {
    // Advance the selection to a neighbor before the items vanish (RC-10).
    selectNeighborAfterDelete(new Set(items.map((i) => i.url)));

    if (permanent) {
      try {
        await Promise.all(items.map((i) => api.remove(i.url, true)));
      } catch (e) {
        if (e instanceof Error) deps.showError(e);
      } finally {
        fileStore.reload = true;
      }
      return;
    }

    // Move to trash NOW (instant same-volume rename server-side), keep the ids
    // for the undo toast. Partial failures: whatever made it into the trash is
    // undoable; the error for the rest surfaces via the toast.
    let trashIds: string[] = [];
    try {
      const results = await Promise.all(items.map((i) => api.remove(i.url)));
      trashIds = results
        .filter((r): r is { trashId: string } => !!r?.trashId)
        .map((r) => r.trashId);
    } catch (e) {
      if (e instanceof Error) deps.showError(e);
    } finally {
      fileStore.reload = true;
    }
    if (trashIds.length === 0) return;

    const message =
      items.length === 1
        ? `Moved “${items[0].name}” to Trash`
        : `Moved ${items.length} items to Trash`;

    const toastId = $toast(
      {
        component: UndoToast,
        props: {
          message,
          onClick: () => {
            $toast.dismiss(toastId);
            void undoRestore(trashIds);
          },
        },
      },
      {
        timeout: UNDO_WINDOW_MS,
        closeOnClick: false,
        icon: false,
        // Dedicated class so the delete toast gets its own dark-orange skin +
        // width clamp (see .Vue-Toastification__toast.toast--undo in styles.css),
        // distinct from the neutral grey of generic toasts.
        toastClassName: "toast--undo",
      }
    );
  };

  // Open the trash/permanent confirm for `items`. Shared by the prompt
  // intercept watcher (header button, pill, ctx menu, palette) and the
  // Delete-key shortcut, so every entry point gets identical wording.
  const openDeleteConfirm = (
    items: { url: string; name: string }[],
    permanent: boolean
  ) => {
    if (items.length === 0) return;
    pendingConfirm.value = items;
    pendingPermanent.value = permanent;
    if (permanent) {
      confirmTitle.value =
        items.length === 1
          ? `Permanently delete “${items[0].name}”?`
          : `Permanently delete ${items.length} items?`;
      confirmMessage.value = "This skips the Trash and cannot be undone.";
    } else {
      const it = items[0];
      const labelHint = it.url.endsWith("/") ? "folder" : "file";
      confirmTitle.value =
        items.length === 1
          ? `Move this ${labelHint} to the Trash?`
          : `Move ${items.length} items to the Trash?`;
      confirmMessage.value =
        items.length === 1
          ? `“${it.name}” can be restored from the Trash later.`
          : "They can be restored from the Trash later.";
    }
    confirmOpen.value = true;
  };

  const onDeleteConfirm = () => {
    const items = pendingConfirm.value;
    const permanent = pendingPermanent.value;
    confirmOpen.value = false;
    pendingConfirm.value = [];
    pendingPermanent.value = false;
    if (items.length === 0) return;
    void startUndoDelete(items, permanent);
  };

  const onDeleteCancel = () => {
    confirmOpen.value = false;
    pendingConfirm.value = [];
    pendingPermanent.value = false;
  };

  // Build the {url, name}[] list for the current listing selection.
  // Shared by the confirm-dialog intercept watcher and the S4-5
  // skip-confirm shortcut path so both agree on what "the selection" is.
  const collectSelectedDeleteItems = (): { url: string; name: string }[] => {
    const req = fileStore.req;
    if (!req) return [];
    return fileStore.selected
      .map((idx) => req.items[idx])
      .filter(Boolean)
      .map((i) => ({ url: i.url, name: i.name }));
  };

  // Route the generic "delete" prompt (header button, palette, pill, ctx menu)
  // to this confirm while a listing selection exists.
  watch(
    () => layoutStore.currentPromptName,
    (name) => {
      if (name !== "delete") return;
      // Only intercept when we have a listing-level selection; the legacy
      // modal still handles file-editor deletes (a different code path).
      if (!fileStore.isListing || fileStore.selectedCount === 0) return;

      const req = fileStore.req;
      if (!req) return;
      const items = collectSelectedDeleteItems();
      if (items.length === 0) return;

      // Dismiss the prompt so the legacy modal doesn't render alongside ours
      layoutStore.closeHovers();

      openDeleteConfirm(items, false);
    }
  );

  return {
    confirmOpen,
    confirmTitle,
    confirmMessage,
    pendingPermanent,
    openDeleteConfirm,
    onDeleteConfirm,
    onDeleteCancel,
    collectSelectedDeleteItems,
    startUndoDelete,
    undoRestore,
  };
}
