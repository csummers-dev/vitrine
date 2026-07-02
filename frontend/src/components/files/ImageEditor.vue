<template>
  <Teleport to="body">
    <Transition name="img-editor">
      <div
        v-if="open"
        class="img-editor__scrim"
        role="dialog"
        aria-modal="true"
        aria-label="Edit image"
        @keydown.esc.stop="onCancel"
      >
        <div class="img-editor" @click.stop>
          <!-- Header -->
          <header class="img-editor__head">
            <div class="img-editor__title">Edit image</div>
            <button
              type="button"
              class="img-editor__icon-btn"
              aria-label="Close"
              title="Close"
              @click="onCancel"
            >
              <!-- V3-F #12: colourful close glyph. -->
              <Icon name="x" :size="16" class="text-[var(--color-ink-2)]" />
            </button>
          </header>

          <!-- Toolbar. V3-F #12: colourful tool glyphs — rotate (blue), flip
               (teal), crop (violet) — so the edit affordances pop like the
               rest of the app. Labels/buttons stay neutral; only the icons
               carry the hue (and keep it on hover via the direct svg colour). -->
          <div class="img-editor__toolbar">
            <button
              type="button"
              class="img-editor__tool"
              title="Rotate left"
              aria-label="Rotate left"
              :disabled="busy"
              @click="rotateBy(-90)"
            >
              <Icon
                name="rotate-ccw"
                :size="15"
                class="text-[var(--color-ink-2)]"
              />
            </button>
            <button
              type="button"
              class="img-editor__tool"
              title="Rotate right"
              aria-label="Rotate right"
              :disabled="busy"
              @click="rotateBy(90)"
            >
              <Icon
                name="rotate-cw"
                :size="15"
                class="text-[var(--color-ink-2)]"
              />
            </button>
            <div class="img-editor__sep"></div>
            <button
              type="button"
              class="img-editor__tool"
              title="Flip horizontal"
              aria-label="Flip horizontal"
              :disabled="busy"
              @click="flipH = !flipH"
            >
              <Icon
                name="flip-horizontal-2"
                :size="15"
                class="text-[var(--color-ink-2)]"
              />
            </button>
            <button
              type="button"
              class="img-editor__tool"
              title="Flip vertical"
              aria-label="Flip vertical"
              :disabled="busy"
              @click="flipV = !flipV"
            >
              <Icon
                name="flip-vertical-2"
                :size="15"
                class="text-[var(--color-ink-2)]"
              />
            </button>
            <div class="img-editor__sep"></div>
            <button
              type="button"
              class="img-editor__tool"
              :class="{ 'is-active': cropMode }"
              title="Crop"
              aria-label="Crop"
              :disabled="busy"
              @click="toggleCrop"
            >
              <Icon name="crop" :size="15" class="text-[var(--color-ink-2)]" />
            </button>
            <div class="img-editor__spacer"></div>
            <button
              type="button"
              class="img-editor__tool img-editor__tool--text"
              title="Reset all edits"
              :disabled="busy || !isDirty"
              @click="reset"
            >
              <Icon name="undo-2" :size="14" />
              <span>Reset</span>
            </button>
          </div>

          <!-- Stage -->
          <div ref="stageEl" class="img-editor__stage">
            <div v-if="loading" class="img-editor__loading">
              <Icon name="loader-circle" :size="24" class="img-editor__spin" />
            </div>
            <div v-else-if="loadError" class="img-editor__error">
              <Icon name="image-off" :size="28" :stroke-width="1.4" />
              <span>{{ loadError }}</span>
            </div>
            <!-- Canvas + crop overlay share a positioned wrapper sized
                 exactly to the rendered canvas, so the marquee coords
                 line up 1:1 with display pixels. -->
            <div
              v-show="!loading && !loadError"
              class="img-editor__canvas-wrap"
              :style="{ width: canvasW + 'px', height: canvasH + 'px' }"
            >
              <canvas ref="canvasEl" class="img-editor__canvas"></canvas>

              <div
                v-if="cropMode"
                class="img-editor__crop"
                :style="cropStyle"
                @pointerdown.self="startCropDrag('move', $event)"
              >
                <span
                  class="img-editor__crop-third img-editor__crop-third--v1"
                />
                <span
                  class="img-editor__crop-third img-editor__crop-third--v2"
                />
                <span
                  class="img-editor__crop-third img-editor__crop-third--h1"
                />
                <span
                  class="img-editor__crop-third img-editor__crop-third--h2"
                />
                <span
                  v-for="hdl in handles"
                  :key="hdl"
                  class="img-editor__handle"
                  :class="`img-editor__handle--${hdl}`"
                  @pointerdown.stop="startCropDrag(hdl, $event)"
                />
              </div>
            </div>
          </div>

          <!-- Footer: name + actions -->
          <footer class="img-editor__foot">
            <label class="img-editor__name">
              <span class="img-editor__name-label">Save as</span>
              <input
                v-model.trim="outName"
                type="text"
                class="img-editor__name-input"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
              />
            </label>
            <div v-if="saveError" class="img-editor__save-error">
              {{ saveError }}
            </div>
            <div class="img-editor__foot-actions">
              <button
                type="button"
                class="img-editor__btn img-editor__btn--ghost"
                :disabled="busy"
                @click="onCancel"
              >
                Cancel
              </button>
              <button
                type="button"
                class="img-editor__btn img-editor__btn--primary"
                :disabled="
                  busy ||
                  loading ||
                  !!loadError ||
                  !outName ||
                  confirmingOverwrite
                "
                @click="onSave"
              >
                <Icon
                  v-if="busy"
                  name="loader-circle"
                  :size="14"
                  class="img-editor__spin"
                />
                <span>{{ busy ? "Saving…" : "Save copy" }}</span>
              </button>
            </div>

            <!-- RC-38: name collision → confirm overwrite (full-width row). -->
            <div v-if="confirmingOverwrite" class="img-editor__confirm">
              <span class="img-editor__confirm-msg">
                “{{ outName }}” already exists. Overwrite it?
              </span>
              <div class="img-editor__confirm-actions">
                <button
                  type="button"
                  class="img-editor__btn img-editor__btn--ghost"
                  :disabled="busy"
                  @click="confirmingOverwrite = false"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="img-editor__btn img-editor__btn--danger"
                  :disabled="busy"
                  @click="performSave(true)"
                >
                  <Icon
                    v-if="busy"
                    name="loader-circle"
                    :size="14"
                    class="img-editor__spin"
                  />
                  <span>{{ busy ? "Overwriting…" : "Overwrite" }}</span>
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Icon from "@/components/Icon.vue";
import { files as api } from "@/api";
import {
  loadEditableImage,
  renderOriented,
  renderFinal,
  outputFormatFor,
  exportCanvas,
  defaultEditedName,
  type RotateDeg,
  type CropRect,
} from "@/utils/imageEdit";

