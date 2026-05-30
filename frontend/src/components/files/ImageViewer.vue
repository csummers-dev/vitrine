<template>
  <div class="image-viewer">
    <!-- ── Stage: the image (decoration applied directly to <img>) ───
         Previous version wrapped the img in an inline-flex card so the
         checkerboard background could trace the image's bounds. That
         setup created a chicken-and-egg: the img's `max-height: 100%`
         resolved against the shrink-to-content card whose own height
         was driven by the img → browser fell back to stretching one
         axis. Putting the border / shadow / checkerboard on the img
         itself fixes the aspect ratio while preserving the visual
         (the checkerboard only shows through transparent pixels). -->
    <div class="image-viewer__stage">
      <img
        ref="imgEl"
        :src="src"
        :alt="alt"
        class="image-viewer__img"
        :style="imgStyle"
        @load="onLoad"
        @dragstart.prevent
        draggable="false"
      />
    </div>

    <!-- ── Film strip (image only, hidden at < md) ───────────────── -->
    <div v-if="strip.length > 1" class="image-viewer__strip">
      <button
        v-for="item in strip"
        :key="item.url"
        type="button"
        class="image-viewer__thumb"
        :class="{ 'is-active': item.url === currentUrl }"
        :style="thumbStyle(item)"
        :title="item.name"
        :aria-label="item.name"
        :aria-current="item.url === currentUrl ? 'true' : undefined"
        @click="$emit('navigate', item.url)"
      ></button>
      <div class="image-viewer__strip-count">
        {{ currentIndex + 1 }} of {{ strip.length }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { files as api } from "@/api";

interface StripItem {
  name: string;
  url: string;
  path: string;
}

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    /** Current zoom percentage (100 = actual / fit-to-stage). */
    zoomPercent: number;
    /** When true, the image fits the stage; zoomPercent is overridden. */
    fitToScreen: boolean;
    /** Strip of sibling images for the bottom rail. Empty disables it. */
    strip?: StripItem[];
    /** URL of the currently-active image (for strip is-active state). */
    currentUrl?: string;
  }>(),
  { alt: "", strip: () => [], currentUrl: "" }
);

defineEmits<{
  (e: "navigate", url: string): void;
}>();

const imgEl = ref<HTMLImageElement | null>(null);
const naturalWidth = ref<number>(0);
const naturalHeight = ref<number>(0);

const onLoad = () => {
  if (!imgEl.value) return;
  naturalWidth.value = imgEl.value.naturalWidth;
  naturalHeight.value = imgEl.value.naturalHeight;
};

/**
 * The visual scale we want to apply. `fit` mode lets CSS handle it
 * (max-width/height 100%, object-fit contain). Percent zoom drives a
 * fixed-width/height on the image element.
 */
const imgStyle = computed(() => {
  if (props.fitToScreen) {
    return {
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
    } as const;
  }
  const w = (naturalWidth.value * props.zoomPercent) / 100;
  const h = (naturalHeight.value * props.zoomPercent) / 100;
  return {
    width: `${w}px`,
    height: `${h}px`,
    maxWidth: "none",
    maxHeight: "none",
  } as const;
});

const currentIndex = computed(() =>
  props.strip.findIndex((it) => it.url === props.currentUrl)
);

const thumbStyle = (item: StripItem) => {
  // Use the small preview thumbnail endpoint for the strip — same one
  // the file listing uses for icon thumbnails. Cheap to load, already
  // cached if the user came from the listing.
  const resource = { url: item.url, path: item.path } as any;
  const url = api.getPreviewURL(resource, "thumb");
  return { backgroundImage: `url('${url}')` } as const;
};

// Reset natural dimensions when the src changes so a smaller image
// doesn't briefly show at the previous image's zoomed size.
watch(
  () => props.src,
  () => {
    naturalWidth.value = 0;
    naturalHeight.value = 0;
  }
);
</script>

<style scoped>
.image-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.image-viewer__stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 16px;
}

/* The img owns its own decoration so its aspect ratio is never broken
   by a wrapper container's sizing decisions. The previous "card" wrapper
   was display: inline-flex (shrink-to-content); the img inside had
   `max-height: 100%` which resolved against the shrunken card whose own
   height was driven by the img → browser fell back to stretching one
   axis. Putting border / shadow / checkerboard on the img directly
   means it always renders at its intrinsic aspect ratio. */
.image-viewer__img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-line, #ececec);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18);
  /* Checkerboard for transparent-PNG sanity — shows through the img's
     own alpha pixels only, not around the image. */
  background:
    linear-gradient(45deg, rgba(24, 24, 27, 0.04) 25%, transparent 25%) 0 0 /
      16px 16px,
    linear-gradient(-45deg, rgba(24, 24, 27, 0.04) 25%, transparent 25%) 0 8px /
      16px 16px,
    linear-gradient(45deg, transparent 75%, rgba(24, 24, 27, 0.04) 75%)
      8px -8px / 16px 16px,
    linear-gradient(-45deg, transparent 75%, rgba(24, 24, 27, 0.04) 75%) -8px
      0 / 16px 16px,
    var(--color-surface, #fff);
  -webkit-user-drag: none;
  user-select: none;
}

html.dark .image-viewer__img {
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%) 0 0 /
      16px 16px,
    linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%) 0
      8px / 16px 16px,
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%)
      8px -8px / 16px 16px,
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%) -8px
      0 / 16px 16px,
    var(--color-surface);
}

/* ── Film strip ──────────────────────────────────────────────────── */
.image-viewer__strip {
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  flex-shrink: 0;
}

.image-viewer__thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  overflow: hidden;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--color-elevated, #f4f4f5);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease;
  padding: 0;
}
.image-viewer__thumb:hover {
  border-color: var(--color-line-strong, #d4d4d8);
  transform: translateY(-2px);
}
.image-viewer__thumb.is-active {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-soft, rgba(94, 106, 210, 0.1));
}
.image-viewer__thumb:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 2px;
}

.image-viewer__strip-count {
  margin-left: auto;
  padding-left: 12px;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  /* Hide the strip on mobile — the user navigates via swipe / keyboard
     and stage area is too tight to lose 80 px to a horizontal rail. */
  .image-viewer__strip {
    display: none;
  }
}
</style>
