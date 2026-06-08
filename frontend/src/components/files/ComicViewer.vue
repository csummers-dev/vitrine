<template>
  <div
    ref="root"
    class="comic-reader"
    :class="{ 'is-rtl': rtl }"
    @mousemove="onActivity"
    @touchstart="onActivity"
  >
    <!-- Stage -->
    <div ref="stage" class="comic-stage">
      <div v-if="loading" class="comic-status">
        <Icon name="loader-circle" :size="28" class="comic-spin" />
        <span>{{ t("files.comic.loading") }}</span>
      </div>

      <div v-else-if="error" class="comic-status comic-status--error">
        <Icon name="triangle-alert" :size="28" />
        <span>{{ error }}</span>
      </div>

      <img
        v-else-if="pages > 0"
        :key="current"
        class="comic-page"
        :class="`comic-page--fit-${effectiveFit}`"
        :src="pageSrc(current)"
        :alt="`${name} — ${current + 1}/${pages}`"
        draggable="false"
        @load="onPageLoad"
        @error="onPageError"
      />
    </div>

    <!-- Edge tap zones (reading-direction aware) -->
    <button
      v-if="ready"
      type="button"
      class="comic-zone comic-zone--start"
      :aria-label="t('files.comic.previous')"
      @click="backward"
    />
    <button
      v-if="ready"
      type="button"
      class="comic-zone comic-zone--end"
      :aria-label="t('files.comic.next')"
      @click="forward"
    />

    <!-- Visible chevrons -->
    <button
      v-if="ready"
      type="button"
      class="comic-arrow comic-arrow--start"
      :aria-label="t('files.comic.previous')"
      @click="backward"
    >
      <Icon :name="rtl ? 'chevron-right' : 'chevron-left'" :size="24" />
    </button>
    <button
      v-if="ready"
      type="button"
      class="comic-arrow comic-arrow--end"
      :aria-label="t('files.comic.next')"
      @click="forward"
    >
      <Icon :name="rtl ? 'chevron-left' : 'chevron-right'" :size="24" />
    </button>

    <!-- Toolbar -->
    <div
      v-if="ready"
      class="comic-toolbar"
      :class="{ 'is-idle-hidden': !controlsVisible }"
    >
      <span class="comic-page-indicator">{{ current + 1 }} / {{ pages }}</span>
      <button
        type="button"
        class="comic-tool"
        :title="t('files.comic.fit')"
        @click="cycleFit"
      >
        <!-- V2 #9: colourful fit icon — width=teal, height=blue, actual=green. -->
        <Icon :name="fitIcon" :size="16" :style="{ color: fitColor }" />
        <span class="comic-tool__label">{{ fitLabel }}</span>
      </button>
      <button
        type="button"
        class="comic-tool"
        :title="t('files.comic.readingDirection')"
        @click="toggleRtl"
      >
        <!-- V2 #9: colourful direction icon (LTR=blue, RTL=amber); the old
             full-lilac active pill was removed in favour of the icon colour. -->
        <Icon
          name="book-open"
          :size="16"
          :style="{ color: rtl ? 'var(--c-amber)' : 'var(--c-blue)' }"
        />
        <span class="comic-tool__label">{{ rtl ? "RTL" : "LTR" }}</span>
      </button>
      <button
        type="button"
        class="comic-tool"
        :title="t('files.comic.fullscreen')"
        @click="toggleFullscreen"
      >
        <Icon :name="isFullscreen ? 'minimize' : 'maximize'" :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { files as filesApi } from "@/api";
import { useComicProgress } from "@/composables/useComicProgress";
import { usePreferences } from "@/composables/usePreferences";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  path: string;
  modified: string;
  name: string;
}>();

const emit = defineEmits<{
  (e: "navigate-prev"): void;
  (e: "navigate-next"): void;
}>();

const { t } = useI18n();
const progress = useComicProgress();
const prefs = usePreferences();

const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const pages = ref(0);
const current = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const isFullscreen = ref(false);

