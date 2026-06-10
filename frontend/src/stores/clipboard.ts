import { defineStore } from "pinia";

/**
 * The app clipboard for Cut/Copy/Paste of listing items (2.4.0 Stage 1).
 * NOT the OS clipboard — paste runs through the background transfer pipeline.
 *
 * `key`  — "cut" | "copy" while armed, "" when empty.
 * `items` — the captured selection (item url as `from`, plus name/size/modified
 *           for the conflict prompt).
 * `path` — the SOURCE folder route the items were captured in; paste compares
 *          it against the destination for the same-folder fast paths, and rows
 *          whose url is in a "cut" clipboard render dimmed (ListingItem).
 *
 * In-memory by design: survives navigation within the tab, not a reload.
 */
export const useClipboardStore = defineStore("clipboard", {
  state: (): {
    key: "" | "copy" | "cut";
    items: ClipItem[];
    path?: string;
  } => ({
    key: "",
    items: [],
    path: undefined,
  }),
  actions: {
    resetClipboard() {
      this.$reset();
    },
  },
});
