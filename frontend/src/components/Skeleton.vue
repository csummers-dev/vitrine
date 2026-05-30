<template>
  <span
    class="skeleton"
    :class="{ 'is-circle': circle }"
    :style="style"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** Width — accepts any CSS length, percentage, or number (interpreted as px). */
    width?: string | number;
    /** Height — same accepted forms. Defaults to 12px (one line of text). */
    height?: string | number;
    /** Render as a circle (uses width as diameter; height ignored). */
    circle?: boolean;
    /** Override the base radius (defaults to 4px). */
    radius?: string | number;
  }>(),
  { height: 12 }
);

const toLen = (v: string | number | undefined): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === "number") return `${v}px`;
  return v;
};

const style = computed(() => {
  const out: Record<string, string> = {};
  const w = toLen(props.width);
  if (w) out.width = w;
  if (props.circle) {
    if (w) out.height = w;
  } else {
    const h = toLen(props.height);
    if (h) out.height = h;
  }
  const r = toLen(props.radius);
  if (r) out.borderRadius = r;
  return out;
});
</script>

<style scoped>
/* Subtle shimmer placeholder. Color tokens flip with dark mode.
   Respects prefers-reduced-motion via the global override in styles.css
   (animation-duration is forced to 0.01ms there). */
.skeleton {
  display: inline-block;
  background: linear-gradient(
    90deg,
    var(--color-elevated, #f4f4f5) 0%,
    var(--color-line, #ececec) 50%,
    var(--color-elevated, #f4f4f5) 100%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  vertical-align: middle;
  animation: skeleton-shimmer 1.4s linear infinite;
}

.skeleton.is-circle {
  border-radius: 50%;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
