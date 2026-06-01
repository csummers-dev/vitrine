/**
 * useDragSelect — rubber-band (lasso) selection for grid + gallery
 * views (v1.3 S4-3).
 *
 * Mouse-down on empty listing space → draw a rectangle → select every
 * item the rectangle intersects (any pixel overlap counts). Modifier
 * semantics match Finder:
 *   - plain drag        → replace the selection
 *   - Shift + drag      → add to the existing selection
 *   - Cmd/Ctrl + drag   → toggle each intersected item's membership
 *
 * Scope (locked, S4-3): grid + gallery ONLY. List view is excluded —
 * its click + shift-click model is sufficient and a lasso starting in
 * the gap between full-width rows is a new failure mode. The caller
 * gates `enabled` on `viewMode !== 'list'`.
 *
 * Coordinate handling: the rectangle anchor is captured in viewport
 * coords at mouse-down, but the scroll container can scroll mid-drag
 * (auto-scroll near edges). We adjust the anchor by the scroll delta
 * each frame so the rectangle stays pinned to the *content* point the
 * user grabbed, not the viewport pixel.
 */
import { ref, type Ref } from "vue";

export interface LassoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SelectMode = "replace" | "add" | "toggle";

export interface UseDragSelectOptions {
  /** False in list view (lasso disabled there). Re-read on each
   *  mouse-down so a view switch mid-session is respected. */
  enabled: () => boolean;
  /** The scrollable ancestor of the listing (the element whose
   *  scrollTop changes). Used for auto-scroll + the scroll-delta
   *  anchor adjustment. */
  getScrollContainer: () => HTMLElement | null;
  /** Snapshot of the current selection indices, read at drag start to
   *  serve as the base for add/toggle modes. */
  getSelection: () => number[];
  /** Write the computed selection back to the store. */
  setSelection: (indices: number[]) => void;
  /**
   * Optional geometry hit-test (CH-1). When the listing is virtualized,
   * off-screen tiles have no DOM node, so the default `.item[data-index]`
   * query can only see what's rendered — a marquee spanning more than one
   * screen would drop the tiles that scrolled out of the window. Supplying
   * a math-based hit-test (index → row/col → rect) lets the lasso select
   * every overlapped item regardless of what's currently mounted. Receives
   * the marquee rect in VIEWPORT coordinates and returns resource indices.
   * When omitted, the DOM-query path is used (non-virtualized callers).
   */
  hitTest?: (rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }) => number[];
}

// Pixels of movement before a press becomes a lasso (vs. a plain
// click that should fall through to the empty-area click handler).
const ACTIVATION_THRESHOLD = 4;
// Auto-scroll trigger zone (px from the container's top/bottom edge).
const EDGE_ZONE = 40;
// Max auto-scroll speed (px/frame) at the very edge.
const MAX_SCROLL_SPEED = 18;

