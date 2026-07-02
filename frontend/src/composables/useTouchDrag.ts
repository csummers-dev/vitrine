import { ref, type Ref } from "vue";

/**
 * Long-press-to-drag for touch (and pen) input, built on Pointer Events.
 *
 * Why this exists: the app's drag interactions (favorites reorder, moving
 * files/folders in the listing) use the HTML5 Drag-and-Drop API, which never
 * fires on touch devices. This composable provides the missing gesture:
 *
 *   • press & hold (~holdMs) on a draggable element to "pick it up";
 *   • a normal swipe before the hold fires is left alone, so the list still
 *     scrolls;
 *   • once elevated, a floating ghost follows the finger, the element under
 *     the finger is reported (for drop-target highlighting), and the page is
 *     prevented from scrolling until release.
 *
 * Mouse input is intentionally ignored here — desktop keeps using native
 * HTML5 DnD, so there's no behavior change with a mouse.
 *
 * The composable is deliberately generic: it owns the gesture mechanics and
 * reports coordinates + the element under the pointer; the caller decides
 * what a drop target is and what dropping does (reorder, move, etc.).
 */

export interface TouchDragOptions<T> {
  /** Hold duration before a drag begins (ms). Default 380. */
  holdMs?: number;
  /** Movement (px) before the hold fires that cancels it as a scroll. Default 10. */
  moveCancel?: number;
  /** Label for the floating ghost chip. Omit for no chip. */
  ghostLabel?: (payload: T) => string;
  /** Scrollable container for edge auto-scroll while dragging. */
  scrollEl?: () => HTMLElement | null | undefined;
  /** Fired once the long-press elevates into an active drag. */
  onStart?: (payload: T) => void;
  /** Fired on every move while dragging, with the element under the finger. */
  onMove?: (payload: T, x: number, y: number, el: Element | null) => void;
  /** Fired on release while dragging — commit the drop here. */
  onDrop?: (payload: T, x: number, y: number, el: Element | null) => void;
  /** Always fired when the gesture ends (drop or cancel) — clean up state here. */
  onEnd?: (payload: T) => void;
}

export interface TouchDragHandle<T> {
  /** Attach to a draggable element's @pointerdown. */
  onPointerDown: (event: PointerEvent, payload: T) => void;
  /** True once the gesture has elevated into an active drag. */
  dragging: Ref<boolean>;
}

const EDGE = 56; // px from a container edge where auto-scroll kicks in
const EDGE_SPEED = 12; // px per frame at the very edge

export function useTouchDrag<T>(opts: TouchDragOptions<T>): TouchDragHandle<T> {
  const holdMs = opts.holdMs ?? 380;
  const moveCancel = opts.moveCancel ?? 10;

  const dragging = ref(false);
  let payload: T | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let holdTimer: number | null = null;
  let ghost: HTMLElement | null = null;
  let raf: number | null = null;

  const clearHold = () => {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  // Block native scrolling while a drag is active (pointermove preventDefault
  // alone is unreliable on iOS; a non-passive touchmove handler is not).
  const blockScroll = (e: TouchEvent) => e.preventDefault();

  const stopAutoScroll = () => {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };

  const autoScrollTick = () => {
    raf = null;
    const el = opts.scrollEl?.();
    if (!el || !dragging.value) return;
    const rect = el.getBoundingClientRect();
    let dy = 0;
    if (lastY < rect.top + EDGE) {
      dy = -EDGE_SPEED * (1 - (lastY - rect.top) / EDGE);
    } else if (lastY > rect.bottom - EDGE) {
      dy = EDGE_SPEED * (1 - (rect.bottom - lastY) / EDGE);
    }
    if (dy !== 0) {
      el.scrollTop += dy;
    }
    raf = requestAnimationFrame(autoScrollTick);
  };

  const positionGhost = () => {
    if (!ghost) return;
    ghost.style.left = `${lastX}px`;
    ghost.style.top = `${lastY}px`;
  };

  const createGhost = () => {
    if (!opts.ghostLabel || payload === null) return;
    const el = document.createElement("div");
    el.textContent = opts.ghostLabel(payload);
    el.setAttribute("aria-hidden", "true");
    // Inline styles — a composable can't ship scoped CSS. Mirrors the
    // accent-chip look used elsewhere; pointer-events:none so it never
    // occludes elementFromPoint hit-testing.
    Object.assign(el.style, {
      position: "fixed",
      left: `${lastX}px`,
      top: `${lastY}px`,
      transform: "translate(-50%, -130%)",
      zIndex: "99999",
      pointerEvents: "none",
      padding: "6px 10px",
      borderRadius: "8px",
      maxWidth: "60vw",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      fontSize: "13px",
      fontWeight: "600",
      color: "#fff",
      background: "var(--color-accent, #6e72d9)",
      boxShadow: "0 8px 24px -6px rgba(0,0,0,0.35)",
      opacity: "0.95",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    ghost = el;
  };

  const elementUnder = (x: number, y: number): Element | null => {
    // Ghost is pointer-events:none, so it's already ignored.
    return document.elementFromPoint(x, y);
  };

  const beginDrag = () => {
    if (payload === null) return;
    dragging.value = true;
    document.addEventListener("touchmove", blockScroll, { passive: false });
    createGhost();
    if (typeof navigator.vibrate === "function") navigator.vibrate(8);
    opts.onStart?.(payload);
    opts.onMove?.(payload, lastX, lastY, elementUnder(lastX, lastY));
    if (opts.scrollEl) autoScrollTick();
  };

  const cleanup = () => {
    clearHold();
    stopAutoScroll();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    document.removeEventListener("touchmove", blockScroll);
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    const p = payload;
    const wasDragging = dragging.value;
    dragging.value = false;
    payload = null;
    if (wasDragging && p !== null) opts.onEnd?.(p);
  };

  const onPointerMove = (e: PointerEvent) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!dragging.value) {
      // Still in the pre-hold window: a real move means the user is
      // scrolling, not dragging — abort the long-press.
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > moveCancel) cleanup();
      return;
    }
    e.preventDefault();
    positionGhost();
    if (payload !== null) {
      opts.onMove?.(payload, lastX, lastY, elementUnder(lastX, lastY));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (dragging.value && payload !== null) {
      opts.onDrop?.(
        payload,
        e.clientX,
        e.clientY,
        elementUnder(e.clientX, e.clientY)
      );
    }
    cleanup();
  };

  const onPointerCancel = () => cleanup();

  const onPointerDown = (event: PointerEvent, p: T) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    // Reset any stale gesture.
    cleanup();
    payload = p;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    holdTimer = window.setTimeout(beginDrag, holdMs);
  };

  return { onPointerDown, dragging };
}
