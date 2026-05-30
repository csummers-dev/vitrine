import { ref, type Ref } from "vue";

/**
 * Singleton state for the mobile nav drawer. Only one drawer is active at
 * a time (the Files sidebar and the Settings rail can't both be visible
 * since they live on different routes), so a single shared ref is fine.
 *
 * The Sidebar / Settings rail listens to `isOpen` and renders inside the
 * Drawer primitive when it's true. The hamburger button in the header
 * toggles it.
 */
const isOpen: Ref<boolean> = ref(false);

export function useMobileNav() {
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
