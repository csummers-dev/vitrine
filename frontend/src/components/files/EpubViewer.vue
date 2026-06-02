<template>
  <div
    ref="rootEl"
    class="epub-viewer"
    :class="{ 'epub-viewer--dark': dark }"
    tabindex="-1"
  >
    <!--
      openAs: 'epub' is REQUIRED, do not remove. The `src` carries a
      `?auth=<JWT>` query (RC-44, so the request authenticates). epub.js
      sniffs the file type from the URL extension, but it re-appends the
      query string before parsing — and a JWT's dots (header.payload.sig)
      make it read the "extension" as the JWT's last segment instead of
      "epub". It then misclassifies the book as an unpacked directory and
      fails with "Error loading book". Forcing openAs:'epub' skips the
      sniff and loads the authenticated URL as a packaged epub.
    -->
    <vue-reader
      :location="location"
      :url="src"
      :get-rendition="captureRendition"
      :epubInitOptions="{ requestCredentials: true, openAs: 'epub' }"
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
  /** Effective book theme, resolved by the parent (app theme + the reader's
   *  per-book override). Drives both the in-iframe text colors and the
   *  surrounding reader chrome. */
  dark: boolean;
}>();

const emit = defineEmits<{
  (e: "update:location", v: number): void;
  (e: "update:size", v: number): void;
  /** Fired when the user presses ← / → inside the reader iframe so the
   *  parent can navigate between files (epubjs's iframe normally
   *  swallows keydowns, blocking the global preview nav). */
  (e: "navigatePrev"): void;
  (e: "navigateNext"): void;
  /** Book table-of-contents, flattened with depth (v1.3 S5-5). Emitted
   *  once the navigation document loads so the info-rail can render a
   *  clickable chapter list. */
  (e: "toc", entries: EpubTocEntry[]): void;
  /** Current chapter href on each relocate, for active-row highlight. */
  (e: "chapter", href: string): void;
  /** Cover-image blob URL once the book metadata resolves, so the
   *  info-rail can show the book's cover art (empty if the epub has none). */
  (e: "cover", url: string): void;
}>();

/** One flattened TOC row. `depth` drives indentation (subchapters). */
export interface EpubTocEntry {
  label: string;
  href: string;
  depth: number;
}

const rendition = ref<Rendition | null>(null);
const rootEl = ref<HTMLElement | null>(null);

/** Flatten epubjs's nested toc (items + subitems) into a depth-tagged
 *  list the info-rail can render without recursion. */
const flattenToc = (
  items: { label?: string; href?: string; subitems?: unknown[] }[],
  depth = 0,
  out: EpubTocEntry[] = []
): EpubTocEntry[] => {
  for (const it of items) {
    if (it.href) {
      out.push({ label: (it.label || "").trim(), href: it.href, depth });
    }
    if (Array.isArray(it.subitems) && it.subitems.length) {
      flattenToc(it.subitems as typeof items, depth + 1, out);
    }
  }
  return out;
};

/** Jump to a TOC entry's href. Exposed for the info-rail click handler. */
const goTo = (href: string) => {
  rendition.value?.display(href);
};
// Page-turn within the book — driven by ↑/↓ from the parent (←/→ stay
// reserved for file-to-file navigation). epubjs prev()/next() flip one
// rendered page (or spread) in the current flow.
const nextPage = () => {
  rendition.value?.next();
};
const prevPage = () => {
  rendition.value?.prev();
};
defineExpose({ goTo, nextPage, prevPage });

