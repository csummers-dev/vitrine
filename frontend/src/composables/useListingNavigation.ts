import { useFileStore } from "@/stores/file";

/**
 * useListingNavigation — Finder-style keyboard navigation of the file listing.
 *
 * Drives the selection from the arrow keys / Home / End over the *visual* order
 * of the listing (folders, then files). The "cursor" is `fileStore.activeIndex`
 * (the moving end); `fileStore.anchorIndex` is the fixed end for Shift+Arrow
 * range extension. Selection stays the existing `fileStore.selected` index
 * array, so everything downstream (the action bar, move/copy, drag) is
 * unchanged.
 *
 * View-aware: in list view ↑/↓ step one row and ←/→ are inert; in grid/gallery
 * ←/→ step one tile and ↑/↓ jump by the live column count (from useListingGrid).
 * The caller supplies the ordered items, the per-item column count, whether the
 * grid is active, and a reveal (scroll-into-view) callback — keeping this
 * composable free of view/DOM specifics.
 */
export type NavDirection = "up" | "down" | "left" | "right" | "home" | "end";

export interface ListingNavigationOptions {
  /** Full visual order (folders then files); each item carries `.index`. */
  ordered: () => ResourceItem[];
  /** Live column count for the section the given item belongs to. */
  columnsFor: (item: ResourceItem) => number;
  /** True when a grid/gallery view is active (←/→ + column jumps apply). */
  grid: () => boolean;
  /** Scroll the item with this `req.items` index into view. */
  reveal: (reqIndex: number) => void;
}

export function useListingNavigation(opts: ListingNavigationOptions) {
  const fileStore = useFileStore();

  const posOf = (order: ResourceItem[], reqIndex: number): number =>
    order.findIndex((it) => it.index === reqIndex);

  /** First currently-selected item's visual position, or -1. */
  const firstSelectedPos = (order: ResourceItem[]): number => {
    let best = -1;
    for (const sel of fileStore.selected) {
      const p = posOf(order, sel);
      if (p !== -1 && (best === -1 || p < best)) best = p;
    }
    return best;
  };

  const selectSingle = (order: ResourceItem[], pos: number) => {
    const reqIndex = order[pos].index;
    fileStore.selected = [reqIndex];
    fileStore.activeIndex = reqIndex;
    fileStore.anchorIndex = reqIndex;
  };

  const extendTo = (order: ResourceItem[], pos: number) => {
    // Anchor defaults to the current cursor if we don't have a valid one yet.
    let anchorPos = posOf(order, fileStore.anchorIndex);
    if (anchorPos === -1) anchorPos = posOf(order, fileStore.activeIndex);
    if (anchorPos === -1) anchorPos = pos;
    const lo = Math.min(anchorPos, pos);
    const hi = Math.max(anchorPos, pos);
    const range: number[] = [];
    for (let i = lo; i <= hi; i++) range.push(order[i].index);
    fileStore.selected = range;
    fileStore.activeIndex = order[pos].index;
    fileStore.anchorIndex = order[anchorPos].index;
  };

  const move = (dir: NavDirection, extend = false) => {
    const order = opts.ordered();
    const n = order.length;
    if (n === 0) return;

    // Resolve the starting cursor: the active cursor, else the first selected.
    let cur = posOf(order, fileStore.activeIndex);
    if (cur === -1) cur = firstSelectedPos(order);

    // Nothing focused and nothing selected → land on an end without traversing.
    if (cur === -1) {
      const start = dir === "up" || dir === "left" || dir === "end" ? n - 1 : 0;
      selectSingle(order, start);
      opts.reveal(order[start].index);
      return;
    }

    // Concretize the cursor + (for Shift) anchor from whatever we resolved, so
    // the first Shift+Arrow extends from the current item — including a prior
    // mouse selection that didn't set a keyboard cursor.
    if (posOf(order, fileStore.activeIndex) === -1) {
      fileStore.activeIndex = order[cur].index;
    }
    if (extend && posOf(order, fileStore.anchorIndex) === -1) {
      fileStore.anchorIndex = order[cur].index;
    }

    const isGrid = opts.grid();
    const cols = isGrid ? Math.max(1, opts.columnsFor(order[cur])) : 1;

    let target = cur;
    switch (dir) {
      case "up":
        target = isGrid ? cur - cols : cur - 1;
        break;
      case "down":
        target = isGrid ? cur + cols : cur + 1;
        break;
      case "left":
        target = isGrid ? cur - 1 : cur; // inert in list view
        break;
      case "right":
        target = isGrid ? cur + 1 : cur; // inert in list view
        break;
      case "home":
        target = 0;
        break;
      case "end":
        target = n - 1;
        break;
    }
    target = Math.max(0, Math.min(n - 1, target));

    if (extend) extendTo(order, target);
    else selectSingle(order, target);
    opts.reveal(order[target].index);
  };

  return { move };
}
