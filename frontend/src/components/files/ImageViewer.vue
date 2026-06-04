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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    /** Current zoom percentage (100 = actual / fit-to-stage). */
    zoomPercent: number;
    /** When true, the image fits the stage; zoomPercent is overridden. */
    fitToScreen: boolean;
  }>(),
  { alt: "" }
);

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
</style>
