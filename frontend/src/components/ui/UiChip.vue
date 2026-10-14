<template>
  <button
    type="button"
    class="ui-chip"
    :aria-pressed="pressed ? 'true' : 'false'"
    :disabled="disabled"
  >
    <Icon v-if="icon" :name="icon" :size="13" :stroke-width="1.8" />
    <span><slot /></span>
    <UiBadge v-if="count !== undefined" :count="count" quiet />
  </button>
</template>

<script setup lang="ts">
/** Filter chip: a toggle button with a pressed state and optional count. */
import Icon from "@/components/Icon.vue";
import UiBadge from "./UiBadge.vue";

defineProps<{
  pressed?: boolean;
  count?: number;
  icon?: string;
  disabled?: boolean;
}>();
</script>

<style scoped>
.ui-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-line-strong);
  background: var(--color-raised);
  color: var(--color-ink-2);
  font-family: inherit;
  font-size: var(--type-body);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.ui-chip:hover:not(:disabled) {
  background: var(--color-elevated);
  color: var(--color-ink-1);
}
.ui-chip[aria-pressed="true"] {
  background: var(--color-accent-soft);
  border-color: transparent;
  color: var(--color-accent-ink);
}
.ui-chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.ui-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
