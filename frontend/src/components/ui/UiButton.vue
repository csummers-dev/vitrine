<template>
  <button
    :type="type"
    class="ui-btn"
    :class="[
      `ui-btn--${variant}`,
      `ui-btn--${size}`,
      { 'is-block': block, 'is-loading': loading },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="disabled && disabledReason ? 'true' : undefined"
    :title="disabled && disabledReason ? disabledReason : title"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true"></span>
    <span class="ui-btn__content">
      <Icon v-if="icon" :name="icon" :size="iconSize" :stroke-width="1.8" />
      <span v-if="$slots.default" class="ui-btn__label"><slot /></span>
      <Icon
        v-if="iconAfter"
        :name="iconAfter"
        :size="iconSize"
        :stroke-width="1.8"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * The app's button (Phase 6). Variants: primary (accent fill), secondary
 * (raised, bordered), ghost (text only) and danger. While `loading`, the
 * label stays in place (the width doesn't jump), a spinner sits over it and
 * the button is busy and disabled. A disabled button can say why in
 * `disabledReason`, shown as its tooltip.
 */
import { computed } from "vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    type?: "button" | "submit" | "reset";
    icon?: string;
    iconAfter?: string;
    loading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    title?: string;
    /** Full width. */
    block?: boolean;
  }>(),
  { variant: "secondary", size: "md", type: "button" }
);

const iconSize = computed(() => (props.size === "sm" ? 14 : 16));
</script>

<style scoped>
.ui-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--type-ui);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.ui-btn--sm {
  height: 30px;
  padding: 0 var(--space-3);
  font-size: var(--type-body);
  border-radius: var(--radius-sm);
}
.ui-btn.is-block {
  display: flex;
  width: 100%;
}
.ui-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.ui-btn--primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
.ui-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong);
}

.ui-btn--secondary {
  background: var(--color-raised);
  border-color: var(--color-line-strong);
  color: var(--color-ink-1);
  font-weight: 500;
}
.ui-btn--secondary:hover:not(:disabled) {
  background: var(--color-elevated);
}

.ui-btn--ghost {
  background: transparent;
  color: var(--color-ink-2);
  font-weight: 500;
}
.ui-btn--ghost:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-ink-1);
}

.ui-btn--danger {
  background: var(--status-danger-fill);
  color: var(--media-ink);
}
.ui-btn--danger:hover:not(:disabled) {
  background: var(--status-danger-fill-strong);
}

.ui-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-btn.is-loading {
  cursor: progress;
  opacity: 1;
}

.ui-btn__content {
  display: inline-flex;
  align-items: center;
  gap: inherit;
  min-width: 0;
}
.ui-btn__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Hidden but still the accessible name, and still holding the width. */
.ui-btn.is-loading .ui-btn__content {
  opacity: 0;
}
.ui-btn__spinner {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: ui-btn-spin 0.7s linear infinite;
}
@keyframes ui-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-btn__spinner {
    animation-duration: 2s;
  }
}
</style>