const props = defineProps<{
  open: boolean;
  /** Full-resolution original URL (raw/inline). */
  src: string;
  /** Source filename, e.g. "photo.jpg". */
  name: string;
  /** Destination directory route path (where the copy is written),
   *  e.g. "/files/Photos/". */
  dir: string;
  /** Existing sibling filenames — for unique default + conflict check. */
  existingNames: string[];
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved", name: string): void;
}>();

const $showError = inject<IToastError>("$showError")!;

// ── Transform state ─────────────────────────────────────────────────
const rotate = ref<RotateDeg>(0);
const flipH = ref<boolean>(false);
const flipV = ref<boolean>(false);
const cropMode = ref<boolean>(false);
// Crop box in DISPLAY pixels (relative to the canvas wrapper).
const cropBox = ref<{ x: number; y: number; w: number; h: number } | null>(
  null
);

const loading = ref<boolean>(false);
const loadError = ref<string>("");
const busy = ref<boolean>(false);
const saveError = ref<string>("");
const outName = ref<string>("");
// RC-38: a name collision now prompts for overwrite instead of hard-
// blocking. This is true while the inline "overwrite?" confirm is shown.
const confirmingOverwrite = ref<boolean>(false);

// Changing the target name dismisses a stale overwrite prompt — the new
// name may not collide at all.
watch(outName, () => {
  confirmingOverwrite.value = false;
});

const stageEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const canvasW = ref<number>(0);
const canvasH = ref<number>(0);

let bitmap: ImageBitmap | null = null;
/** Scale from oriented-natural px → display px (display / natural). */
let displayScale = 1;

const handles = ["nw", "ne", "sw", "se", "n", "s", "e", "w"] as const;
type Handle = (typeof handles)[number];

const isDirty = computed(
  () =>
    rotate.value !== 0 || flipH.value || flipV.value || cropBox.value !== null
);

const cropStyle = computed(() => {
  const b = cropBox.value;
  if (!b) return { display: "none" };
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
  };
});

// ── Lifecycle: load on open, reset on close ─────────────────────────
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      bitmap?.close?.();
      bitmap = null;
      return;
    }
    resetState();
    await loadImage();
  }
);

const resetState = () => {
  rotate.value = 0;
  flipH.value = false;
  flipV.value = false;
  cropMode.value = false;
  cropBox.value = null;
  saveError.value = "";
  loadError.value = "";
  confirmingOverwrite.value = false;
};

const loadImage = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    bitmap = await loadEditableImage(props.src);
    const fmt = outputFormatFor(props.name);
    outName.value = defaultEditedName(
      props.name,
      fmt.ext,
      new Set(props.existingNames)
    );
    await nextTick();
    drawDisplay();
  } catch (e) {
    loadError.value =
      e instanceof Error ? e.message : "Couldn't load this image.";
  } finally {
    loading.value = false;
  }
};

/** Render the oriented image into the visible canvas, fit to the stage,
 *  and recompute displayScale. Crop box is cleared (dims changed). */
const drawDisplay = () => {
  if (!bitmap || !canvasEl.value || !stageEl.value) return;
  const swap = rotate.value === 90 || rotate.value === 270;
  const orientedW = swap ? bitmap.height : bitmap.width;
  const orientedH = swap ? bitmap.width : bitmap.height;

  // Fit within the stage (minus padding) without upscaling past 1:1.
  const stage = stageEl.value.getBoundingClientRect();
  const maxW = Math.max(64, stage.width - 48);
  const maxH = Math.max(64, stage.height - 48);
  displayScale = Math.min(maxW / orientedW, maxH / orientedH, 1);

  const c = renderOriented(
    bitmap,
    { rotate: rotate.value, flipH: flipH.value, flipV: flipV.value },
    displayScale
  );
  canvasW.value = c.width;
  canvasH.value = c.height;
  const dst = canvasEl.value;
  dst.width = c.width;
  dst.height = c.height;
  const ctx = dst.getContext("2d");
  ctx?.drawImage(c, 0, 0);
};

// ── Toolbar actions ─────────────────────────────────────────────────
const rotateBy = (delta: number) => {
  rotate.value = ((((rotate.value + delta) % 360) + 360) % 360) as RotateDeg;
  cropBox.value = null;
  void nextTick(drawDisplay);
};

watch([flipH, flipV], () => {
  cropBox.value = null;
  void nextTick(drawDisplay);
});

const toggleCrop = () => {
  cropMode.value = !cropMode.value;
  if (cropMode.value && !cropBox.value) {
    // Seed a centered box at ~80% of the canvas.
    const w = canvasW.value * 0.8;
    const h = canvasH.value * 0.8;
    cropBox.value = {
      x: (canvasW.value - w) / 2,
      y: (canvasH.value - h) / 2,
      w,
      h,
    };
  }
};

const reset = () => {
  resetState();
  void nextTick(drawDisplay);
};

// ── Crop marquee drag/resize ────────────────────────────────────────
const MIN_CROP = 24; // px

