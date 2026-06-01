<template>
  <div class="pdf-viewer">
    <!-- Left thumbnail rail (hidden < md). Renders a low-res preview
         of every page so the user can jump anywhere. -->
    <aside
      v-if="totalPages > 0"
      class="pdf-viewer__rail"
      aria-label="PDF page thumbnails"
    >
      <button
        v-for="n in totalPages"
        :key="n"
        type="button"
        class="pdf-viewer__thumb"
        :class="{ 'is-active': n === currentPage }"
        :title="`Page ${n}`"
        :aria-label="`Go to page ${n}`"
        :aria-current="n === currentPage ? 'true' : undefined"
        @click="goToPage(n)"
      >
        <canvas
          :ref="(el) => bindThumbCanvas(n, el as HTMLCanvasElement | null)"
        ></canvas>
        <span class="pdf-viewer__thumb-num">{{ n }}</span>
      </button>
    </aside>

    <!-- ── Find bar (S5-1) ────────────────────────────────────────────
         Floating browser-style find UI. Opens on Cmd/Ctrl+F, searches
         every page's extracted text, and paints highlight overlays. -->
    <div v-if="searchOpen" class="pdf-viewer__find" role="search">
      <Icon name="search" :size="14" class="pdf-viewer__find-icon" />
      <input
        ref="searchInputEl"
        v-model="searchQuery"
        type="text"
        class="pdf-viewer__find-input"
        placeholder="Find in document…"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="onFindEnter"
        @keydown.esc.prevent.stop="closeSearch"
      />
      <span class="pdf-viewer__find-count">
        {{
          matches.length ? `${currentMatch + 1} / ${matches.length}` : "0 / 0"
        }}
      </span>
      <button
        type="button"
        class="pdf-viewer__find-btn"
        :disabled="matches.length === 0"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        @click="stepMatch(-1)"
      >
        <Icon name="chevron-up" :size="14" />
      </button>
      <button
        type="button"
        class="pdf-viewer__find-btn"
        :disabled="matches.length === 0"
        title="Next match (Enter)"
        aria-label="Next match"
        @click="stepMatch(1)"
      >
        <Icon name="chevron-down" :size="14" />
      </button>
      <button
        type="button"
        class="pdf-viewer__find-btn"
        title="Close (Esc)"
        aria-label="Close find"
        @click="closeSearch"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>

    <!-- Stage: scrollable column of page canvases. -->
    <div
      ref="stageEl"
      class="pdf-viewer__stage"
      @scroll.passive="onStageScroll"
    >
      <div v-if="errorMessage" class="pdf-viewer__fallback" role="alert">
        <Icon name="file-x-2" :size="36" :stroke-width="1.4" />
        <div class="pdf-viewer__fallback-title">{{ errorMessage }}</div>
        <a
          v-if="downloadUrl || src"
          :href="downloadUrl || src"
          target="_blank"
          rel="noopener"
          class="pdf-viewer__fallback-btn"
        >
          <Icon name="download" :size="14" />
          <span>Download {{ name }}</span>
        </a>
      </div>

      <div v-else-if="loading && totalPages === 0" class="pdf-viewer__loading">
        <Icon name="loader-circle" :size="22" class="pdf-viewer__spin" />
      </div>

      <template v-else>
        <div
          v-for="n in totalPages"
          :key="n"
          :data-page="n"
          class="pdf-viewer__page-wrap"
        >
          <canvas
            :ref="(el) => bindPageCanvas(n, el as HTMLCanvasElement | null)"
            class="pdf-viewer__page"
          ></canvas>
          <!-- Search highlight overlay (S5-1). Absolutely-positioned
               boxes in the page's CSS-pixel space, recomputed on zoom. -->
          <div
            v-if="highlightsByPage[n]?.length"
            class="pdf-viewer__highlights"
            aria-hidden="true"
          >
            <div
              v-for="box in highlightsByPage[n]"
              :key="box.key"
              class="pdf-viewer__highlight"
              :class="{ 'is-current': box.current }"
              :style="{
                left: box.left + 'px',
                top: box.top + 'px',
                width: box.width + 'px',
                height: box.height + 'px',
              }"
            ></div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PDF.js-backed PDF viewer (E4). Replaces the prior browser-native
 * `<object data=...>` embed so the toolbar's page input / page-nav /
 * zoom / find can actually drive the rendering.
 *
 * Architecture:
 *   - Each page is its own `<canvas>` rendered by pdf.js. We render
 *     all pages on load (one-shot) because the typical document size
 *     fits comfortably; for huge files we'd switch to lazy/virtualized
 *     rendering, but that's a separate enhancement.
 *   - The thumbnail rail renders the same pages at thumbnail scale on
 *     a separate set of canvases.
 *   - Page-jump scrolls the active page into view; scroll position
 *     drives the `currentPage` reactive state back to the parent so
 *     the toolbar's page-number input stays in sync.
 *
 * The worker is bundled via Vite's `?url` import — pdf.js needs a
 * separate Worker URL for its background thread.
 */
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";

