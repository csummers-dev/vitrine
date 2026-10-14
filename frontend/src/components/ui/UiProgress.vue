<template>
  <div
    v-if="variant === 'bar'"
    class="ui-progress"
    :class="[
      `ui-progress--${tone}`,
      { 'is-indeterminate': value === undefined },
    ]"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="value === undefined ? undefined : clamped"
    :aria-valuetext="valueText"
  >
    <div
      class="ui-progress__fill"
      :style="value === undefined ? undefined : { width: pct + '%' }"
    ></div>
  </div>
  <svg
    v-else
    class="ui-ring"
    :class="[
      `ui-progress--${tone}`,
      { 'is-indeterminate': value === undefined },
    ]"
    :width="size"
    :height="size"
    viewBox="0 0 36 36"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="value === undefined ? undefined : clamped"
    :aria-valuetext="valueText"
  >
    <circle class="ui-ring__track" cx="18" cy="18" r="15" />
    <circle
      class="ui-ring__fill"
      cx="18"
      cy="18"
      r="15"
      :stroke-dasharray="CIRC"
      :stroke-dashoffset="
        value === undefined ? CIRC * 0.7 : CIRC * (1 - pct / 100)
      "
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * Progress bar or ring. Leave `value` undefined for indeterminate (no
 * aria-valuenow). `label` names it for screen readers.
 */
import { computed } from "vue";

const CIRC = 2 * Math.PI * 15;

const props = withDefaults(
  defineProps<{
    value?: number;
    max?: number;
    label: string;
    valueText?: string;
    variant?: "bar" | "ring";
    tone?: "accent" | "success" | "danger";
    /** Ring diameter in px. */
    size?: number;
  }>(),
  { max: 100, variant: "bar", tone: "accent", size: 20 }
);

const clamped = computed(() =>
  Math.min(props.max, Math.max(0, props.value ?? 0))
);
const pct = computed(() =>
  props.max > 0 ? (clamped.value / props.max) * 100 : 0
);
</script>

<style scoped>
.ui-progress {
  --tone: var(--color-accent);
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  overflow: hidden;
}
.ui-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--tone);
  transition: width var(--dur-slow) var(--ease);
}
.ui-progress.is-indeterminate .ui-progress__fill {
  width: 35%;
  animation: ui-progress-slide 1.2s var(--ease) infinite;
}
@keyframes ui-progress-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}

.ui-ring {
  --tone: var(--color-accent);
  transform: rotate(-90deg);
  flex-shrink: 0;
}
.ui-ring__track {
  fill: none;
  stroke: var(--color-elevated);
  stroke-width: 4;
}
.ui-ring__fill {
  fill: none;
  stroke: var(--tone);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--dur-slow) var(--ease);
}
.ui-ring.is-indeterminate {
  animation: ui-ring-spin 0.9s linear infinite;
}
@keyframes ui-ring-spin {
  from {
    transform: rotate(-90deg);
  }
  to {
    transform: rotate(270deg);
  }
}
/* Tones come last so they override the ring default too. */
.ui-progress--success {
  --tone: var(--status-success-fill);
}
.ui-progress--danger {
  --tone: var(--status-danger-fill);
}
@media (prefers-reduced-motion: reduce) {
  .ui-progress.is-indeterminate .ui-progress__fill {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
  .ui-ring.is-indeterminate {
    animation-duration: 3s;
  }
}
</style>
