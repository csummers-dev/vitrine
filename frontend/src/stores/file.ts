import { defineStore } from "pinia";

export const useFileStore = defineStore("file", {
  // convert to a function
  state: (): {
    req: Resource | null;
    oldReq: Resource | null;
    reload: boolean;
    selected: number[];
    multiple: boolean;
    isFiles: boolean;
    /**
     * Paths to re-select after the next listing reload. Entries must be
     * fully URL-decoded (matched against `item.path` which is itself
     * decoded). Array form so multi-item actions (paste, batch move,
     * future multi-rename) can re-select every affected row, not just
     * the first one.
     *
     * Set via `setPreselect()` so callers don't have to remember the
     * decode + normalize rules. Consumed and cleared by
     * `applyPreSelection()` in Files.vue after each fetch.
     */
    preselect: string[];
    /**
     * Snapshot of the items currently being dragged. Populated by the
     * drag-source row on `dragstart` and read by drop targets on `drop`.
     *
     * Why a snapshot rather than reading `selected` at drop time:
     * spring-loaded navigation (F2 section title, F6 folder rows) can
     * change `req` mid-drag, which causes `updateRequest()` to clear
     * `selected` because the originally-selected URLs no longer exist
     * in the new listing. Browsers keep the drag session alive across
     * SPA navigations, so without an independent snapshot the drop
     * resolved to zero items and silently no-op'd.
     *
     * Cleared by the drag-source row's `dragend` handler.
     */
    draggedItems: ResourceItem[];
  } => ({
    req: null,
    oldReq: null,
    reload: false,
    selected: [],
    multiple: false,
    isFiles: false,
    preselect: [],
    draggedItems: [],
  }),
  getters: {
    selectedCount: (state) => state.selected.length,
    // route: () => {
    //   const routerStore = useRouterStore();
    //   return routerStore.router.currentRoute;
    // },
    // isFiles: (state) => {
    //   const layoutStore = useLayoutStore();
    //   return !layoutStore.loading && state.route._value.name === "Files";
    // },
    isListing: (state) => {
      return state.isFiles && state?.req?.isDir;
    },
  },
  actions: {
    // no context as first argument, use `this` instead
    toggleMultiple() {
      this.multiple = !this.multiple;
    },
    updateRequest(value: Resource | null) {
      const selectedItems = this.selected.map((i) => this.req?.items[i]);
      this.oldReq = this.req;
      this.req = value;

      this.selected = [];

      if (!this.req?.items) return;
      this.selected = this.req.items
        .filter((item) =>
          selectedItems.some((rItem) => rItem?.url === item.url)
        )
        .map((item) => item.index);
    },
    removeSelected(value: any) {
      const i = this.selected.indexOf(value);
      if (i === -1) return;
      this.selected.splice(i, 1);
    },
    /**
     * Queue one or more paths to be re-selected after the next listing
     * reload. Pass DECODED paths — the matcher compares against
     * `item.path` which is already URL-decoded.
     *
     * Action sites call this after rename / move / copy / paste / upload
     * so the user's selection isn't disrupted by the post-action
     * refresh. Empty arrays are valid (no-op).
     *
     * If the URL-decoding rule trips you up: when building the path
     * from an encoded URL (e.g., the result of `encodeURIComponent(name)`),
     * wrap with `decodeURIComponent`. When using a value the user
     * typed or that came from a Resource's `name`/`path` field, it's
     * already decoded — pass as-is.
     */
    setPreselect(paths: string | string[]) {
      this.preselect = Array.isArray(paths) ? [...paths] : [paths];
    },
    // easily reset state using `$reset`
    clearFile() {
      this.$reset();
    },
  },
});
