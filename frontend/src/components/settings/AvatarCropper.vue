<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="open"
        class="ac-scrim"
        @click.self="cancel"
        @keydown.esc.stop="cancel"
      >
        <div
          class="ac-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Crop your avatar"
        >
          <h2 class="ac-title">Position your photo</h2>

          <!-- Stage: the image pans/zooms under a fixed circular mask. The
               <img> is absolutely positioned; drag moves it, the slider
               scales it. On save we re-derive the same transform onto a 256²
               canvas (see renderToDataUri) so what you see is what you get. -->
          <div
            ref="stageEl"
            class="ac-stage"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
            @wheel.prevent="onWheel"
          >
            <img
              v-if="src"
              :src="src"
              class="ac-img"
              alt=""
              draggable="false"
              :style="imgStyle"
              @load="onImgLoad"
            />
            <div class="ac-mask" aria-hidden="true"></div>
          </div>

          <div class="ac-zoom">
            <Icon name="image" :size="15" class="ac-zoom__icon" />
            <input
              type="range"
              class="ac-zoom__range"
              :min="minScale"
              :max="maxScale"
              step="0.01"
              :value="scale"
              aria-label="Zoom"
              @input="onZoomInput"
            />
          </div>

          <div class="ac-actions">
            <button type="button" class="ac-btn ac-btn--ghost" @click="cancel">
              Cancel
            </button>
            <button type="button" class="ac-btn ac-btn--primary" @click="save">
              Save photo
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import {
  coverBaseline,
  centerOffset,
  clampOffset,
  zoomAround,
  outputRect,
} from "@/utils/avatarCrop";

const props = defineProps<{
  open: boolean;
  /** The picked file's object/data URL to crop. */
  src: string;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  /** A 256² JPEG data URI. */
  (e: "save", dataUri: string): void;
}>();

// The rendered stage is a square; the circular mask is inscribed in it. The
// output is a 256² image (retina-crisp at every avatar size we render).
const STAGE = 260;
const OUTPUT = 256;

const stageEl = ref<HTMLElement | null>(null);

// Natural image dimensions (set on load) + the current transform: `scale`
// is a multiplier over the "cover" baseline (image just fills the stage), and
// (tx, ty) is the top-left offset of the scaled image within the stage.
const natW = ref(0);
const natH = ref(0);
const baseScale = ref(1);
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);

const minScale = computed(() => baseScale.value);
const maxScale = computed(() => baseScale.value * 4);

const drawW = computed(() => natW.value * scale.value);
const drawH = computed(() => natH.value * scale.value);

const imgStyle = computed(() => ({
  width: `${drawW.value}px`,
  height: `${drawH.value}px`,
  transform: `translate(${tx.value}px, ${ty.value}px)`,
}));

// Keep the scaled image covering the whole stage (no gaps inside the mask).
const clamp = () => {
  const c = clampOffset(tx.value, ty.value, drawW.value, drawH.value, STAGE);
  tx.value = c.tx;
  ty.value = c.ty;
};

const onImgLoad = (e: Event) => {
  const img = e.target as HTMLImageElement;
  natW.value = img.naturalWidth;
  natH.value = img.naturalHeight;
  // Baseline: the smaller dimension fills the stage (object-fit: cover).
  baseScale.value = coverBaseline(natW.value, natH.value, STAGE);
  scale.value = baseScale.value;
  const centered = centerOffset(drawW.value, drawH.value, STAGE);
  tx.value = centered.tx;
  ty.value = centered.ty;
  clamp();
};

// Zoom around the stage center so the framed subject stays put.
const zoomTo = (next: number) => {
  const z = zoomAround(
    scale.value,
    next,
    tx.value,
    ty.value,
    natW.value,
    natH.value,
    STAGE,
    minScale.value,
    maxScale.value
  );
  scale.value = z.scale;
  tx.value = z.tx;
  ty.value = z.ty;
};

const onZoomInput = (e: Event) =>
  zoomTo(parseFloat((e.target as HTMLInputElement).value));
const onWheel = (e: WheelEvent) =>
  zoomTo(scale.value * (e.deltaY < 0 ? 1.08 : 0.92));

// Pointer drag to pan.
let dragging = false;
let lastX = 0;
let lastY = 0;
const onDown = (e: PointerEvent) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};
const onMove = (e: PointerEvent) => {
  if (!dragging) return;
  tx.value += e.clientX - lastX;
  ty.value += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  clamp();
};
const onUp = () => {
  dragging = false;
};

// Re-run the on-screen transform onto a 256² canvas. The stage→output scale
// factor (OUTPUT/STAGE) maps the visible crop exactly to the exported pixels.
const renderToDataUri = (): string => {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = stageEl.value?.querySelector("img");
  if (!img) return "";
  const r = outputRect(
    tx.value,
    ty.value,
    drawW.value,
    drawH.value,
    STAGE,
    OUTPUT
  );
  ctx.drawImage(img as HTMLImageElement, r.dx, r.dy, r.dw, r.dh);
  // JPEG q0.85: small (~15–25KB) yet clean; avatars have no transparency.
  return canvas.toDataURL("image/jpeg", 0.85);
};

const save = () => {
  const uri = renderToDataUri();
  if (uri) emit("save", uri);
};
const cancel = () => emit("cancel");

// Reset the transform each time a new image opens so a second upload doesn't
// inherit the previous crop.
watch(
  () => props.open,
  (o) => {
    if (o) {
      natW.value = 0;
      natH.value = 0;
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
      void nextTick();
    }
  }
);
</script>

<style scoped>
.ac-scrim {
  position: fixed;
  inset: 0;
  z-index: 9600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 10, 14, 0.4);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

.ac-dialog {
  width: min(340px, 92vw);
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg, 12px);
  box-shadow:
    0 2px 8px rgba(8, 8, 12, 0.16),
    0 18px 48px rgba(8, 8, 12, 0.22);
  padding: 18px;
}

.ac-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-1);
}

.ac-stage {
  position: relative;
  width: 260px;
  height: 260px;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 10px;
  background: var(--color-elevated);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.ac-stage:active {
  cursor: grabbing;
}

.ac-img {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  pointer-events: none;
}

/* The circular mask: a huge shadow spread darkens everything outside the
   inscribed circle, and a hairline ring makes the crop boundary crisp. */
.ac-mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgba(10, 10, 14, 0.55);
  outline: 1px solid rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

.ac-zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 2px 4px;
}
.ac-zoom__icon {
  color: var(--color-ink-3);
  flex-shrink: 0;
}
.ac-zoom__range {
  flex: 1;
  accent-color: var(--color-accent);
}

.ac-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.ac-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.ac-btn--ghost {
  background: transparent;
  border: 1px solid var(--color-line-strong);
  color: var(--color-ink-2);
}
.ac-btn--ghost:hover {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.ac-btn--primary {
  background: var(--accent-gradient);
  border: 1px solid var(--color-accent);
  color: var(--color-on-accent);
}
.ac-btn--primary:hover {
  background: var(--accent-gradient-strong);
}
</style>
