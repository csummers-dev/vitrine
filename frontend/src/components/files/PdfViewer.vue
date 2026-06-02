<template>
  <div class="pdf-viewer">
    <!-- Left thumbnail rail (hidden < md). Renders a low-res preview
         of every page so the user can jump anywhere. -->
    <aside
      v-if="totalPages > 0"
      ref="railEl"
      class="pdf-viewer__rail"
      aria-label="PDF page thumbnails"
    >
      <button
        v-for="n in totalPages"
        :key="n"
        :ref="(el) => bindThumbWrap(n, el as Element | null)"
        :data-page="n"
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
          :ref="(el) => bindPageWrap(n, el as Element | null)"
          :data-page="n"
          class="pdf-viewer__page-wrap"
          :style="
            pageHeightEstimate
              ? { minHeight: pageHeightEstimate + 'px' }
              : undefined
          "
        >
          <canvas
            :ref="(el) => bindPageCanvas(n, el as HTMLCanvasElement | null)"
            class="pdf-viewer__page"
          ></canvas>
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
 *   - Each page is its own `<canvas>` rendered by pdf.js, but rendering is
 *     LAZY: IntersectionObservers paint only the pages near the viewport and
 *     release the canvas backing store for pages that scroll far away. A long
 *     PDF would otherwise allocate one full-resolution canvas per page at once
 *     and blow past the browser's canvas-memory budget — later pages then
 *     silently fail to paint (blank). Each page-wrap reserves an estimated
 *     height up front so the observers can place pages before they're painted.
 *   - The thumbnail rail renders the same pages at thumbnail scale on a
 *     separate set of canvases, also lazily.
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
const railEl = ref<HTMLElement | null>(null);
// Estimated page height (px) at the current fit-width, taken from page 1.
// Reserved as a min-height on every page-wrap so off-screen pages keep their
// layout box even before their canvas is painted (or after it's released) —
// this is what lets the IntersectionObserver lazy-render without the scroll
// position jumping around.
const pageHeightEstimate = ref<number>(0);
const totalPages = ref<number>(0);
const currentPage = ref<number>(props.page);
const loading = ref<boolean>(true);
const errorMessage = ref<string>("");

// Refs to page + thumbnail canvases keyed by page number. Filled by
// template ref callbacks; we use a Map to avoid a sparse array.
const pageCanvases = new Map<number, HTMLCanvasElement>();
const thumbCanvases = new Map<number, HTMLCanvasElement>();
const renderedPages = new Set<number>();
const renderedThumbs = new Set<number>();

// Canvas binds only register the element now — the IntersectionObservers
// below decide when to actually paint (and when to release) so we never hold
// more than a small window of full-resolution canvases at once.
const bindPageCanvas = (n: number, el: HTMLCanvasElement | null) => {
  if (el) pageCanvases.set(n, el);
  else pageCanvases.delete(n);
};
const bindThumbCanvas = (n: number, el: HTMLCanvasElement | null) => {
  if (el) thumbCanvases.set(n, el);
  else thumbCanvases.delete(n);
};

let pdf: PDFDocumentProxy | null = null;