// Wire up the worker once at module scope. pdfjsLib.GlobalWorkerOptions
// expects a URL string; the `?url` import gives us one Vite will serve
// correctly in both dev and prod (the worker is emitted as its own
// chunk into dist/).
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

const props = defineProps<{
  src: string;
  name: string;
  /** Used by the error fallback's download link. */
  downloadUrl?: string;
  /** Zoom level — 100 = fit-to-width baseline. */
  zoomPercent: number;
  /** Current page (one-based) — two-way via emit so the toolbar input
   *  can also drive it. */
  page: number;
}>();

const emit = defineEmits<{
  (e: "update:page", n: number): void;
  (e: "update:totalPages", n: number): void;
  (e: "loaded"): void;
  (e: "error", message: string): void;
}>();

const stageEl = ref<HTMLElement | null>(null);
const totalPages = ref<number>(0);
const currentPage = ref<number>(props.page);
const loading = ref<boolean>(true);
const errorMessage = ref<string>("");

// ── Find-in-document state (S5-1) ───────────────────────────────────
type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;
/** Minimal shape of a pdf.js text item we care about. `getTextContent`
 *  returns these interleaved with marked-content markers (no `str`). */
interface PdfTextItem {
  str: string;
  /** [a,b,c,d,e,f] text→PDF-space matrix; (e,f) is the baseline origin. */
  transform: number[];
  /** Advance width in text space (multiply by viewport.scale for px). */
  width: number;
}
/** One match: which page + which text item + the matched substring's
 *  position as a fraction of the item's string (so the highlight rect
 *  can be recomputed at any zoom from the live viewport). */
interface PdfMatch {
  page: number;
  item: PdfTextItem;
  startFrac: number;
  widthFrac: number;
}
interface HighlightBox {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  current: boolean;
}

const searchInputEl = ref<HTMLInputElement | null>(null);
const searchOpen = ref<boolean>(false);
const searchQuery = ref<string>("");
const matches = ref<PdfMatch[]>([]);
const currentMatch = ref<number>(0);
const highlightsByPage = ref<Record<number, HighlightBox[]>>({});

// Viewport used for the LAST render of each page (drives highlight
// geometry; recomputed on zoom). Text content cached per page so
// repeated searches don't re-extract.
const pageViewports = new Map<number, PageViewport>();
const textCache = new Map<number, PdfTextItem[]>();

// Refs to page + thumbnail canvases keyed by page number. Filled by
// template ref callbacks; we use a Map to avoid a sparse array.
const pageCanvases = new Map<number, HTMLCanvasElement>();
const thumbCanvases = new Map<number, HTMLCanvasElement>();
const renderedPages = new Set<number>();
const renderedThumbs = new Set<number>();

