import { ref, type Ref } from "vue";

/**
 * Singleton open/close state for the keyboard-shortcuts cheat sheet.
 *
 * Kept separate from useShortcuts so the overlay component can subscribe
 * to just the open flag without importing the whole registry plumbing.
 */
const isOpen: Ref<boolean> = ref(false);

export function useShortcutsOverlay() {
  const open = () => {
    isOpen.value = true;
  };
  const close = () => {
    isOpen.value = false;
  };
  const toggle = () => {
    isOpen.value = !isOpen.value;
  };
  return { isOpen, open, close, toggle };
}
