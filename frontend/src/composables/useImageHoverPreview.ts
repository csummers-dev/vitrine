/**
 * useImageHoverPreview — singleton controller for the listing's
 * image hover-preview tooltip (v1.3 S5-9).
 *
 * Hovering an image row for 500 ms pops a small, size-capped preview
 * near the cursor. State is module-scoped (one tooltip at a time);
 * `ListingItem` rows call `schedule`/`cancel`, and a single
 * `<ImageHoverPreview>` component renders the floating overlay from
 * this shared state.
 *
 * Lifecycle handled here so rows stay dumb:
 *   - a 500 ms timer gates the show (no flicker on quick pass-overs)
 *   - while pending/visible we track the cursor (the overlay follows it)
 *   - any scroll dismisses it (the row it pointed at just moved)
 */
import { ref } from "vue";
import { files as api } from "@/api";

const HOVER_DELAY_MS = 500;

const visible = ref<boolean>(false);
const url = ref<string>("");
const alt = ref<string>("");
const cursorX = ref<number>(0);
const cursorY = ref<number>(0);

let timer: number | null = null;

const onMouseMove = (e: MouseEvent) => {
  cursorX.value = e.clientX;
  cursorY.value = e.clientY;
};

const onScroll = () => {
  // The pointed-at row just moved out from under the cursor — dismiss.
  doCancel();
};

const detachListeners = () => {
  document.removeEventListener("mousemove", onMouseMove);
  // capture:true so we also catch scrolls on the inner listing
  // container, not just the window.
  window.removeEventListener("scroll", onScroll, true);
};

const doCancel = () => {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  visible.value = false;
  detachListeners();
};

interface HoverTarget {
  /** API path used to build the preview URL. */
  path: string;
  /** Modified timestamp — part of the preview cache key. */
  modified: string;
  /** Filename, used as the img alt. */
  name: string;
}

const doSchedule = (target: HoverTarget, e: MouseEvent) => {
  doCancel(); // reset any in-flight timer / prior preview
  cursorX.value = e.clientX;
  cursorY.value = e.clientY;
  document.addEventListener("mousemove", onMouseMove);
  window.addEventListener("scroll", onScroll, true);
  timer = window.setTimeout(() => {
    timer = null;
    // "big" preview = aspect-preserving server resize (≤1080px), so the
    // download is bounded; the overlay further caps the DISPLAY size so
    // it never dominates the viewport.
    url.value = api.getPreviewURL(
      { path: target.path, modified: target.modified } as ResourceItem,
      "big"
    );
    alt.value = target.name;
    visible.value = true;
  }, HOVER_DELAY_MS);
};

export function useImageHoverPreview() {
  return {
    visible,
    url,
    alt,
    cursorX,
    cursorY,
    schedule: doSchedule,
    cancel: doCancel,
  };
}