const reset = async () => {
  pageObserver?.disconnect();
  pageObserver = null;
  thumbObserver?.disconnect();
  thumbObserver = null;
  pageWraps.clear();
  thumbWraps.clear();
  pageCanvases.clear();
  thumbCanvases.clear();
  renderedPages.clear();
  renderedThumbs.clear();
  pageHeightEstimate.value = 0;
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
    // Reserve a layout box for every page BEFORE the v-for mounts them, so the
    // IntersectionObservers can tell which pages are actually near the
    // viewport (otherwise zero-height wraps all stack at the top and every
    // page reports "visible"). Rendering itself is driven lazily by the
    // observers once the wraps mount + are observed.
    await measurePageHeight();
    totalPages.value = pdf.numPages;
    emit("update:totalPages", pdf.numPages);
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // High-DPI: render at devicePixelRatio for crisp output — but clamp the
    // backing-store scale so it never exceeds the browser's max-canvas limits
    // (≈4096 px/side and ≈16.7M px area on the strictest engines). A page big
    // enough to blow past those would otherwise produce a canvas the browser
    // silently refuses to paint (blank page). Huge pages downscale (blurry but
    // visible) rather than vanish.
    const wCss = viewport.width;
    const hCss = viewport.height;
    const MAX_DIM = 4096;
    const MAX_AREA = 16_777_216; // 4096²
    let dpr = window.devicePixelRatio || 1;
    dpr = Math.min(dpr, MAX_DIM / wCss, MAX_DIM / hCss);
    dpr = Math.min(dpr, Math.sqrt(MAX_AREA / (wCss * hCss)));
    if (dpr < 0.1) dpr = 0.1;
    canvas.width = Math.max(1, Math.floor(wCss * dpr));
    canvas.height = Math.max(1, Math.floor(hCss * dpr));
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${hCss}px`;
    const transform: [number, number, number, number, number, number] = [
      dpr,
      0,
      0,
      dpr,
      0,
      0,
    ];
    await page.render({ canvasContext: ctx, viewport, transform, canvas })
      .promise;
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

// ── Lazy rendering (IntersectionObserver) ──────────────────────────────
// A long PDF used to allocate one full-resolution canvas PER PAGE at once,
// which blows past the browser's canvas-memory budget — later pages then
// silently fail to paint (the reported "blank pages on big PDFs" bug). We now
// paint only the pages near the viewport and release the canvas backing store
// for pages that scroll far away.
const pageWraps = new Map<number, Element>();
const thumbWraps = new Map<number, Element>();
let pageObserver: IntersectionObserver | null = null;
let thumbObserver: IntersectionObserver | null = null;

/** Free a page's canvas bitmap while keeping its CSS box (so the scroll
 *  layout is preserved). Marks it un-rendered so it repaints on return. */
const releasePageCanvas = (n: number) => {
  const canvas = pageCanvases.get(n);
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  renderedPages.delete(n);
};
const releaseThumbCanvas = (n: number) => {
  const canvas = thumbCanvases.get(n);
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  renderedThumbs.delete(n);
};

const onPageIntersect: IntersectionObserverCallback = (entries) => {
  for (const e of entries) {
    const n = Number((e.target as HTMLElement).dataset.page);
    if (!n) continue;
    if (e.isIntersecting) void renderPageIfReady(n);
    else releasePageCanvas(n);
  }
};
const onThumbIntersect: IntersectionObserverCallback = (entries) => {
  for (const e of entries) {
    const n = Number((e.target as HTMLElement).dataset.page);
    if (!n) continue;
    if (e.isIntersecting) void renderThumbIfReady(n);
    else releaseThumbCanvas(n);
  }
};

// (Re)create both observers once the stage + rail are actually in the DOM and
// observe every wrap registered so far. This is driven from a `totalPages`
// watcher after `nextTick` — NOT from the ref-callbacks — because Vue fires a
// parent's ref AFTER its children's, so the rail's children (thumb wraps) bind
// before `railEl` is set; creating the observer eagerly in a bind-callback
// would give it a null root and silently drop those early thumbnails.
const setupObservers = () => {
  pageObserver?.disconnect();
  thumbObserver?.disconnect();
  // ±1.5 viewports of look-ahead so a scroll reveals already-painted pages.
  pageObserver = stageEl.value
    ? new IntersectionObserver(onPageIntersect, {
        root: stageEl.value,
        rootMargin: "150% 0px",
      })
    : null;
  thumbObserver = railEl.value
    ? new IntersectionObserver(onThumbIntersect, {
        root: railEl.value,
        rootMargin: "200% 0px",
      })
    : null;
  for (const el of pageWraps.values()) pageObserver?.observe(el);
  for (const el of thumbWraps.values()) thumbObserver?.observe(el);
};

// Bind-callbacks only maintain the wrap maps + observe against an
// already-created observer (for wraps that mount on a later re-render). Initial
// observation is done in bulk by `setupObservers`.
const bindPageWrap = (n: number, el: Element | null) => {
  const prev = pageWraps.get(n);
  if (prev) pageObserver?.unobserve(prev);
  if (el) {
    pageWraps.set(n, el);
    pageObserver?.observe(el);
  } else {
    pageWraps.delete(n);
  }
};
const bindThumbWrap = (n: number, el: Element | null) => {
  const prev = thumbWraps.get(n);
  if (prev) thumbObserver?.unobserve(prev);
  if (el) {
    thumbWraps.set(n, el);
    thumbObserver?.observe(el);
  } else {
    thumbWraps.delete(n);
  }
};

// Once the document loads and `totalPages` flips positive, the v-for mounts the
// page-wraps + thumbnail rail on the next tick; wire the observers up then.
watch(
  () => totalPages.value,
  async (n) => {
    if (n <= 0) return;
    await nextTick();
    setupObservers();
  }
);

/** Estimate the fit-width page height from page 1 so every page-wrap can
 *  reserve a sensible box before it's painted. */
const measurePageHeight = async () => {
  if (!pdf) return;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const stage = stageEl.value;
    const containerWidth = stage ? stage.clientWidth - 32 : base.width;
    const fitScale = containerWidth / base.width;
    pageHeightEstimate.value = Math.round(
      base.height * fitScale * (props.zoomPercent / 100)
    );
  } catch {
    /* leave estimate at 0 — wraps fall back to their min CSS height */
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
    // Update the reserved page-box height, then repaint only the pages that
    // are currently live (near the viewport) — the rest repaint lazily as the
    // observer reveals them.
    void measurePageHeight();
    for (const n of [...renderedPages]) void renderPageIfReady(n);
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
    border-color var(--dur-base) ease,
    transform var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
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
  background: var(--accent-gradient);
  color: white;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color var(--dur-base) ease;
}
.pdf-viewer__fallback-btn:hover {
  background: var(--accent-gradient-strong);
}
</style>
