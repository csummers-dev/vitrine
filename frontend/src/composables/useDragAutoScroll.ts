/**
 * Gentle edge auto-scroll while dragging with a mouse (HTML5 drag), so deep
 * drops are reachable without letting go. Touch drags already auto-scroll in
 * useTouchDrag. Extracted from FileListing.vue (4.0 Phase 1).
 */
export function useDragAutoScroll(
  scrollEl: () => HTMLElement | null | undefined
) {
  // HTML5 (mouse) drag edge auto-scroll. Touch drag already auto-scrolls via
  // useTouchDrag; this brings the same behavior to mouse dragging so that
  // dragging a row (or OS files) toward the top/bottom edge gently scrolls the
  // listing — making deep drops reachable without letting go. Targets the real
  // scroll container (the recycler in list view, the <section> in grid/gallery)
  // via `scrollEl`, matching the touch path. Speed is intentionally gentler
  // than touch ("not too quickly").
  const DRAG_EDGE = 56; // px from an edge where auto-scroll engages
  const DRAG_EDGE_SPEED = 8; // max px/frame (vs touch's 12)
  let dragScrollY = 0; // latest pointer Y during a drag
  let dragScrollDir = 0; // -1 = up, +1 = down, 0 = idle
  let dragScrollRaf: number | null = null;

  const dragScrollTick = () => {
    dragScrollRaf = null;
    const el = scrollEl();
    if (!el || dragScrollDir === 0) return;
    const rect = el.getBoundingClientRect();
    // How far the pointer is *into* the edge band → proportional speed ramp,
    // so it eases in near the boundary and tops out at DRAG_EDGE_SPEED.
    // Clamp the "into the band" depth to DRAG_EDGE so the speed never exceeds
    // DRAG_EDGE_SPEED — the pointer can sit *past* the edge (over the header
    // above the list / a bar below it), which would otherwise ramp dy beyond the
    // cap and scroll faster than the intended gentle pace.
    let dy = 0;
    if (dragScrollDir < 0) {
      const into = Math.min(DRAG_EDGE, DRAG_EDGE - (dragScrollY - rect.top));
      if (into > 0) dy = -Math.ceil((into / DRAG_EDGE) * DRAG_EDGE_SPEED);
    } else {
      const into = Math.min(DRAG_EDGE, DRAG_EDGE - (rect.bottom - dragScrollY));
      if (into > 0) dy = Math.ceil((into / DRAG_EDGE) * DRAG_EDGE_SPEED);
    }
    if (dy !== 0) {
      el.scrollTop += dy;
      dragScrollRaf = requestAnimationFrame(dragScrollTick);
    } else {
      dragScrollDir = 0;
    }
  };

  const onDragScrollOver = (event: DragEvent) => {
    const el = scrollEl();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragScrollY = event.clientY;
    // Only engage when the pointer is horizontally over the scroll area, so a
    // drag across the sidebar/info-pane doesn't scroll the listing.
    const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
    let dir = 0;
    if (insideX) {
      if (dragScrollY < rect.top + DRAG_EDGE) dir = -1;
      else if (dragScrollY > rect.bottom - DRAG_EDGE) dir = 1;
    }
    dragScrollDir = dir;
    if (dir !== 0 && dragScrollRaf === null) {
      dragScrollRaf = requestAnimationFrame(dragScrollTick);
    }
  };

  const stopDragScroll = () => {
    dragScrollDir = 0;
    if (dragScrollRaf !== null) {
      cancelAnimationFrame(dragScrollRaf);
      dragScrollRaf = null;
    }
  };

  return { onDragScrollOver, stopDragScroll, DRAG_EDGE, DRAG_EDGE_SPEED };
}
