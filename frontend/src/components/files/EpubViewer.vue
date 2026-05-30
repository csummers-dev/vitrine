<template>
  <div class="epub-viewer">
    <vue-reader
      :location="location"
      :url="src"
      :get-rendition="captureRendition"
      :epubInitOptions="{ requestCredentials: true }"
      :epubOptions="{ allowPopups: true }"
      @update:location="$emit('update:location', $event)"
    />
    <div class="epub-viewer__size">
      <button
        type="button"
        class="epub-viewer__btn"
        :disabled="size <= 100"
        aria-label="Decrease font size"
        title="Decrease font size"
        @click="$emit('update:size', Math.max(100, size - 10))"
      >
        <Icon name="minus" :size="14" />
      </button>
      <span class="epub-viewer__pct tabular">{{ size }}%</span>
      <button
        type="button"
        class="epub-viewer__btn"
        :disabled="size >= 150"
        aria-label="Increase font size"
        title="Increase font size"
        @click="$emit('update:size', Math.min(150, size + 10))"
      >
        <Icon name="plus" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * EPUB viewer — wraps `vue-reader` with our font-size chip plus a
 * proper dark-mode theme that responds to live preference changes.
 *
 * Previously theme was applied once when the rendition mounted via
 * `getTheme()` from utils — meaning a user who toggled their theme
 * mid-book saw the book stay in the old palette until they navigated
 * away and back. Now we register both `light` and `dark` themes
 * inside the rendition (with full body + html background coverage)
 * and watch `document.documentElement.classList` for the `.dark`
 * marker that `useThemePreference` toggles. Theme switches live —
 * the user can flip Settings → Theme and see the book repaint.
 */
import Icon from "@/components/Icon.vue";
import { VueReader } from "vue-reader";
import type { Rendition } from "epubjs";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  src: string;
  location: number | string;
  size: number;
}>();

const emit = defineEmits<{
  (e: "update:location", v: number): void;
  (e: "update:size", v: number): void;
  /** Fired when the user presses ← / → inside the reader iframe so the
   *  parent can navigate between files (epubjs's iframe normally
   *  swallows keydowns, blocking the global preview nav). */
  (e: "navigatePrev"): void;
  (e: "navigateNext"): void;
}>();

const rendition = ref<Rendition | null>(null);

const isDarkNow = () => document.documentElement.classList.contains("dark");

/**
 * Apply the active app theme to the epubjs rendition via `themes.override`.
 *
 * Why override (not register + select): epubjs's `themes.register` +
 * `themes.select` writes a CSS rule into the iframe's <head>, but the
 * epub's own stylesheets — especially the body's intrinsic `background`
 * and `color` — frequently win on specificity. `themes.override` uses
 * the priority flag to inject `!important` declarations that reliably
 * beat the epub's own rules. This is the only API that consistently
 * recolors a previously-rendered chapter.
 */
const applyTheme = () => {
  const r = rendition.value;
  if (!r) return;
  if (isDarkNow()) {
    // Warmer near-black instead of pitch #18181b — easier on the eyes
    // for long reading sessions and matches the app's elevated dark
    // surface. Ink at zinc-200 (#e4e4e7) reads as cleanly off-white
    // without the raw-glare of pure #fff on dark.
    r.themes.override("color", "#e4e4e7", true);
    r.themes.override("background", "#1f1f23", true);
    r.themes.override("background-color", "#1f1f23", true);
  } else {
    r.themes.override("color", "#27272a", true);
    r.themes.override("background", "#ffffff", true);
    r.themes.override("background-color", "#ffffff", true);
  }
  r.themes.fontSize(`${props.size}%`);
};

/**
 * Forward arrow / escape keys from inside the reader iframe up to the
 * parent. Two routes:
 *
 *   1. Hook epubjs's own DOM event forwarding (`rendition.on("keydown")`).
 *      Works in theory but uses a `passive: true` listener so we can't
 *      preventDefault, and vue-reader *also* binds a separate `keyup`
 *      handler on the iframe document for in-book page turns.
 *   2. Attach a real `keydown` capture listener directly on every iframe
 *      document as it's rendered. This is the reliable path because (a)
 *      it's not passive so preventDefault works, and (b) we run BEFORE
 *      epubjs's own handlers, so we can stopImmediatePropagation if we
 *      want to suppress in-book page turns. We do BOTH so we cover the
 *      window in which the iframe is being torn down/rebuilt.
 *
 * Without this hook, focus snaps into the iframe on every `rendered`
 * (vue-reader calls `iframe.contentWindow.focus()` — line 155 of its
 * bundle), so the parent window never sees the keydown and file-to-file
 * arrow nav silently dies as soon as the user clicks into the book.
 */
