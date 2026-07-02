/**
 * useBrandLogo — the theme-correct brand mark (v2.7.x).
 *
 * The logo comes in a light-mode and a dark-mode variant; this returns the
 * one matching the ACTIVE app theme. The source of truth is the `dark` class
 * on <html> (utils/theme.ts writes it from the user's preference, falling
 * back to the system scheme), watched with a MutationObserver — so the mark
 * flips instantly with the theme toggle, whoever flips it, and works on the
 * pre-login screen too.
 *
 * Module-singleton state: one observer for the whole app, safe to call from
 * both `<script setup>` components and Options-API module scope (no
 * lifecycle hooks involved).
 */
import { computed, ref } from "vue";
import { logoLightPngURL, logoDarkPngURL } from "@/utils/constants";

const isDark = ref(
  typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
);

if (typeof document !== "undefined" && "MutationObserver" in window) {
  new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains("dark");
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

const logoURL = computed(() =>
  isDark.value ? logoDarkPngURL : logoLightPngURL
);

export function useBrandLogo() {
  return { logoURL, isDark };
}