type Fit = "width" | "height" | "original" | "dynamic";
// Default to "dynamic" — fits each page by its own orientation (wide → width,
// tall → height) so a comic opens at a sensible size without manual toggling.
const fit = ref<Fit>("dynamic");

// Reading direction is a global per-user preference (manga read right-to-left).
const rtl = computed({
  get: () => prefs.get<boolean>("comic.rtl", false),
  set: (v) => void prefs.set("comic.rtl", v),
});

const ready = computed(() => !loading.value && !error.value && pages.value > 0);

const pageSrc = (i: number) =>
  filesApi.getComicPageURL(props.path, props.modified, i);

// ── load ───────────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  error.value = null;
  pages.value = 0;
  current.value = 0;
  try {
    pages.value = await filesApi.getComicPageCount(props.path);
    if (pages.value <= 0) {
      error.value = t("files.comic.empty");
    } else {
      const resume = progress.get(props.path);
      current.value = Math.min(Math.max(resume, 0), pages.value - 1);
      preloadNeighbors();
    }
  } catch (e) {
    // Password-protected comics aren't supported — show one clear message
    // (the server reports this up front at /list) rather than the raw error.
    const msg = e instanceof Error ? e.message : "";
    error.value = /password|encrypt/i.test(msg)
      ? t("files.comic.encrypted")
      : msg || t("files.comic.error");
  } finally {
    loading.value = false;
  }
};

// V3-D #11: auto-hide the toolbar (the page/fit "size pill") after a spell of
// inactivity, like a media player. Any pointer/touch movement over the reader
// reveals it again and restarts the timer.
const IDLE_HIDE_MS = 2500;
const controlsVisible = ref(true);
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const onActivity = () => {
  controlsVisible.value = true;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    controlsVisible.value = false;
    idleTimer = null;
  }, IDLE_HIDE_MS);
};

onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", onFsChange);
  void load();
  onActivity();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("fullscreenchange", onFsChange);
  if (idleTimer) clearTimeout(idleTimer);
});

// ── navigation ───────────────────────────────────────────────────────────────
const goTo = (i: number) => {
  const clamped = Math.min(Math.max(i, 0), pages.value - 1);
  if (clamped === current.value) return;
  current.value = clamped;
  progress.set(props.path, clamped);
  stage.value?.scrollTo({ top: 0 });
  preloadNeighbors();
};

// forward/backward are in READING order; RTL only flips which key/zone triggers
// them (handled at the call sites). At the ends, hand off to neighbor-file nav.
const forward = () => {
  if (current.value < pages.value - 1) goTo(current.value + 1);
  else emit("navigate-next");
};
const backward = () => {
  if (current.value > 0) goTo(current.value - 1);
  else emit("navigate-prev");
};

const preloadNeighbors = () => {
  for (const i of [current.value + 1, current.value - 1]) {
    if (i >= 0 && i < pages.value) {
      const img = new Image();
      img.src = pageSrc(i);
    }
  }
};

// V2 #7: "dynamic" fit picks per-page based on the page's orientation — a
// landscape (wide) page fits to width, a portrait (tall) page fits to height —
// so each page fills the stage as well as it can without the reader changing
// modes. Track the current page's orientation from its natural dimensions.
const pageLandscape = ref(false);
const onPageLoad = (e: Event) => {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) {
    pageLandscape.value = img.naturalWidth > img.naturalHeight;
  }
};
const onPageError = () => {
  error.value = t("files.comic.pageError");
};