/**
 * Apply the active book theme to the epubjs rendition via `themes.override`.
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
  if (props.dark) {
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
// A single physical arrow press delivers BOTH keydown and keyup, and may
// arrive via both epubjs's rendition hook and our direct document listener.
// We always suppress the in-iframe default (so the book doesn't page-turn on
// top of us), but only ACT once per press via a short dedupe window. epubjs
// forwards keyUP most reliably (the documented page-turn hook); keydown is
// less consistent across versions — so we navigate on whichever lands first.
let lastArrowTs = 0;
const ARROW_DEDUPE_MS = 350;

const handleIframeKey = (event: KeyboardEvent) => {
  const k = event.key;
  const isArrow =
    k === "ArrowLeft" ||
    k === "ArrowRight" ||
    k === "ArrowUp" ||
    k === "ArrowDown";

  if (isArrow) {
    // Always stop epubjs / vue-reader's own page-turn (it fires on keydown
    // AND keyup) so the book doesn't move in addition to our action.
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastArrowTs < ARROW_DEDUPE_MS) return; // already acted this press
    lastArrowTs = now;
    // ←/→ change files (emit up to Preview); ↑/↓ turn pages within the book.
    if (k === "ArrowLeft") emit("navigatePrev");
    else if (k === "ArrowRight") emit("navigateNext");
    else if (k === "ArrowDown") nextPage();
    else if (k === "ArrowUp") prevPage();
    return;
  }

  if (k === "Escape") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }
};

const installIframeKeyHandler = (r: Rendition) => {
  // epubjs forwards the iframe's keyboard events to the rendition emitter.
  // Route BOTH keydown and keyup through handleIframeKey — keyup is the
  // reliable one across epubjs versions, keydown the snappier one; the
  // dedupe window means a keydown+keyup pair still navigates only once.
  r.on("keydown", (event: KeyboardEvent) => handleIframeKey(event));
  r.on("keyup", (event: KeyboardEvent) => handleIframeKey(event));
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
  doc.addEventListener("keyup", handleIframeKey as EventListener, true);
};

/**
 * Route 3 — the reliable one. Rather than depend on epubjs's `rendered`
 * event exposing a usable `view.iframe.contentDocument` (which proved
 * flaky — when it doesn't, focus stays trapped in the book iframe and ALL
 * arrows die), we watch the viewer subtree for iframes and attach the
 * capture-phase keydown listener directly to each iframe's document. We
 * dedupe per-document (epubjs swaps the doc when turning chapters) and per-
 * iframe (so the `load` re-hook is registered once). A handful of timed
 * retries cover the async gap between the iframe appearing and its document
 * being navigable.
 */
const wiredDocs = new WeakSet<Document>();
const hookedIframes = new WeakSet<HTMLIFrameElement>();

const wireIframeDoc = (ifr: HTMLIFrameElement) => {
  let doc: Document | null = null;
  try {
    doc = ifr.contentDocument;
  } catch {
    return; // cross-origin (shouldn't happen for our same-origin iframes)
  }
  if (!doc || wiredDocs.has(doc)) return;
  doc.addEventListener("keydown", handleIframeKey as EventListener, true);
  doc.addEventListener("keyup", handleIframeKey as EventListener, true);
  wiredDocs.add(doc);
};

const wireIframes = () => {
  const root = rootEl.value;
  if (!root) return;
  root.querySelectorAll("iframe").forEach((ifr) => {
    wireIframeDoc(ifr);
    if (!hookedIframes.has(ifr)) {
      // epubjs reloads the iframe's document per chapter — re-wire the
      // fresh document each time it loads.
      ifr.addEventListener("load", () => wireIframeDoc(ifr));
      hookedIframes.add(ifr);
    }
  });
};

let iframeObserver: MutationObserver | null = null;

