import { computed, ref, watch, type Ref, type ComputedRef } from "vue";

interface PullToRefreshOptions {
  /** The element that actually scrolls. Reactive so the listing can swap
   *  it on view-mode change (list → RecycleScroller, grid/gallery →
   *  <section>) and we re-bind listeners. */
  el: Ref<HTMLElement | null>;
  /** Gate: only arm the gesture when this is true (touch device, not
   *  loading, no selection/drag in progress, etc.). */
  enabled: () => boolean;
  /** Called when a pull past threshold is released. Should return a
   *  promise that resolves when the refresh is visibly done, so the
   *  spinner stays up for the duration. */
  onRefresh: () => void | Promise<void>;
  /** Pull distance (px) that triggers a refresh on release. */
  threshold?: number;
}

/**
 * usePullToRefresh — overscroll-at-top pull-to-refresh for a scroll
 * container (v1.3 S7-1). Touch only.
 *
 * Binds touch listeners to `el` (re-binding when it changes). The
 * touchmove listener is intentionally NON-passive so it can
 * `preventDefault` — but ONLY while a genuine pull is in progress at the
 * very top of the container; the rest of the time it does nothing, so
 * native scrolling is never janked. A rubber-band damping keeps the
 * indicator from tracking the finger 1:1.
 */
export function usePullToRefresh(options: PullToRefreshOptions): {
  refreshing: Ref<boolean>;
  distance: Ref<number>;
  pulling: Ref<boolean>;
  active: ComputedRef<boolean>;
  offset: ComputedRef<number>;
  opacity: ComputedRef<number>;
  rotation: ComputedRef<number>;
} {
  const threshold = options.threshold ?? 64;
  const maxPull = threshold * 1.6;

  const distance = ref(0); // damped pull distance in px
  const refreshing = ref(false);
  const pulling = ref(false); // finger down + actively dragging the pull

  let startY = 0;
  let tracking = false; // a pull (at the top) is underway

  const reset = () => {
    tracking = false;
    pulling.value = false;
    distance.value = 0;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (refreshing.value || !options.enabled()) return;
    const el = options.el.value;
    if (!el || el.scrollTop > 0 || e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    tracking = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking) return;
    const el = options.el.value;
    if (!el) return reset();

    const dy = e.touches[0].clientY - startY;
    // Pulling up, or the container scrolled away from the top → hand back
    // to native scroll.
    if (dy <= 0 || el.scrollTop > 0) return reset();

    // Genuine downward pull at the top: take over. Damp it (rubber band).
    pulling.value = true;
    distance.value = Math.min(maxPull, dy * 0.5);
    if (e.cancelable) e.preventDefault();
  };

  const onTouchEnd = () => {
    if (!tracking) return;
    tracking = false;
    pulling.value = false; // released → allow the snap-back to animate
    if (distance.value >= threshold && options.enabled()) {
      void trigger();
    } else {
      distance.value = 0;
    }
  };

  const trigger = async () => {
    refreshing.value = true;
    distance.value = threshold; // hold the spinner at the threshold line
    try {
      await options.onRefresh();
    } finally {
      refreshing.value = false;
      distance.value = 0;
    }
  };

  // (Re)bind listeners whenever the active scroll element changes.
  watch(
    options.el,
    (el, _old, onCleanup) => {
      if (!el) return;
      // touchstart/end are passive; touchmove is non-passive so we can
      // preventDefault during a pull (and only then).
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", onTouchEnd, { passive: true });
      onCleanup(() => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
        reset();
      });
    },
    { immediate: true }
  );

  return {
    refreshing,
    distance,
    pulling,
    active: computed(() => refreshing.value || distance.value > 0),
    offset: computed(() => (refreshing.value ? threshold : distance.value)),
    opacity: computed(() =>
      refreshing.value ? 1 : Math.min(1, distance.value / threshold)
    ),
    rotation: computed(() => (refreshing.value ? 0 : distance.value * 3)),
  };
}