// ── fit / direction / fullscreen ─────────────────────────────────────────────
const FIT_ORDER: Fit[] = ["width", "height", "original", "dynamic"];
const cycleFit = () => {
  fit.value = FIT_ORDER[(FIT_ORDER.indexOf(fit.value) + 1) % FIT_ORDER.length];
};
// The fit class actually applied to the page. For "dynamic" this resolves
// per-page to width (landscape) or height (portrait); otherwise it's the
// chosen mode verbatim.
const effectiveFit = computed<Exclude<Fit, "dynamic">>(() =>
  fit.value === "dynamic"
    ? pageLandscape.value
      ? "width"
      : "height"
    : fit.value
);
const fitIcon = computed(() =>
  fit.value === "width"
    ? "move-horizontal"
    : fit.value === "height"
      ? "move-vertical"
      : fit.value === "original"
        ? "scan"
        : "sparkles"
);
const fitLabel = computed(() =>
  fit.value === "width"
    ? t("files.comic.fitWidth")
    : fit.value === "height"
      ? t("files.comic.fitHeight")
      : fit.value === "original"
        ? t("files.comic.original")
        : t("files.comic.dynamic")
);
// V2 #9: each fit mode gets its own hue so the colourful icon doubles as a
// state indicator (width=teal, height=blue, actual=green, dynamic=lilac).
const fitColor = computed(() =>
  fit.value === "width"
    ? "var(--c-teal)"
    : fit.value === "height"
      ? "var(--c-blue)"
      : fit.value === "original"
        ? "var(--c-green)"
        : "var(--c-lilac)"
);

const toggleRtl = () => {
  rtl.value = !rtl.value;
};

const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void root.value?.requestFullscreen?.();
};
const onFsChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

// ── keyboard ─────────────────────────────────────────────────────────────────
const onKey = (e: KeyboardEvent) => {
  if (!ready.value) return;
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || target?.isContentEditable)
    return;

  switch (e.key) {
    case "ArrowRight":
      e.preventDefault();
      rtl.value ? backward() : forward();
      break;
    case "ArrowLeft":
      e.preventDefault();
      rtl.value ? forward() : backward();
      break;
    case "ArrowDown":
    case "PageDown":
    case " ":
      e.preventDefault();
      forward();
      break;
    case "ArrowUp":
    case "PageUp":
      e.preventDefault();
      backward();
      break;
    case "Home":
      e.preventDefault();
      goTo(0);
      break;
    case "End":
      e.preventDefault();
      goTo(pages.value - 1);
      break;
    case "f":
    case "F":
      e.preventDefault();
      toggleFullscreen();
      break;
  }
};

// Re-load when the file changes under us (neighbor-file navigation).
watch(
  () => props.path,
  () => void load()
);
</script>

<style scoped>
.comic-reader {
  position: absolute;
  inset: 0;
  background: #0b0b0e;
  overflow: hidden;
}

.comic-stage {
  position: absolute;
  inset: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.comic-page {
  display: block;
  margin: auto;
  user-select: none;
}
.comic-page--fit-width {
  width: 100%;
  height: auto;
}
.comic-page--fit-height {
  height: 100%;
  width: auto;
}
.comic-page--fit-original {
  width: auto;
  height: auto;
  max-width: none;
}

.comic-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: auto;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.9rem;
}
.comic-status--error {
  color: #fda4af;
}
.comic-spin {
  animation: comic-spin 0.9s linear infinite;
}
@keyframes comic-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Edge tap zones — outer quarters, leaving the center free to pan/scroll. */
.comic-zone {
  position: absolute;
  top: 0;
  bottom: 56px;
  width: 25%;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.comic-zone--start {
  left: 0;
}
.comic-zone--end {
  right: 0;
}

.comic-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.comic-reader:hover .comic-arrow {
  opacity: 0.85;
}
.comic-arrow:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.65);
}
.comic-arrow--start {
  left: 12px;
}
.comic-arrow--end {
  right: 12px;
}

.comic-toolbar {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  color: #fff;
  /* V3-D #11: fade the toolbar in/out as the reader idles. */
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.comic-toolbar.is-idle-hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .comic-toolbar.is-idle-hidden {
    transform: translateX(-50%);
  }
}
.comic-page-indicator {
  font-variant-numeric: tabular-nums;
  font-size: 0.82rem;
  padding: 0 6px;
  opacity: 0.92;
}
.comic-tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-size: 0.78rem;
  cursor: pointer;
}
.comic-tool:hover {
  background: rgba(255, 255, 255, 0.14);
}
.comic-tool__label {
  line-height: 1;
}
</style>