const handleIframeKey = (event: KeyboardEvent) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopImmediatePropagation();
    emit("navigatePrev");
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    event.stopImmediatePropagation();
    emit("navigateNext");
  } else if (event.key === "Escape") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }
};

const installIframeKeyHandler = (r: Rendition) => {
  // Route 1: epubjs's DOM event forwarding (best-effort).
  r.on("keydown", (event: KeyboardEvent) => handleIframeKey(event));
  r.on("keyup", (event: KeyboardEvent) => {
    // vue-reader's in-book page-turn fires on keyup for arrows; if we
    // already handled the keydown for file nav, swallow the keyup too
    // so we don't simultaneously flip a page inside the book.
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown"
    ) {
      event.stopImmediatePropagation();
    }
  });
};

/**
 * Direct iframe-document hook. Vue-reader rebuilds the iframe per
 * chapter, so we have to re-attach on every `rendered`. Using capture
 * phase + non-passive so preventDefault is honored.
 */
const attachIframeKey = (view: { iframe?: HTMLIFrameElement } | null) => {
  const doc = view?.iframe?.contentDocument;
  if (!doc) return;
  doc.addEventListener("keydown", handleIframeKey as EventListener, true);
};

const captureRendition = (r: Rendition) => {
  rendition.value = r;
  applyTheme();
  // Re-apply theme each time a new chapter renders — `override` rules
  // need to be present BEFORE the iframe paints, but a brand-new view
  // can be created when the user turns pages. Also re-attach our
  // direct keydown listener since the iframe is fresh.
  r.on(
    "rendered",
    (_section: unknown, view: { iframe?: HTMLIFrameElement }) => {
      applyTheme();
      attachIframeKey(view);
    }
  );
  installIframeKeyHandler(r);
};

// React to font-size changes from parent without re-mounting the reader.
watch(
  () => props.size,
  (next) => rendition.value?.themes.fontSize(`${next}%`)
);

// Watch the <html> classList for `.dark` toggles. setTheme in
// useThemePreference REPLACES className (sets to "dark" or "light"), so
// every flip triggers an `attributes` mutation we can react to.
let themeObserver: MutationObserver | null = null;

onMounted(() => {
  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
});
</script>

<style scoped>
.epub-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}

.epub-viewer :deep(> div) {
  flex: 1;
}

/* Font-size chip — same chrome as the zoom controls in Image / PDF. */
.epub-viewer__size {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.12);
}

.epub-viewer__btn {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  border-radius: 4px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.epub-viewer__btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.epub-viewer__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.epub-viewer__pct {
  font-size: 11.5px;
  color: var(--color-ink-2, #52525b);
  padding: 0 4px;
  min-width: 36px;
  text-align: center;
  user-select: none;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

/* ── vue-reader chrome (dark mode) ────────────────────────────────────
   vue-reader hard-codes a white `.readerArea` background and a light
   gray `.tocArea`, so in dark mode the book sits inside a glaring
   white frame (the "large white border" the user noticed — the page
   text inside the iframe is themed dark, but the 50 px inset margins
   leave the white container visible). Repaint the chrome to the app
   canvas in dark mode so the reader feels integrated. */
.epub-viewer :deep(.readerArea) {
  background-color: #1f1f23 !important;
}
.epub-viewer :deep(.tocArea) {
  background: #18181b !important;
}
.epub-viewer :deep(.tocAreaButton) {
  color: #d4d4d8 !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}
.epub-viewer :deep(.tocAreaButton:hover) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.epub-viewer :deep(.tocAreaButton:active) {
  background: rgba(255, 255, 255, 0.1) !important;
}
.epub-viewer :deep(.tocButtonBar) {
  background: #71717a !important;
}
.epub-viewer :deep(.arrow) {
  color: #52525b !important;
}
.epub-viewer :deep(.arrow:hover:not(:disabled)) {
  color: #a1a1aa !important;
}
.epub-viewer :deep(.titleArea) {
  color: #71717a !important;
}

/* Light mode — keep the readerArea matching the app surface so the
   page-edge gutter doesn't pop visually against a tinted canvas. */
.epub-viewer :deep(.readerArea) {
  background-color: var(--color-surface, #fff) !important;
}
.epub-viewer :deep(.tocArea) {
  background: var(--color-elevated, #f4f4f5) !important;
}

/* Dark-mode overrides win because of source order — keep these last. */
html.dark .epub-viewer :deep(.readerArea) {
  background-color: #1f1f23 !important;
}
html.dark .epub-viewer :deep(.tocArea) {
  background: #18181b !important;
}
</style>