const startCropDrag = (mode: Handle | "move", e: PointerEvent) => {
  if (!cropBox.value) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const init = { ...cropBox.value };
  const maxW = canvasW.value;
  const maxH = canvasH.value;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let { x, y, w, h } = init;

    if (mode === "move") {
      x = Math.min(Math.max(0, init.x + dx), maxW - init.w);
      y = Math.min(Math.max(0, init.y + dy), maxH - init.h);
    } else {
      if (mode.includes("e")) w = Math.min(init.w + dx, maxW - init.x);
      if (mode.includes("s")) h = Math.min(init.h + dy, maxH - init.y);
      if (mode.includes("w")) {
        const nx = Math.min(
          Math.max(0, init.x + dx),
          init.x + init.w - MIN_CROP
        );
        w = init.w + (init.x - nx);
        x = nx;
      }
      if (mode.includes("n")) {
        const ny = Math.min(
          Math.max(0, init.y + dy),
          init.y + init.h - MIN_CROP
        );
        h = init.h + (init.y - ny);
        y = ny;
      }
      w = Math.max(MIN_CROP, w);
      h = Math.max(MIN_CROP, h);
    }
    cropBox.value = { x, y, w, h };
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};

// ── Save ────────────────────────────────────────────────────────────
const onSave = () => {
  if (busy.value) return;
  saveError.value = "";
  const fileName = outName.value.trim();
  if (!fileName) return;
  if (fileName.includes("/")) {
    saveError.value = "Name can't contain a slash.";
    return;
  }
  // RC-38: don't hard-block on a collision — surface the inline overwrite
  // confirm and let the user decide (Overwrite button calls performSave).
  if (props.existingNames.includes(fileName)) {
    confirmingOverwrite.value = true;
    return;
  }
  void performSave(false);
};

const performSave = async (overwrite: boolean) => {
  if (!bitmap || busy.value) return;
  const fileName = outName.value.trim();
  if (!fileName) return;

  // Map the display-space crop box to oriented natural pixels.
  let crop: CropRect | null = null;
  if (cropMode.value && cropBox.value) {
    const b = cropBox.value;
    crop = {
      x: b.x / displayScale,
      y: b.y / displayScale,
      w: b.w / displayScale,
      h: b.h / displayScale,
    };
  }

  busy.value = true;
  try {
    const canvas = renderFinal(bitmap, {
      rotate: rotate.value,
      flipH: flipH.value,
      flipV: flipV.value,
      crop,
    });
    const fmt = outputFormatFor(props.name);
    const blob = await exportCanvas(canvas, fmt);
    const destPath =
      (props.dir.endsWith("/") ? props.dir : props.dir + "/") +
      encodeURIComponent(fileName);
    await api.post(destPath, blob, overwrite);
    emit("saved", fileName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    saveError.value = msg;
    $showError(new Error(msg));
  } finally {
    busy.value = false;
    confirmingOverwrite.value = false;
  }
};

const onCancel = () => {
  if (busy.value) return;
  emit("cancel");
};

// Re-fit the canvas if the window resizes while open.
const onResize = () => {
  if (props.open && !loading.value && !loadError.value) drawDisplay();
};
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  bitmap?.close?.();
});
</script>

<style scoped>
.img-editor__scrim {
  position: fixed;
  inset: 0;
  /* Must sit ABOVE the preview shell (.preview-shell is a fixed
     full-screen overlay at z-index 9999). The editor is launched from
     inside the preview and teleported to <body>, so a lower z-index made
     it render behind the preview — the modal opened invisibly and looked
     like the Edit button did nothing (RC-13). */
  z-index: 10000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.img-editor {
  width: min(1100px, 100%);
  height: min(820px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.5);
}

.img-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-line, #ececec);
}
.img-editor__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}
.img-editor__icon-btn {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color var(--dur-base) ease;
}
.img-editor__icon-btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.img-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}
.img-editor__tool {
  height: 30px;
  min-width: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 7px;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease,
    border-color var(--dur-base) ease;
}
.img-editor__tool:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.img-editor__tool.is-active {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.12));
  color: var(--color-accent, #6e72d9);
  border-color: var(--color-accent, #6e72d9);
}
.img-editor__tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.img-editor__tool--text {
  padding: 0 10px;
}
.img-editor__sep {
  width: 1px;
  height: 18px;
  background: var(--color-line, #ececec);
  margin: 0 4px;
}
.img-editor__spacer {
  flex: 1;
}

.img-editor__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--color-canvas, #fafaf9);
  background-image: radial-gradient(
    rgba(24, 24, 27, 0.05) 1px,
    transparent 1px
  );
  background-size: 20px 20px;
  overflow: hidden;
}
html.dark .img-editor__stage {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px
  );
}

