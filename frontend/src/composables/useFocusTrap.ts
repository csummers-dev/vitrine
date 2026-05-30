import { nextTick, watch, type Ref } from "vue";

/**
 * Focus trap + focus restoration for modal-style overlays.
 *
 * On activation:
 *   1. Remembers the currently-focused element (the overlay's "opener").
 *   2. Moves focus into the overlay container — either onto an element
 *      flagged with `data-autofocus`, or the first focusable descendant,
 *      or the container itself if it accepts focus (`tabindex="-1"`).
 *   3. Installs a window-level keydown listener that intercepts Tab /
 *      Shift+Tab and cycles focus within the container.
 *
 * On deactivation: restores focus to the opener (if it's still in the
 * DOM and focusable) and removes the keydown listener.
 *
 * Why a composable (not a generic library): the app's overlays are all
 * shaped slightly differently (palette has an input, drawer can host
 * any sidebar markup, shortcuts overlay is just a static card), so each
 * one wires its own ref. A single shared `useFocusTrap(ref, openRef)`
 * call covers all of them without a wrapper component.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const isVisible = (el: HTMLElement): boolean => {
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
};

const collectFocusable = (root: HTMLElement): HTMLElement[] => {
  const list = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return list.filter(isVisible);
};

export function useFocusTrap(
  container: Ref<HTMLElement | null>,
  isActive: Ref<boolean>
) {
  let previouslyFocused: HTMLElement | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const root = container.value;
    if (!root) return;
    const focusables = collectFocusable(root);
    if (focusables.length === 0) {
      // Nothing to focus inside; keep focus on the container itself.
      event.preventDefault();
      root.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // Only intercept when the cycle would leave the container.
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const activate = async () => {
    previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    await nextTick();
    const root = container.value;
    if (!root) return;
    // Prefer an element explicitly marked as the autofocus target.
    const explicit = root.querySelector<HTMLElement>("[data-autofocus]");
    const target = explicit ?? collectFocusable(root)[0] ?? root;
    target.focus();
    keydownHandler = onKeydown;
    window.addEventListener("keydown", keydownHandler, true);
  };

  const deactivate = () => {
    if (keydownHandler) {
      window.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = null;
    }
    if (previouslyFocused && document.contains(previouslyFocused)) {
      try {
        previouslyFocused.focus();
      } catch {
        /* element refused focus — nothing to do */
      }
    }
    previouslyFocused = null;
  };

  watch(
    () => isActive.value,
    (open) => {
      if (open) {
        activate();
      } else {
        deactivate();
      }
    },
    { immediate: true }
  );
}
