<template>
  <span
    class="skeleton"
    :class="[`skeleton--${shape}`, { 'is-circle': circle }]"
    :style="style"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
/**
 * Loading placeholder. Shapes: `text` (one line), `row` (a list row),
 * `tile` (a grid tile), `circle`, or `block` sized by width/height.
 * Shimmer stops under reduced motion.
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    shape?: "block" | "text" | "row" | "tile" | "circle";
    /** Width — any CSS length, or a number in px. */
    width?: string | number;
    /** Height — same forms. */
    height?: string | number;
    /** Older callers: render as a circle (width is the diameter). */
    circle?: boolean;
    radius?: string | number;
  }>(),
  { shape: "block" }
);

const toLen = (v: string | number | undefined): string | undefined =>
  v === undefined ? undefined : typeof v === "number" ? `${v}px` : v;

const style = computed(() => {
  const out: Record<string, string> = {};
  const w = toLen(props.width);
  if (w) out.width = w;
  const round = props.circle || props.shape === "circle";
  const h = round ? w : toLen(props.height);
  if (h) out.height = h;
  const r = toLen(props.radius);
  if (r) out.borderRadius = r;
  return out;
});
</script>

<style scoped>
.skeleton {
  display: inline-block;
  height: 12px;
  background: linear-gradient(
    90deg,
    var(--color-elevated) 0%,
    var(--color-line) 50%,
    var(--color-elevated) 100%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-xs);
  vertical-align: middle;
  animation: skeleton-shimmer 1.4s linear infinite;
}
.skeleton--text {
  width: 100%;
  height: 12px;
}
.skeleton--row {
  display: block;
  width: 100%;
  height: 44px;
  border-radius: var(--radius-md);
}
.skeleton--tile {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  height: auto;
  border-radius: var(--radius-lg);
}
.skeleton--circle,
.skeleton.is-circle {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
}
@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