const bindPageCanvas = (n: number, el: HTMLCanvasElement | null) => {
  if (el) {
    pageCanvases.set(n, el);
    void renderPageIfReady(n);
  } else {
    pageCanvases.delete(n);
  }
};
const bindThumbCanvas = (n: number, el: HTMLCanvasElement | null) => {
  if (el) {
    thumbCanvases.set(n, el);
    void renderThumbIfReady(n);
  } else {
    thumbCanvases.delete(n);
  }
};

let pdf: PDFDocumentProxy | null = null;

const reset = async () => {
  pageCanvases.clear();
  thumbCanvases.clear();
  renderedPages.clear();
  renderedThumbs.clear();
  // S5-1: drop search state for the previous document.
  pageViewports.clear();
  textCache.clear();
  matches.value = [];
  highlightsByPage.value = {};
  currentMatch.value = 0;
  totalPages.value = 0;
  currentPage.value = 1;
  errorMessage.value = "";
  if (pdf) {
    try {
      // PDFDocumentProxy exposes cleanup() in modern pdf.js for releasing
      // intermediate render state; the proxy itself is GC'd when the
      // reference drops. There's no .destroy() in current types.
      await pdf.cleanup();
    } catch {
      /* swallow */
    }
    pdf = null;
  }
};

/** Load the document, render every page + every thumbnail. */
const load = async (src: string) => {
  await reset();
  if (!src) return;
  loading.value = true;
  try {
    const task = pdfjsLib.getDocument({
      url: src,
      withCredentials: true,
    });
    pdf = await task.promise;
    totalPages.value = pdf.numPages;
    emit("update:totalPages", pdf.numPages);
    // Render existing canvases (template refs that have already bound).
    for (const n of pageCanvases.keys()) void renderPageIfReady(n);
    for (const n of thumbCanvases.keys()) void renderThumbIfReady(n);
    emit("loaded");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Couldn't load this PDF.";
    errorMessage.value = msg;
    emit("error", msg);
  } finally {
    loading.value = false;
  }
};

/** Render a single page at the current zoom into its canvas. */
const renderPageIfReady = async (n: number) => {
  if (!pdf) return;
  const canvas = pageCanvases.get(n);
  if (!canvas) return;
  // Re-render if zoom changed even if already rendered.
  // Cache key = `${zoom}` — bump renderedPages when zoom changes.
  renderedPages.add(n);
  try {
    const page: PDFPageProxy = await pdf.getPage(n);
    const baseViewport = page.getViewport({ scale: 1 });
    // Fit to the stage's available width (minus padding) at 100% zoom.
    const stage = stageEl.value;
    const containerWidth = stage
      ? stage.clientWidth - 32 /* horizontal padding */
      : baseViewport.width;
    const fitScale = containerWidth / baseViewport.width;
    const scale = fitScale * (props.zoomPercent / 100);
    const viewport = page.getViewport({ scale });
    // Remember the viewport so search highlights can be positioned in
    // this page's current CSS-pixel space (S5-1).
    pageViewports.set(n, viewport);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // High-DPI: render at devicePixelRatio for crisp output.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const transform: [number, number, number, number, number, number] =
      dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : [1, 0, 0, 1, 0, 0];
    await page.render({ canvasContext: ctx, viewport, transform, canvas })
      .promise;
    // Highlights depend on this page's freshly-stored viewport — rebuild
    // if a search is active (cheap; matches are bounded).
    if (matches.value.length > 0) rebuildHighlights();
  } catch {
    /* render failure — leave canvas blank */
  }
};

/** Render a small thumbnail of a page into the rail canvas. */
const renderThumbIfReady = async (n: number) => {
  if (!pdf || renderedThumbs.has(n)) return;
  const canvas = thumbCanvases.get(n);
  if (!canvas) return;
  renderedThumbs.add(n);
  try {
    const page: PDFPageProxy = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 0.18 });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  } catch {
    /* swallow */
  }
};

