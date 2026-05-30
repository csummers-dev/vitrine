import { ref, type Ref } from "vue";

/**
 * Singleton state for the ⌘K command palette. Importing `useCommandPalette`
 * from anywhere returns the same reactive refs, so any component can open/
 * close the palette without prop-drilling or going through a Pinia store.
 *
 * Why not a Pinia store? The palette is pure UI state with no persistence
 * and no cross-store invariants. A module-scoped ref is lighter.
 */
const isOpen: Ref<boolean> = ref(false);
const query: Ref<string> = ref("");

export function useCommandPalette() {
  const open = () => {
    query.value = "";
    isOpen.value = true;
  };

  const close = () => {
    isOpen.value = false;
  };

  const toggle = () => {
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  };

  return {
    isOpen,
    query,
    open,
    close,
    toggle,
  };
}
