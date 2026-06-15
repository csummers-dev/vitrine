import { defineStore } from "pinia";
import { useFileStore } from "./file";
import { usePreferences } from "@/composables/usePreferences";
import { files as api } from "@/api";

export type PaneId = "a" | "b";

/** Prefs keys (per-user bag) for restoring the split across sessions. */
const PREF_SPLIT = "panes.split";
const PREF_SECONDARY = "panes.secondaryPath";

/**
 * Panes store (dual-pane / split view, Stage 2).
 *
 * Holds the split coordination (on/off + which pane is active) AND pane B's
 * listing state. Pane A keeps using the single global `fileStore`; pane B is
 * THIS store. The top-level listing fields + actions (`req`, `selected`,
 * `updateRequest`, …) deliberately mirror `fileStore` so this store satisfies
 * the `ListingState` shape the row component + keyboard-nav read through the
 * pane context. The extra coordination fields (`split`, `activePane`,
 * `secondaryPath`) sit alongside.
 *
 * The drag snapshot is global (one drag session): pane B's
 * `snapshotDragSelection` writes `fileStore.draggedItems`, which the shared drop
 * handler reads regardless of which pane the drag started in.
 */
export const usePanesStore = defineStore("panes", {
  state: (): {
    // ── Coordination ──
    split: boolean;
    activePane: PaneId;
    /** Pane B's current folder, a `/files/...` URL. */
    secondaryPath: string;
    // ── Pane B listing state (satisfies ListingState) ──
    req: Resource | null;
    oldReq: Resource | null;
    selected: number[];
    activeIndex: number;
    anchorIndex: number;
    multiple: boolean;
    preselect: string[];
    loading: boolean;
    error: Error | null;
    /** Bumped to ask pane B to re-fetch its current folder (e.g. after a
     *  transfer settles). ComparePane watches it. */
    refreshNonce: number;
  } => ({
    split: false,
    activePane: "a",
    secondaryPath: "/files/",
    req: null,
    oldReq: null,
    selected: [],
    activeIndex: -1,
    anchorIndex: -1,
    multiple: false,
    preselect: [],
    loading: false,
    error: null,
    refreshNonce: 0,
  }),

  getters: {
    selectedCount: (s) => s.selected.length,
  },

  actions: {
    // ── ListingState surface (mirrors fileStore, scoped to pane B) ──
    updateRequest(value: Resource | null) {
      const selectedItems = this.selected.map((i) => this.req?.items[i]);
      this.oldReq = this.req;
      this.req = value;
      this.activeIndex = -1;
      this.anchorIndex = -1;
      this.selected = [];
      if (!this.req?.items) return;
      this.selected = this.req.items
        .filter((item) =>
          selectedItems.some((rItem) => rItem?.url === item.url)
        )
        .map((item) => item.index);
    },
    removeSelected(value: number) {
      const i = this.selected.indexOf(value);
      if (i !== -1) this.selected.splice(i, 1);
    },
    setPreselect(paths: string | string[]) {
      this.preselect = Array.isArray(paths) ? [...paths] : [paths];
    },
    snapshotDragSelection(index: number) {
      if (this.selected.length === 0) {
        this.selected.push(index);
      } else if (this.selected.indexOf(index) === -1) {
        this.selected = [index];
      }
      // The drag snapshot is GLOBAL — write it where useDropTarget reads it.
      const fileStore = useFileStore();
      if (this.req) {
        fileStore.draggedItems = this.selected
          .map((i) => this.req!.items[i])
          .filter((it): it is ResourceItem => it != null);
      }
    },
    toggleMultiple() {
      this.multiple = !this.multiple;
    },

    // ── Coordination + persistence ──
    /** Load split + pane-B path from the user's prefs bag (call once on mount). */
    restore() {
      const prefs = usePreferences();
      this.split = prefs.get<boolean>(PREF_SPLIT, false);
      this.secondaryPath = prefs.get<string>(PREF_SECONDARY, "/files/");
    },
    /** Open the split. `fallbackPath` (pane A's folder) seeds pane B the first
     *  time, when there's no saved path. */
    openSplit(fallbackPath: string) {
      this.split = true;
      if (!this.secondaryPath || this.secondaryPath === "/files/") {
        this.secondaryPath = fallbackPath;
      }
      this.activePane = "a";
      void usePreferences().set(PREF_SPLIT, true);
    },
    closeSplit() {
      this.split = false;
      this.activePane = "a";
      this.selected = [];
      this.multiple = false;
      void usePreferences().set(PREF_SPLIT, false);
    },
    setActive(pane: PaneId) {
      this.activePane = pane;
    },
    /**
     * Navigate pane B to a folder, in place. Owns the fetch so it can be driven
     * from anywhere — pane B's own controls, the sidebar/search when pane B is
     * active, and the refresh-on-settle path. Persists the new location.
     */
    async navigateB(path: string) {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.fetch(path);
        this.updateRequest(res);
        this.secondaryPath = res.url;
        void usePreferences().set(PREF_SECONDARY, res.url);
      } catch (e) {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.updateRequest(null);
      } finally {
        this.loading = false;
      }
    },
    /** Re-fetch pane B's current folder (used after a transfer settles). */
    refreshB() {
      this.refreshNonce++;
    },
  },
});
