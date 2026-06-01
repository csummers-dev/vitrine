/**
 * useBulkRename — singleton open-state for the BulkRenamePanel (v1.3 S4-2).
 *
 * Hoisted to a module-scoped ref (same pattern as `useCommandPalette`
 * and `useTagPicker`) so the command palette can trigger the panel
 * from anywhere — not just FileListing's local context. The panel
 * itself still lives inside FileListing and binds `:open` to this
 * composable's `isOpen` ref.
 *
 * The panel snapshots the current selection on open, so we don't need
 * to pass items through this layer — opening from the palette or the
 * row context menu both end up consuming the same `fileStore.selected`
 * state.
 */
import { ref, type Ref } from "vue";

const isOpen: Ref<boolean> = ref(false);

export function useBulkRename() {
  const open = () => {
    isOpen.value = true;
  };

  const close = () => {
    isOpen.value = false;
  };

  return {
    isOpen,
    open,
    close,
  };
}