.img-editor__canvas-wrap {
  position: relative;
  flex-shrink: 0;
}
.img-editor__canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.3);
}

/* ── Crop marquee ──────────────────────────────────────────────────── */
.img-editor__crop {
  position: absolute;
  border: 1px solid var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.45);
  cursor: move;
  touch-action: none;
}
.img-editor__crop-third {
  position: absolute;
  background: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}
.img-editor__crop-third--v1 {
  top: 0;
  bottom: 0;
  left: 33.33%;
  width: 1px;
}
.img-editor__crop-third--v2 {
  top: 0;
  bottom: 0;
  left: 66.66%;
  width: 1px;
}
.img-editor__crop-third--h1 {
  left: 0;
  right: 0;
  top: 33.33%;
  height: 1px;
}
.img-editor__crop-third--h2 {
  left: 0;
  right: 0;
  top: 66.66%;
  height: 1px;
}
.img-editor__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--color-surface, #fff);
  border: 1.5px solid var(--color-accent, #6e72d9);
  border-radius: 2px;
  touch-action: none;
}
.img-editor__handle--nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}
.img-editor__handle--ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}
.img-editor__handle--sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}
.img-editor__handle--se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}
.img-editor__handle--n {
  top: -6px;
  left: calc(50% - 6px);
  cursor: ns-resize;
}
.img-editor__handle--s {
  bottom: -6px;
  left: calc(50% - 6px);
  cursor: ns-resize;
}
.img-editor__handle--e {
  right: -6px;
  top: calc(50% - 6px);
  cursor: ew-resize;
}
.img-editor__handle--w {
  left: -6px;
  top: calc(50% - 6px);
  cursor: ew-resize;
}

.img-editor__loading,
.img-editor__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}
.img-editor__spin {
  animation: img-editor-spin 0.9s linear infinite;
  color: var(--color-accent, #6e72d9);
}
@keyframes img-editor-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .img-editor__spin {
    animation: none;
  }
}

/* ── Footer ────────────────────────────────────────────────────────── */
.img-editor__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  flex-wrap: wrap;
}
.img-editor__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}
.img-editor__name-label {
  font-size: 12.5px;
  color: var(--color-ink-3, #a1a1aa);
  white-space: nowrap;
}
.img-editor__name-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 7px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  outline: none;
  transition:
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.img-editor__name-input:focus {
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.3));
}
.img-editor__save-error {
  font-size: 12px;
  color: var(--status-danger);
}
html.dark .img-editor__save-error {
  color: var(--status-danger);
}
.img-editor__foot-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.img-editor__btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.img-editor__btn--ghost {
  background: transparent;
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}
.img-editor__btn--ghost:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.img-editor__btn--primary {
  background: var(--accent-gradient);
  color: white;
}
.img-editor__btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #575cc7);
}
.img-editor__btn--danger {
  background: var(--status-danger-fill);
  color: white;
}
.img-editor__btn--danger:hover:not(:disabled) {
  background: var(--status-danger-fill-strong);
}
.img-editor__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* RC-38: inline overwrite-confirm bar (full-width row in the footer). */
.img-editor__confirm {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px 8px 12px;
  border-radius: 8px;
  background: var(--status-warning-soft);
  border: 1px solid var(--status-warning-ring);
}
.img-editor__confirm-msg {
  font-size: 12.5px;
  color: var(--color-ink-1, #18181b);
  min-width: 0;
}
.img-editor__confirm-actions {
  display: inline-flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Transition ────────────────────────────────────────────────────── */
.img-editor-enter-active,
.img-editor-leave-active {
  transition: opacity 0.15s ease;
}
.img-editor-enter-from,
.img-editor-leave-to {
  opacity: 0;
}
</style>
