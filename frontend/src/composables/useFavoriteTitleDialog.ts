/**
 * useFavoriteTitleDialog — singleton open-state for the FavoriteTitleDialog.
 *
 * The dialog lets a user set a custom *display name* for a pinned folder,
 * shown only in the sidebar Favorites section (the real folder is never
 * touched). Two surfaces open it — the row right-click context menu and the
 * section ⋯ "more options" menu — so the open state + target path hoist into
 * a module-scoped singleton, same pattern as `useTagPicker` /
 * `useCommandPalette`. The dialog component itself is mounted once (in
 * FileListing) and reads `targetPath` to know which favorite it's editing.
 */
import { ref, type Ref } from "vue";

const isOpen: Ref<boolean> = ref(false);
const targetPath: Ref<string> = ref("");

export function useFavoriteTitleDialog() {
  const open = (path: string) => {
    targetPath.value = path;
    isOpen.value = true;
  };

  const close = () => {
    isOpen.value = false;
  };

  return { isOpen, targetPath, open, close };
}
