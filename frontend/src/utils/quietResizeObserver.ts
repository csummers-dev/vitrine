import type { Directive } from "vue";

/**
 * RecycleScroller always renders vue-resize's hidden `<div class="resize-observer"
 * tabindex="-1">` inside itself. Inside the listing's `role="grid"` that
 * focusable div counts as a child the grid isn't allowed to have (axe:
 * aria-required-children), and it means nothing to a screen reader anyway.
 * `v-quiet-resize` on the scroller takes it out of the accessibility tree.
 * The div only watches its own size through an <object>, so dropping the
 * tabindex changes nothing it does.
 */
function quiet(el: HTMLElement) {
  for (const n of el.querySelectorAll<HTMLElement>(".resize-observer")) {
    n.removeAttribute("tabindex");
    n.setAttribute("aria-hidden", "true");
    n.querySelector("object")?.setAttribute("aria-hidden", "true");
  }
}

export const vQuietResize: Directive<HTMLElement> = {
  mounted: quiet,
  updated: quiet,
};