export function useDragSelect(opts: UseDragSelectOptions) {
  /** The rectangle to render (viewport coords), or null when idle. */
  const lasso: Ref<LassoRect | null> = ref(null);
  /** True once the threshold is crossed and we're actively selecting. */
  const active = ref(false);

  // ── Drag session state (plain locals; not reactive) ───────────────
  let originX = 0; // viewport X at mouse-down
  let originY = 0; // viewport Y at mouse-down
  let startScrollTop = 0; // container.scrollTop at mouse-down
  let lastX = 0; // latest cursor viewport X
  let lastY = 0; // latest cursor viewport Y
  let baseSelection: number[] = [];
  let mode: SelectMode = "replace";
  let pendingStart = false; // pressed but not yet past threshold
  let rafId: number | null = null;

  const onMouseDown = (event: MouseEvent) => {
    if (!opts.enabled()) return;
    if (event.button !== 0) return; // left button only

    const target = event.target as HTMLElement | null;
    // Don't start a lasso when the press lands on an item (that's a
    // drag-to-move) or on an interactive control.
    if (
      target?.closest(".item") ||
      target?.closest("button, input, a, [role='button']")
    ) {
      return;
    }

    const container = opts.getScrollContainer();
    originX = event.clientX;
    originY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    startScrollTop = container?.scrollTop ?? 0;
    baseSelection = opts.getSelection();
    mode = event.shiftKey
      ? "add"
      : event.metaKey || event.ctrlKey
        ? "toggle"
        : "replace";
    pendingStart = true;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (event: MouseEvent) => {
    lastX = event.clientX;
    lastY = event.clientY;

    if (pendingStart) {
      const moved =
        Math.abs(event.clientX - originX) + Math.abs(event.clientY - originY);
      if (moved < ACTIVATION_THRESHOLD) return;
      // Cross the threshold → activate.
      pendingStart = false;
      active.value = true;
      document.body.style.userSelect = "none";
    }

    if (!active.value) return;
    // Stop the browser from text-selecting the listing chrome.
    event.preventDefault();
    recompute();
    updateAutoScroll();
  };

  const onMouseUp = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    stopAutoScroll();

    const wasActive = active.value;
    pendingStart = false;
    active.value = false;
    lasso.value = null;
    document.body.style.userSelect = "";

    if (wasActive) {
      // Suppress the click that fires after a drag — otherwise the
      // empty-area click handler would clear the freshly-lassoed
      // selection. One-shot capture-phase listener; removed after it
      // swallows the click (or on the next tick if no click fires).
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.setTimeout(
        () => window.removeEventListener("click", swallow, true),
        0
      );
    }
  };

  /** Recompute the rectangle + apply the intersection selection. Reads
   *  the live scrollTop so auto-scroll frames stay correct. */
  const recompute = () => {
    const container = opts.getScrollContainer();
    const scrollDelta = (container?.scrollTop ?? 0) - startScrollTop;
    // The grabbed point moves up in viewport space as content scrolls
    // down, so subtract the delta from the origin.
    const effOriginY = originY - scrollDelta;

    const x = Math.min(originX, lastX);
    const y = Math.min(effOriginY, lastY);
    const w = Math.abs(lastX - originX);
    const h = Math.abs(lastY - effOriginY);
    lasso.value = { x, y, w, h };

    applyIntersection({ left: x, top: y, right: x + w, bottom: y + h });
  };

  /** Find every `.item[data-index]` intersecting the rect, then fold
   *  with the base selection per the active modifier mode. */
  const applyIntersection = (rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }) => {
    let hit: Set<number>;
    if (opts.hitTest) {
      // Virtualized path (CH-1): compute hits by geometry so tiles that
      // have been recycled off-screen are still selectable.
      hit = new Set(opts.hitTest(rect));
    } else {
      // DOM-query path: intersect the live `.item` nodes (non-virtualized).
      const container = opts.getScrollContainer();
      if (!container) return;
      const items =
        container.querySelectorAll<HTMLElement>(".item[data-index]");
      hit = new Set<number>();
      items.forEach((el) => {
        if (el.classList.contains("header")) return;
        const b = el.getBoundingClientRect();
        // Any pixel overlap counts (locked spec).
        const intersects =
          b.left <= rect.right &&
          b.right >= rect.left &&
          b.top <= rect.bottom &&
          b.bottom >= rect.top;
        if (intersects) {
          const idx = Number(el.dataset.index);
          if (!Number.isNaN(idx)) hit.add(idx);
        }
      });
    }

    let final: number[];
    if (mode === "replace") {
      final = [...hit];
    } else if (mode === "add") {
      final = [...new Set([...baseSelection, ...hit])];
    } else {
      // toggle: items in the base XOR items currently hit
      const out = new Set(baseSelection);
      hit.forEach((i) => {
        if (out.has(i)) out.delete(i);
        else out.add(i);
      });
      final = [...out];
    }
    opts.setSelection(final);
  };

  // ── Auto-scroll near container edges ──────────────────────────────
  const updateAutoScroll = () => {
    const container = opts.getScrollContainer();
    if (!container) return;
    const r = container.getBoundingClientRect();
    const topDist = lastY - r.top;
    const bottomDist = r.bottom - lastY;

    let velocity = 0;
    if (topDist < EDGE_ZONE) {
      // Closer to the edge → faster. Negative = scroll up.
      velocity = -MAX_SCROLL_SPEED * (1 - Math.max(0, topDist) / EDGE_ZONE);
    } else if (bottomDist < EDGE_ZONE) {
      velocity = MAX_SCROLL_SPEED * (1 - Math.max(0, bottomDist) / EDGE_ZONE);
    }

    if (velocity !== 0) {
      startAutoScroll(velocity);
    } else {
      stopAutoScroll();
    }
  };

  let scrollVelocity = 0;
  const startAutoScroll = (velocity: number) => {
    scrollVelocity = velocity;
    if (rafId !== null) return; // loop already running
    const tick = () => {
      const container = opts.getScrollContainer();
      if (!container || !active.value || scrollVelocity === 0) {
        rafId = null;
        return;
      }
      container.scrollTop += scrollVelocity;
      // Re-evaluate the rect + selection against the new scroll offset
      // so holding still at the edge keeps extending the marquee.
      recompute();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };
  const stopAutoScroll = () => {
    scrollVelocity = 0;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  /** Tear-down hook for the owning component's onBeforeUnmount. */
  const cleanup = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    stopAutoScroll();
    document.body.style.userSelect = "";
  };

  return { lasso, active, onMouseDown, cleanup };
}
