/** Singleton open-state for the FavoriteColorDialog (mounted in App.vue). */
import { ref } from "vue";

const isOpen = ref(false);
const targetPath = ref("");

export function useFavoriteColorDialog() {
  return {
    isOpen,
    targetPath,
    open: (path: string) => {
      targetPath.value = path;
      isOpen.value = true;
    },
    close: () => {
      isOpen.value = false;
    },
  };
}
