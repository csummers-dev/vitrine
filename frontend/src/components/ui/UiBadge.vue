<template>
  <span
    class="ui-badge"
    :class="[`ui-badge--${tone}`, { 'is-quiet': quiet }]"
    >{{ text }}</span
  >
</template>

<script setup lang="ts">
/** Small count or status badge. Counts over `max` show as "max+". */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    count?: number;
    label?: string;
    max?: number;
    tone?: "neutral" | "accent" | "danger" | "success" | "warning";
    /** Text-only, for inside chips and nav rows. */
    quiet?: boolean;
  }>(),
  { max: 999, tone: "neutral" }
);

const text = computed(() => {
  if (props.label !== undefined) return props.label;
  const n = props.count ?? 0;
  return n > props.max ? `${props.max}+` : String(n);
});
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: var(--type-caption);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  box-sizing: border-box;
}
.ui-badge--neutral {
  background: var(--color-elevated);
  color: var(--color-ink-2);
}
.ui-badge--accent {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.ui-badge--danger {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}
.ui-badge--success {
  background: var(--status-success-soft);
  color: var(--status-success);
}
.ui-badge--warning {
  background: var(--status-warning-soft);
  color: var(--status-warning);
}
.ui-badge.is-quiet {
  min-width: 0;
  height: auto;
  padding: 0;
  background: none;
  color: inherit;
  font-weight: 500;
}
</style>