const captureRendition = (r: Rendition) => {
  rendition.value = r;
  applyTheme();

  // S5-5: surface the book's TOC to the parent once the navigation
  // document resolves, and report the current chapter on each relocate
  // so the info-rail can highlight the active row.
  r.book.loaded.navigation
    .then((nav: { toc?: unknown[] }) => {
      emit(
        "toc",
        flattenToc((nav.toc as Parameters<typeof flattenToc>[0]) ?? [])
      );
    })
    .catch(() => {
      /* no navigation doc — leave the TOC empty */
    });

  // Cover art for the info-rail. `coverUrl()` resolves the packaged cover
  // image to a blob URL (or null when the epub declares no cover).
  try {
    void r.book
      .coverUrl()
      .then((url: string | null) => {
        if (url) emit("cover", url);
      })
      .catch(() => {
        /* no cover — info-rail falls back to the generic book glyph */
      });
  } catch {
    /* older epubjs without coverUrl — ignore */
  }

  r.on("relocated", (loc: { start?: { href?: string } }) => {
    const href = loc?.start?.href;
    if (href) emit("chapter", href);
  });
  // Re-apply theme each time a new chapter renders — `override` rules
  // need to be present BEFORE the iframe paints, but a brand-new view
  // can be created when the user turns pages. Also re-attach our
  // direct keydown listener since the iframe is fresh.
  r.on(
    "rendered",
    (_section: unknown, view: { iframe?: HTMLIFrameElement }) => {
      applyTheme();
      attachIframeKey(view);
      // Keep focus on the reader SHELL, not the book iframe. epubjs/vue-reader
      // call `iframe.contentWindow.focus()` on every render, which steals focus
      // into the iframe and kills the parent's arrow handlers — that's the
      // "arrows only work for a second" bug. Re-claiming focus here (after
      // their focus call, via rAF) keeps ←/→ (file nav) and ↑/↓ (page nav)
      // working through Preview's window-level key handlers.
      requestAnimationFrame(() => rootEl.value?.focus({ preventScroll: true }));
    }
  );
  installIframeKeyHandler(r);
};

// React to font-size changes from parent without re-mounting the reader.
watch(
  () => props.size,
  (next) => rendition.value?.themes.fontSize(`${next}%`)
);

// Re-apply the book theme whenever the parent flips `dark` — either the app
// theme changed (and no per-book override is set) or the reader's dark-mode
// toggle was used. `themes.override` is idempotent, so this is safe to run on
// every change. The parent (Preview.vue) owns the app-theme observation now.
watch(
  () => props.dark,
  () => applyTheme()
);

onMounted(() => {
  // Wire arrow-key handling into the book iframe(s). Watch the viewer
  // subtree so we catch the iframe whenever vue-reader (re)creates it, and
  // run a few timed passes for the async window between the iframe
  // appearing and its document becoming navigable.
  if (rootEl.value) {
    iframeObserver = new MutationObserver(() => wireIframes());
    iframeObserver.observe(rootEl.value, { childList: true, subtree: true });
  }
  wireIframes();
  [100, 300, 600, 1200].forEach((ms) => window.setTimeout(wireIframes, ms));

  // Claim focus for the reader shell up front (and again after epubjs has had
  // a chance to grab it) so the parent window's arrow handlers are live from
  // the moment the book opens — without requiring a click outside the book.
  rootEl.value?.focus({ preventScroll: true });
  [150, 400, 800].forEach((ms) =>
    window.setTimeout(() => rootEl.value?.focus({ preventScroll: true }), ms)
  );
});

onBeforeUnmount(() => {
  iframeObserver?.disconnect();
  iframeObserver = null;
});
</script>

<style scoped>
.epub-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}

/* The shell is programmatically focused (tabindex="-1") to keep arrow-key
   navigation alive; don't paint a focus ring around the whole reader. */
.epub-viewer:focus,
.epub-viewer:focus-visible {
  outline: none;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
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

/* Dark-mode chrome keys off the effective book theme (the `--dark` modifier
   the parent sets), NOT the app's `html.dark` — so a per-book override themes
   the reader gutter + TOC area to match the book content. Source order keeps
   these last so they win over the light defaults above. */
.epub-viewer--dark :deep(.readerArea) {
  background-color: #1f1f23 !important;
}
.epub-viewer--dark :deep(.tocArea) {
  background: #18181b !important;
}
</style>
