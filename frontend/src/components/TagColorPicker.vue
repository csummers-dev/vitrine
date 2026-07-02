<template>
  <div
    v-if="open"
    ref="popoverEl"
    class="tag-color-picker"
    role="dialog"
    aria-label="Pick tag color"
    @click.stop
  >
    <button
      v-for="c in palette"
      :key="c"
      type="button"
      class="tag-color-picker__swatch"
      :class="[
        `tag-color-picker__swatch--${c}`,
        { 'tag-color-picker__swatch--selected': c === current },
      ]"
      :aria-label="`Color ${c}`"
      :aria-pressed="c === current"
      :title="c"
      @click="onPick(c)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * TagColorPicker — 8-swatch popover for changing a tag's color
 * (v1.3 S2-8).
 *
 * Self-contained "click-out closes" UI primitive. The caller controls
 * placement (absolute position) and the `open` flag; the picker
 * handles its own outside-click + Esc dismissal and emits `pick`
 * when the user commits to a swatch.
 *
 * Persistence happens at the caller (TagPickerSheet) so the optimistic
 * store update + rollback are visible to the tag list immediately —
 * keeping that logic out of this primitive matches how TagChip works.
 */
import { onBeforeUnmount, ref, watch } from "vue";

const palette: TagColor[] = [
  "lilac",
  "blue",
  "green",
  "amber",
  "red",
  "pink",
  "slate",
  "teal",
];

const props = defineProps<{
  /** Whether the popover is visible. */
  open: boolean;
  /** Current color — gets the selected ring. */
  current: TagColor;
}>();

const emit = defineEmits<{
  (e: "pick", color: TagColor): void;
  (e: "close"): void;
}>();

const popoverEl = ref<HTMLElement | null>(null);

const onPick = (color: TagColor) => {
  emit("pick", color);
  emit("close");
};

// Document-level click + Esc dismissal. Installed on open, torn down
// on close (and on unmount). The `setTimeout(0)` defers attachment by
// a tick so the click that OPENED the popover doesn't immediately
// close it again.
const onDocClick = (e: MouseEvent) => {
  const el = popoverEl.value;
  if (el && !el.contains(e.target as Node)) emit("close");
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      setTimeout(() => {
        document.addEventListener("click", onDocClick);
        document.addEventListener("keydown", onKey);
      }, 0);
    } else {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    }
  }
);

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.tag-color-picker {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  box-shadow:
    0 4px 12px -4px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.03);
  /* Width sized to 4 swatches per row at 22px + 6px gap + 16px
     padding = ~128px. Two rows of 4. */
  width: 128px;
}

.tag-color-picker__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.1s ease;
}

.tag-color-picker__swatch:hover {
  transform: scale(1.12);
}

.tag-color-picker__swatch:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.tag-color-picker__swatch--selected {
  border-color: var(--color-ink-1, #18181b);
}

/* Color variants — same fg color as TagChip's foreground tone so the
   swatch reads as "this is what your chip will look like". */
.tag-color-picker__swatch--lilac {
  background: var(--tag-color-lilac-fg);
}
.tag-color-picker__swatch--blue {
  background: var(--tag-color-blue-fg);
}
.tag-color-picker__swatch--green {
  background: var(--tag-color-green-fg);
}
.tag-color-picker__swatch--amber {
  background: var(--tag-color-amber-fg);
}
.tag-color-picker__swatch--red {
  background: var(--tag-color-red-fg);
}
.tag-color-picker__swatch--pink {
  background: var(--tag-color-pink-fg);
}
.tag-color-picker__swatch--slate {
  background: var(--tag-color-slate-fg);
}
.tag-color-picker__swatch--teal {
  background: var(--tag-color-teal-fg);
}

@media (prefers-reduced-motion: reduce) {
  .tag-color-picker__swatch {
    transition: none;
  }
}
</style>
