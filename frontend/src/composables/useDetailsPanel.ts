import { computed, ref } from "vue";
import { usePreferences } from "@/composables/usePreferences";

/**
 * The details panel's open state and layout (Phase 6, 4.5; Decision 7).
 *
 * - 1100 px and wider it sits beside the list ("docked"). Its open state is
 *   remembered (`details.open`); before the user has ever toggled it, it is
 *   open on screens 1280 px and wider and closed below.
 * - From 768 to 1099 px it opens over the list with a scrim ("overlay").
 * - Under 768 px it is a bottom sheet ("sheet").
 *
 * Overlay and sheet are opened on demand and never remembered: a panel that
 * came back on its own would cover the list on the next visit.
 */

export const DETAILS_OPEN_PREF = "details.open";
export const DETAILS_DOCK_MIN = 1100;
export const DETAILS_DEFAULT_OPEN_MIN = 1280;
export const DETAILS_SHEET_MAX = 767;

export type DetailsMode = "docked" | "overlay" | "sheet";

export function detailsModeFor(width: number): DetailsMode {
  if (width <= DETAILS_SHEET_MAX) return "sheet";
  if (width < DETAILS_DOCK_MIN) return "overlay";
  return "docked";
}

/** Whether the panel shows, from the window width and the saved choice. */
export function resolveDetailsOpen(opts: {
  width: number;
  saved: boolean | undefined;
  transient: boolean;
}): boolean {
  if (detailsModeFor(opts.width) !== "docked") return opts.transient;
  if (typeof opts.saved === "boolean") return opts.saved;
  return opts.width >= DETAILS_DEFAULT_OPEN_MIN;
}

const width = ref(typeof window === "undefined" ? 1440 : window.innerWidth);
const transient = ref(false);
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("resize", () => {
    const before = detailsModeFor(width.value);
    width.value = window.innerWidth;
    // Crossing into another layout closes an overlay or sheet left open.
    if (detailsModeFor(width.value) !== before) transient.value = false;
  });
}

export function useDetailsPanel() {
  listen();
  const prefs = usePreferences();

  const saved = () => {
    const v = prefs.get<boolean | null>(DETAILS_OPEN_PREF, null);
    return typeof v === "boolean" ? v : undefined;
  };
  const mode = computed<DetailsMode>(() => detailsModeFor(width.value));
  const isOpen = computed(() =>
    resolveDetailsOpen({
      width: width.value,
      saved: saved(),
      transient: transient.value,
    })
  );

  const setOpen = (open: boolean) => {
    if (mode.value === "docked") void prefs.set(DETAILS_OPEN_PREF, open);
    else transient.value = open;
  };

  return {
    mode,
    isOpen,
    toggle: () => setOpen(!isOpen.value),
    show: () => setOpen(true),
    hide: () => setOpen(false),
  };
}

/** Tests only. */
export function __setDetailsWidth(w: number): void {
  width.value = w;
  transient.value = false;
}