/** Scroll a page into view. */
const goToPage = (n: number) => {
  if (n < 1 || n > totalPages.value) return;
  const stage = stageEl.value;
  if (!stage) return;
  const target = stage.querySelector<HTMLElement>(`[data-page="${n}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  currentPage.value = n;
  emit("update:page", n);
};

/** Update `currentPage` based on which page is most visible. */
const onStageScroll = () => {
  const stage = stageEl.value;
  if (!stage) return;
  const stageRect = stage.getBoundingClientRect();
  const stageMid = stageRect.top + stageRect.height / 2;
  let best = currentPage.value;
  let bestDist = Infinity;
  for (let n = 1; n <= totalPages.value; n++) {
    const wrap = stage.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!wrap) continue;
    const r = wrap.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const d = Math.abs(mid - stageMid);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  if (best !== currentPage.value) {
    currentPage.value = best;
    emit("update:page", best);
  }
};

// Re-render all pages on zoom change.
watch(
  () => props.zoomPercent,
  () => {
    for (const n of pageCanvases.keys()) void renderPageIfReady(n);
  }
);

// Respond to external page changes (toolbar input drives :page="…").
watch(
  () => props.page,
  (n) => {
    if (n !== currentPage.value) goToPage(n);
  }
);

// Load on src change (covers initial mount via {immediate}).
watch(
  () => props.src,
  (src) => void load(src),
  { immediate: true }
);

// ── Find in document (S5-1) ─────────────────────────────────────────
// Extract each page's text via pdf.js `getTextContent()` (cached),
// substring-match against the query, and paint highlight overlays
// positioned from each text item's transform. Matches are stored as
// fractions of the containing item so highlight rects survive zoom
// (recomputed from the live viewport).
//
// Known scope: matching is within a single text item. pdf.js usually
// chunks text into short runs (words / phrases), so this covers the
// common case; a query spanning a run boundary won't match. Substring
// position is approximated proportionally (start/width as a fraction of
// the run's advance width) — exact for monospace, visually fine for
// proportional fonts.

/** Lazily fetch + cache a page's text items. */
const getPageText = async (n: number): Promise<PdfTextItem[]> => {
  const cached = textCache.get(n);
  if (cached) return cached;
  if (!pdf) return [];
  try {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // `items` interleaves text runs with marked-content markers (which
    // have no `str`). Build a clean PdfTextItem[] by structural check —
    // a type-predicate against the pdf.js union won't narrow to our
    // subset, so map manually.
    const items: PdfTextItem[] = [];
    for (const raw of content.items) {
      const it = raw as Partial<PdfTextItem>;
      if (
        typeof it.str === "string" &&
        Array.isArray(it.transform) &&
        typeof it.width === "number"
      ) {
        items.push({ str: it.str, transform: it.transform, width: it.width });
      }
    }
    textCache.set(n, items);
    return items;
  } catch {
    return [];
  }
};

/** Device-space rect for a match against a given viewport. */
const matchRect = (m: PdfMatch, vp: PageViewport): HighlightBox => {
  const tx = pdfjsLib.Util.transform(vp.transform, m.item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const totalW = m.item.width * vp.scale;
  return {
    key: "",
    left: tx[4] + m.startFrac * totalW,
    top: tx[5] - fontHeight,
    width: Math.max(2, m.widthFrac * totalW),
    height: fontHeight,
    current: false,
  };
};

/** Recompute every page's highlight boxes from current viewports. */
const rebuildHighlights = () => {
  const byPage: Record<number, HighlightBox[]> = {};
  matches.value.forEach((m, gi) => {
    const vp = pageViewports.get(m.page);
    if (!vp) return;
    const box = matchRect(m, vp);
    box.key = `${m.page}-${gi}`;
    box.current = gi === currentMatch.value;
    (byPage[m.page] ||= []).push(box);
  });
  highlightsByPage.value = byPage;
};

let searchTimer: number | null = null;
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void runSearch(), 200);
});

const runSearch = async () => {
  const q = searchQuery.value.trim().toLowerCase();
  currentMatch.value = 0;
  if (!pdf || q.length === 0) {
    matches.value = [];
    highlightsByPage.value = {};
    return;
  }
  const found: PdfMatch[] = [];
  for (let n = 1; n <= totalPages.value; n++) {
    const items = await getPageText(n);
    for (const item of items) {
      const len = item.str.length;
      if (len === 0) continue;
      const hay = item.str.toLowerCase();
      let from = hay.indexOf(q);
      while (from !== -1) {
        found.push({
          page: n,
          item,
          startFrac: from / len,
          widthFrac: q.length / len,
        });
        from = hay.indexOf(q, from + q.length);
      }
    }
  }
  matches.value = found;
  rebuildHighlights();
  if (found.length > 0) scrollToMatch(0);
};

/** Scroll the stage so match `gi` is comfortably in view + mark it. */
const scrollToMatch = (gi: number) => {
  currentMatch.value = gi;
  rebuildHighlights();
  const m = matches.value[gi];
  if (!m) return;
  const stage = stageEl.value;
  const wrap = stage?.querySelector<HTMLElement>(`[data-page="${m.page}"]`);
  const vp = pageViewports.get(m.page);
  if (!stage || !wrap) return;
  if (!vp) {
    goToPage(m.page);
    return;
  }
  const box = matchRect(m, vp);
  const targetTop = wrap.offsetTop + box.top - stage.clientHeight / 3;
  stage.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
};

/** Cycle to the next (+1) / previous (-1) match, wrapping around. */
const stepMatch = (dir: number) => {
  const len = matches.value.length;
  if (len === 0) return;
  scrollToMatch((currentMatch.value + dir + len) % len);
};

const onFindEnter = (event: KeyboardEvent) => {
  if (!searchQuery.value) return;
  stepMatch(event.shiftKey ? -1 : 1);
};

const openSearch = async () => {
  searchOpen.value = true;
  await nextTick();
  searchInputEl.value?.focus();
  searchInputEl.value?.select();
};

const closeSearch = () => {
  searchOpen.value = false;
  searchQuery.value = "";
  matches.value = [];
  highlightsByPage.value = {};
  currentMatch.value = 0;
};

// ── Keyboard navigation (G5) ───────────────────────────────────────
// Installed for the lifetime of PdfViewer; matches macOS Preview app
// conventions for multi-page docs:
//   • PageDown / Space      → next page (we skip Space — too aggressive,
//                              would conflict with native scroll)
//   • PageUp                → previous page
//   • Home                  → first page
//   • End                   → last page
// All guarded against typing targets so PageUp / PageDown in the page
// number input still natively jumps the caret.
const onPdfKeydown = (event: KeyboardEvent) => {
  // S5-1: Cmd/Ctrl+F opens our find bar instead of the browser's native
  // find. Handled before the typing-target guards so it works even when
  // focus is in the page-number input. Only when a PDF is loaded.
  if (
    (event.metaKey || event.ctrlKey) &&
    (event.key === "f" || event.key === "F") &&
    totalPages.value > 0
  ) {
    event.preventDefault();
    void openSearch();
    return;
  }

  const target = event.target as HTMLElement | null;
  if (target instanceof HTMLInputElement) return;
  if (target instanceof HTMLTextAreaElement) return;
  if (target?.isContentEditable) return;
  if (totalPages.value === 0) return;

  switch (event.key) {
    case "PageDown":
      event.preventDefault();
      goToPage(Math.min(totalPages.value, currentPage.value + 1));
      break;
    case "PageUp":
      event.preventDefault();
      goToPage(Math.max(1, currentPage.value - 1));
      break;
    case "Home":
      // Don't hijack Cmd+Home / Ctrl+Home — those have native meanings
      // (jump to top of scrollable region, scroll to top of page) that
      // overlap usefully with "first page" but are reachable via Home
      // alone too. Keep it simple: bare Home only.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      goToPage(1);
      break;
    case "End":
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      goToPage(totalPages.value);
      break;
  }
};

onMounted(() => window.addEventListener("keydown", onPdfKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onPdfKeydown);
  void reset();
});
</script>

<style scoped>
.pdf-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  min-height: 0;
  position: relative;
}

/* ── Find bar (S5-1) ────────────────────────────────────────────── */
.pdf-viewer__find {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.3);
}
.pdf-viewer__find-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.pdf-viewer__find-input {
  width: 180px;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-ink-1, #18181b);
  padding: 2px 0;
}
.pdf-viewer__find-input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}
.pdf-viewer__find-count {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  padding: 0 2px;
  min-width: 44px;
  text-align: center;
}
.pdf-viewer__find-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.pdf-viewer__find-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.pdf-viewer__find-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pdf-viewer__find-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* ── Search highlight overlay (S5-1) ────────────────────────────── */
.pdf-viewer__highlights {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.pdf-viewer__highlight {
  position: absolute;
  background: rgba(250, 204, 21, 0.4);
  border-radius: 2px;
  mix-blend-mode: multiply;
}
.pdf-viewer__highlight.is-current {
  background: rgba(245, 158, 11, 0.55);
  box-shadow: 0 0 0 1.5px rgba(217, 119, 6, 0.9);
}
html.dark .pdf-viewer__highlight {
  mix-blend-mode: screen;
  background: rgba(250, 204, 21, 0.35);
}
html.dark .pdf-viewer__highlight.is-current {
  background: rgba(245, 158, 11, 0.5);
}

/* ── Thumbnail rail ─────────────────────────────────────────────── */
.pdf-viewer__rail {
  width: 92px;
  flex-shrink: 0;
  background: var(--color-canvas, #fafaf9);
  border-right: 1px solid var(--color-line, #ececec);
  padding: 16px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

@media (max-width: 767px) {
  .pdf-viewer__rail {
    display: none;
  }
}

.pdf-viewer__thumb {
  position: relative;
  width: 64px;
  aspect-ratio: 8.5 / 11;
  border: 1px solid var(--color-line, #ececec);
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
  transition:
    border-color 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease;
}
.pdf-viewer__thumb:hover {
  border-color: var(--color-line-strong, #d4d4d8);
  transform: scale(1.04);
}
.pdf-viewer__thumb.is-active {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 2px var(--color-accent-soft, rgba(94, 106, 210, 0.1));
}
.pdf-viewer__thumb:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 2px;
}
.pdf-viewer__thumb canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}
.pdf-viewer__thumb-num {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
}

/* ── Stage ──────────────────────────────────────────────────────── */
.pdf-viewer__stage {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px 16px;
  background-color: var(--color-canvas, #fafaf9);
  background-image: radial-gradient(
    rgba(24, 24, 27, 0.05) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
}

html.dark .pdf-viewer__stage {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px
  );
}

.pdf-viewer__page-wrap {
  flex-shrink: 0;
  max-width: 100%;
  /* Anchor for the absolutely-positioned search highlight overlay. */
  position: relative;
}

.pdf-viewer__page {
  display: block;
  background: #fff;
  border: 1px solid var(--color-line, #ececec);
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 16px 32px -12px rgba(0, 0, 0, 0.16);
}

/* ── Loading / error states ─────────────────────────────────────── */
.pdf-viewer__loading {
  margin: auto;
  color: var(--color-accent, #5e6ad2);
}

.pdf-viewer__spin {
  animation: pdf-spin 0.9s linear infinite;
}

@keyframes pdf-spin {
  to {
    transform: rotate(360deg);
  }
}

.pdf-viewer__fallback {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--color-ink-2, #52525b);
  max-width: 380px;
  padding: 32px;
}
.pdf-viewer__fallback-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
}
.pdf-viewer__fallback-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--color-accent, #5e6ad2);
  color: white;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 120ms ease;
}
.pdf-viewer__fallback-btn:hover {
  background: var(--color-accent-strong, #4f5ac4);
}
</style>
