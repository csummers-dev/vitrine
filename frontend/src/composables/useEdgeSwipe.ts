import { onBeforeUnmount, onMounted } from "vue";

/**
 * useEdgeSwipe — opens the mobile nav drawer when the user swipes inward from
 * the very left edge of the screen (the standard "reveal the drawer" gesture).
 *
 * Kept deliberately conservative so it never fights real content:
 *   • The touch must START within `edge` px of the left screen edge — content
 *     rarely lives in that sliver, so we don't hijack normal taps/scrolls.
 *   • The gesture must be predominantly HORIZONTAL (dx > dy) and travel at
 *     least `threshold` px before it fires — a vertical scroll cancels it.
 *   • `enabled()` gates the whole thing (touch device, drawer closed, logged
 *     in, narrow viewport) so it's inert on desktop and when a drawer already
 *     exists inline.
 *
 * Listeners are passive (we never preventDefault) so page scrolling stays
 * smooth and the browser's own back-swipe isn't disturbed.
 */
export function useEdgeSwipe(opts: {
  onOpen: () => void;
  enabled: () => boolean;
  /** Distance from the left edge (px) the touch must start within. */
  edge?: number;
  /** Horizontal distance (px) the swipe must travel to fire. */
  threshold?: number;
}) {
  const edge = opts.edge ?? 24;
  const threshold = opts.threshold ?? 60;

  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || !opts.enabled()) {
      tracking = false;
      return;
    }
    const t = e.touches[0];
    if (t.clientX > edge) {
      tracking = false;
      return;
    }
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // Vertical intent → this is a scroll, not a drawer swipe.
    if (Math.abs(dy) > Math.abs(dx)) {
      tracking = false;
      return;
    }
    if (dx > threshold) {
      tracking = false;
      opts.onOpen();
    }
  };

  const onTouchEnd = () => {
    tracking = false;
  };

  onMounted(() => {
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  });

  onBeforeUnmount(() => {
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("touchcancel", onTouchEnd);
  });
}
