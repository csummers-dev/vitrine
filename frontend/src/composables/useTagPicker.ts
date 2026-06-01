/**
 * useTagPicker — singleton open-state for the TagPickerSheet (v1.3 S4-1).
 *
 * Originally the picker's open flag lived as a local `ref<boolean>` in
 * InfoPane.vue, only togglable via the "Manage" button inside the
 * info-rail. The S4-1 row context menu needs to open it from outside
 * InfoPane — and so will the future bulk-tag flow (S4-2 territory) —
 * so the open state hoists into a module-scoped singleton, same
 * pattern as `useCommandPalette`.
 *
 * The composable is intentionally state-only. The actual sheet
 * component (TagPickerSheet) still lives inside InfoPane and binds its
 * `:open` prop to `isOpen`. Nothing else moves; this is just a remote
 * control for the flag.
 */
import { ref, type Ref } from "vue";

const isOpen: Ref<boolean> = ref(false);

export function useTagPicker() {
  const open = () => {
    isOpen.value = true;
  };

  const close = () => {
    isOpen.value = false;
  };

  const toggle = () => {
    isOpen.value = !isOpen.value;
  };

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
