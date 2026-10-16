import { readonly, ref } from "vue";

/**
 * The window's width, shared and reactive (one resize listener for the whole
 * app). For layout decisions CSS can't make on its own, such as which
 * component to render.
 */
const width = ref(typeof window === "undefined" ? 1440 : window.innerWidth);
let listening = false;

export function useWindowWidth() {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("resize", () => {
      width.value = window.innerWidth;
    });
  }
  return readonly(width);
}
