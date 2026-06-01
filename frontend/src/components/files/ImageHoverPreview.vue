<template>
  <Teleport to="body">
    <div
      v-if="hover.visible.value && hover.url.value"
      ref="boxEl"
      class="img-hover-preview"
      :style="posStyle"
      aria-hidden="true"
    >
      <img
        :src="hover.url.value"
        :alt="hover.alt.value"
        class="img-hover-preview__img"
        @load="onImgLoad"
        draggable="false"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Floating image hover-preview overlay (v1.3 S5-9). Renders the
 * singleton `useImageHoverPreview` state as a small, size-capped
 * tooltip that follows the cursor and flips to stay on-screen.
 *
 * Size is hard-capped in CSS (min(320px, 40vw/vh)) so a large image
 * can never take over the viewport — the source is already the
 * aspect-preserving "big" server preview (≤1080px), and the box caps
 * the DISPLAY on top of that.
 */
import { computed, ref } from "vue";
import { useImageHoverPreview } from "@/composables/useImageHoverPreview";

const hover = useImageHoverPreview();

const boxEl = ref<HTMLElement | null>(null);
// Measured box size — drives on-screen flip/clamp. Read after the image
// loads (its intrinsic ratio settles the box dimensions).
const boxW = ref<number>(0);
const boxH = ref<number>(0);

const OFFSET = 18; // gap between cursor and the preview
const EDGE = 8; // min margin from any viewport edge

const onImgLoad = () => {
  if (boxEl.value) {
    boxW.value = boxEl.value.offsetWidth;
    boxH.value = boxEl.value.offsetHeight;
  }
};

const posStyle = computed(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = boxW.value;
  const h = boxH.value;

  // Default: down-right of the cursor. Flip to the opposite side if it
  // would overflow, then clamp so it always sits fully on-screen.
  let left = hover.cursorX.value + OFFSET;
  if (left + w + EDGE > vw) left = hover.cursorX.value - OFFSET - w;
  left = Math.max(EDGE, Math.min(left, vw - w - EDGE));

  let top = hover.cursorY.value + OFFSET;
  if (top + h + EDGE > vh) top = hover.cursorY.value - OFFSET - h;
  top = Math.max(EDGE, Math.min(top, vh - h - EDGE));

  return { left: `${left}px`, top: `${top}px` };
});
</script>

<style scoped>
.img-hover-preview {
  position: fixed;
  z-index: 1100;
  /* Never intercept pointer events — the row underneath stays fully
     interactive while the preview floats. */
  pointer-events: none;
  padding: 4px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 10px;
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.4);
}
html.dark .img-hover-preview {
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.7);
}

.img-hover-preview__img {
  display: block;
  /* Hard display cap — the whole point of the feature. Never larger
     than 320px or 40% of the viewport on either axis, whichever is
     smaller, so big images can't take over the screen. */
  max-width: min(320px, 40vw);
  max-height: min(320px, 40vh);
  width: auto;
  height: auto;
  border-radius: 6px;
  object-fit: contain;
  background: var(--color-elevated, #f4f4f5);
}
</style>
