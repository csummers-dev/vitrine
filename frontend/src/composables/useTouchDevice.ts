import { computed, type ComputedRef } from "vue";
import { useMediaQuery } from "@vueuse/core";

/**
 * useTouchDevice — the shared gate for Stage 7's touch gestures
 * (camera-roll upload, preview swipe, pull-to-refresh).
 *
 * Reports whether the device is genuinely TOUCH-CAPABLE, by actual
 * capability rather than viewport width (a deliberate departure from the
 * width-based `isMobile`): a narrow desktop window stays mouse-driven (so
 * we never hijack trackpad overscroll), while a wide tablet still gets
 * the gestures.
 *
 * Capability = a coarse primary pointer OR the presence of touch event
 * support / touch points. The `(pointer: coarse)` part is reactive via
 * `useMediaQuery`; the touch-point checks are static (they don't change
 * within a session). Returns a `ComputedRef<boolean>`.
 */
const hasTouchPoints =
  typeof window !== "undefined" &&
  ("ontouchstart" in window ||
    (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0));

export function useTouchDevice(): ComputedRef<boolean> {
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  return computed(() => coarsePointer.value || hasTouchPoints);
}
