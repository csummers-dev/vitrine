/**
 * Inline rename of the folder currently being viewed (the ⋯ menu's "Rename
 * folder"). Extracted from FileListing.vue (4.0 Phase 1) with no behavior
 * change.
 *
 * UX matches the inline row rename in ListingItem: the folder title swaps for
 * an input, Enter commits, Esc or blur cancels. The storage root has no parent
 * to move into, so `canRename` is false there.
 */
import { computed, nextTick, ref, watch } from "vue";
import { files as api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import url from "@/utils/url";

export interface FolderRenameDeps {
  /** Keep Favorites pointing at the folder (and descendants) after a rename. */
  renameFavorite: (oldUrl: string, newUrl: string) => void;
  /** Route to the renamed folder so the listing reloads against it. */
  navigate: (path: string) => void;
  showError: (e: Error) => void;
}

/** Delay before a blur cancels, so an Enter keydown can commit first. */
export const BLUR_CANCEL_MS = 120;

export function useFolderRename(deps: FolderRenameDeps) {
  const authStore = useAuthStore();
  const fileStore = useFileStore();

  const isRenaming = ref<boolean>(false);
  const value = ref<string>("");
  const inputEl = ref<HTMLInputElement | null>(null);
  let submitting = false;

  // Mirror into the shared store flag so a background listing refresh (e.g. a
  // transfer's incremental reload) defers instead of interrupting the edit
  // (see Files.vue's reload gate).
  watch(isRenaming, (active) => {
    fileStore.inlineEditing = active;
  });

  const canRename = computed<boolean>(() => {
    if (!authStore.user?.perm.rename) return false;
    const req = fileStore.req;
    if (!req || !req.isDir) return false;
    // The storage root ("/files/") has no folder name and no parent.
    if (!req.name) return false;
    return true;
  });

  const start = async () => {
    if (!canRename.value || !fileStore.req) return;
    value.value = fileStore.req.name;
    submitting = false;
    isRenaming.value = true;
    await nextTick();
    const el = inputEl.value;
    if (!el) return;
    el.focus();
    el.select();
  };

  const cancel = () => {
    if (submitting) return;
    isRenaming.value = false;
  };

  const onBlur = () => {
    if (submitting) return;
    setTimeout(() => {
      if (!submitting && isRenaming.value) cancel();
    }, BLUR_CANCEL_MS);
  };

  const submit = async () => {
    if (submitting || !fileStore.req) return;
    const next = value.value.trim();
    if (next === "" || next === fileStore.req.name) {
      cancel();
      return;
    }
    submitting = true;
    const oldUrl = fileStore.req.url;
    // Strip the trailing slash before taking the parent (removeLastDir would
    // otherwise drop the folder name itself, not its parent).
    const trimmed = oldUrl.endsWith("/") ? oldUrl.slice(0, -1) : oldUrl;
    const newUrl = url.removeLastDir(trimmed) + "/" + encodeURIComponent(next);
    try {
      await api.move([{ from: oldUrl, to: newUrl }]);
      deps.renameFavorite(oldUrl, newUrl);
      deps.navigate(newUrl);
      isRenaming.value = false;
    } catch (e) {
      if (e instanceof Error) deps.showError(e);
      submitting = false;
    }
  };

  return {
    isRenaming,
    value,
    inputEl,
    canRename,
    start,
    cancel,
    onBlur,
    submit,
  };
}
