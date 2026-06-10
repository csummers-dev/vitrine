/**
 * useBulkTagPicker — singleton open-state + target paths for the multi-select
 * tag picker (2.4.0 Stage 5 / K).
 *
 * Kept separate from `useTagPicker` (the single-file picker, opened from the
 * info-pane) so the two flows can't collide: the single picker binds a `:path`,
 * this one binds a `:paths` array and applies add/remove deltas across all of
 * them via `/api/tags/apply`. A dedicated TagPickerSheet instance in FileListing
 * binds to this composable.
 */
import { ref, type Ref } from "vue";

const isOpen: Ref<boolean> = ref(false);
const paths: Ref<string[]> = ref([]);

export function useBulkTagPicker() {
  const open = (targetPaths: string[]) => {
    paths.value = [...targetPaths];
    isOpen.value = true;
  };
  const close = () => {
    isOpen.value = false;
  };
  return { isOpen, paths, open, close };
}
