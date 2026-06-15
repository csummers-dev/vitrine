import { inject, provide, type InjectionKey } from "vue";
import { useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";

/**
 * Pane context (dual-pane / split view, Stage 1).
 *
 * The app is built around a single global `fileStore`. To support a second,
 * independently-navigable listing pane, the per-pane *listing* state (selection
 * + keyboard-nav cursor + the current request) is resolved through this context
 * instead of reaching for `useFileStore()` directly. Pane A's context is
 * literally `fileStore`; pane B's is the pane-B store (added in Stage 2). With
 * NO provider in the tree, `usePaneContext()` falls back to `fileStore`, so
 * single-pane behaviour is byte-for-byte unchanged.
 *
 * Deliberately NOT part of the per-pane surface: the drag snapshot
 * (`draggedItems`) and the touch-click guard (`suppressClicksUntil`). There is
 * exactly one drag session and one touch interaction at a time across both
 * panes, so those stay global on `fileStore` and the drop handler
 * (`useDropTarget`) keeps reading them directly regardless of pane.
 */
export type PaneId = "a" | "b";

/** The per-pane listing surface the row component + keyboard-nav read/write.
 *  `fileStore` (pane A) and the pane-B store both satisfy this shape. */
export interface ListingState {
  req: Resource | null;
  selected: number[];
  readonly selectedCount: number;
  activeIndex: number;
  anchorIndex: number;
  multiple: boolean;
  removeSelected(value: number): void;
  setPreselect(paths: string | string[]): void;
  snapshotDragSelection(index: number): void;
}

export interface PaneContext {
  paneId: PaneId;
  listing: ListingState;
  /**
   * Open a path FROM this pane. Pane A navigates via the route (folders + file
   * previews alike). Pane B navigates folders in place and routes files to the
   * shared preview. `isDir` lets pane B decide between the two.
   */
  navigate(url: string, isDir?: boolean): void;
}

export const PANE_CONTEXT_KEY: InjectionKey<PaneContext> =
  Symbol("paneContext");

/**
 * Resolve the current pane's context. A descendant of a pane component reads the
 * pane it lives in via inject; with no provider (single-pane, or pane A which
 * doesn't bother providing) it resolves to the primary `fileStore`.
 */
export function usePaneContext(): PaneContext {
  return inject(
    PANE_CONTEXT_KEY,
    () => {
      // No provider → single-pane / pane A. The factory runs during the
      // injecting component's setup, so useRouter() here is valid; the returned
      // closure captures the router for later navigation.
      const router = useRouter();
      return {
        paneId: "a" as PaneId,
        listing: useFileStore() as unknown as ListingState,
        navigate: (url: string) => {
          void router.push({ path: url });
        },
      };
    },
    true
  );
}

/** Provide a pane context to descendant rows (used by the pane components). */
export function providePaneContext(ctx: PaneContext): void {
  provide(PANE_CONTEXT_KEY, ctx);
}
