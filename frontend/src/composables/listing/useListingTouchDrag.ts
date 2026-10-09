/**
 * Touch drag-and-drop for the listing. HTML5 drag events never fire on touch,
 * so one pointer-based gesture drives the same move pipeline as the mouse.
 * Extracted from FileListing.vue (4.0 Phase 1) with no behavior change.
 */
import type { Ref } from "vue";
import { useTouchDrag } from "@/composables/useTouchDrag";
import { useFileStore } from "@/stores/file";
import { resolveRowDropMode } from "@/utils/dropZone";

export interface ListingTouchDragDeps {
  /** The current folder's url, the destination of an "alongside" drop. */
  currentFolderUrl: Readonly<Ref<string>>;
  /** The element that actually scrolls (list recycler or grid section). */
  scrollEl: () => HTMLElement | null | undefined;
  navigate: (path: string) => void;
  performDrop: (event: DragEvent, destination: string) => Promise<unknown>;
}

export function useListingTouchDrag(deps: ListingTouchDragDeps) {
  const fileStore = useFileStore();

  // ── Touch drag-and-drop (lifted from ListingItem, CH-2) ─────────────
  // HTML5 DnD never fires on touch, so a single pointer-based gesture
  // drives the SAME move pipeline (`useDropTarget.performDrop`) — conflict
  // prompt, self-drop guard, transfer indicator. This used to be one
  // useTouchDrag instance PER row; hoisting it here means the listing owns
  // exactly one regardless of how many rows are mounted. Rows forward their
  // pointerdown via the `rowPointerDown` event (mouse pointers are ignored
  // inside the composable, so desktop is untouched). Drop targets are any
  // element carrying `data-drop-url` — folder rows, breadcrumb segments,
  // and the current-folder area.
  let touchHighlightEl: HTMLElement | null = null;
  let touchSpringUrl: string | null = null;
  let touchSpringTimer: number | null = null;
  // Destination the in-flight touch drop will resolve to, cached on every
  // onMove so onDrop matches EXACTLY what was highlighted (the same robustness as
  // the desktop cached-into-zone fix). A folder url when over a folder's tight
  // into-zone (or a dedicated breadcrumb / current-folder target); the current
  // folder ("alongside") when over a folder row OUTSIDE its into-zone; null when
  // over nothing droppable (→ no-op drop).
  let touchDropUrl: string | null = null;

  const clearTouchHighlight = () => {
    if (touchHighlightEl) {
      touchHighlightEl.style.outline = "";
      touchHighlightEl.style.outlineOffset = "";
      touchHighlightEl = null;
    }
  };
  const cancelTouchSpring = () => {
    if (touchSpringTimer !== null) {
      window.clearTimeout(touchSpringTimer);
      touchSpringTimer = null;
    }
    touchSpringUrl = null;
  };
  const resolveDropEl = (el: Element | null): HTMLElement | null =>
    (el?.closest?.("[data-drop-url]") as HTMLElement | null) ?? null;

  const listingTouchDrag = useTouchDrag<{ index: number }>({
    // The ghost is created before onStart runs (so draggedItems isn't
    // populated yet for this gesture); read the pressed row's name straight
    // off the listing for the single-item label, matching the old per-row
    // behavior. Multi-select uses the snapshot count once it exists.
    ghostLabel: (p) => {
      const c = fileStore.draggedItems.length;
      if (c > 1) return `${c} items`;
      return fileStore.req?.items[p.index]?.name ?? "";
    },
    // Edge auto-scroll during a touch drag targets the ACTUAL scroll
    // container (the recycler in list view, the <section> in grid/gallery) —
    // resolved by the caller — rather than #listing, which isn't the scroller.
    scrollEl: () => deps.scrollEl(),
    onStart: (p) => fileStore.snapshotDragSelection(p.index),
    onMove: (_p, x, y, el) => {
      const raw = resolveDropEl(el);
      const isFolderRow =
        !!raw &&
        raw.classList.contains("item") &&
        raw.getAttribute("data-dir") === "true";
      // Parity with desktop: a folder ROW is an into-folder target ONLY when the
      // finger is in its tight icon+name into-zone. Outside that the drop goes
      // "alongside" into the current folder, so don't highlight/spring the folder.
      // Dedicated drop targets (breadcrumb segments, the current-folder area)
      // aren't `.item` rows and keep their whole-element target.
      const inIntoZone =
        isFolderRow && resolveRowDropMode(raw!, x, y) === "into";
      const highlightEl = isFolderRow ? (inIntoZone ? raw : null) : raw;

      if (highlightEl !== touchHighlightEl) {
        clearTouchHighlight();
        if (highlightEl) {
          highlightEl.style.outline = "2px solid var(--color-accent, #6e72d9)";
          highlightEl.style.outlineOffset = "-2px";
          touchHighlightEl = highlightEl;
        }
      }

      // Cache where this drop resolves: the highlighted target's url, else the
      // current folder for a folder row we're not "into" ("alongside"), else null.
      if (highlightEl) {
        touchDropUrl = highlightEl.dataset.dropUrl ?? null;
      } else if (isFolderRow) {
        touchDropUrl = deps.currentFolderUrl.value || null;
      } else {
        touchDropUrl = null;
      }

      // Spring-load: hovering a folder row's into-zone (not the current folder)
      // for 2s drills into it so nested drops are possible (F6 parity).
      const springUrl = inIntoZone ? (raw!.dataset.dropUrl ?? null) : null;
      if (springUrl && springUrl !== fileStore.req?.url) {
        if (touchSpringUrl !== springUrl) {
          cancelTouchSpring();
          touchSpringUrl = springUrl;
          touchSpringTimer = window.setTimeout(() => {
            touchSpringTimer = null;
            deps.navigate(springUrl);
          }, 2000);
        }
      } else {
        cancelTouchSpring();
      }
    },
    onDrop: () => {
      cancelTouchSpring();
      clearTouchHighlight();
      // Use the destination cached during onMove so the drop lands exactly where
      // it was highlighted (no fresh recompute). null = released over nothing
      // droppable → no-op.
      const dest = touchDropUrl;
      touchDropUrl = null;
      if (!dest) return;
      // Touch has no Ctrl/Cmd → always a move. performDrop reads the
      // snapshot from fileStore.draggedItems and applies all the usual guards
      // (incl. the from===to short-circuit, so an "alongside" drop is a no-op).
      const synthetic = {
        preventDefault: () => {},
        ctrlKey: false,
        metaKey: false,
      } as unknown as DragEvent;
      void deps.performDrop(synthetic, dest);
    },
    onEnd: () => {
      cancelTouchSpring();
      clearTouchHighlight();
      touchDropUrl = null;
      fileStore.draggedItems = [];
      // Swallow the synthetic click the browser fires on the drop row.
      fileStore.suppressClicksUntil = Date.now() + 350;
    },
  });

  // Forwarded from each row's pointerdown (after the row's own read-only +
  // interactive-child guard). Mouse pointers are ignored inside the gesture.
  const onItemPointerDown = (event: PointerEvent, index: number) => {
    listingTouchDrag.onPointerDown(event, { index });
  };

  return { listingTouchDrag, onItemPointerDown };
}
