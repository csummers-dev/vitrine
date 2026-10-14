<template>
  <button
    :type="type"
    class="ui-icon-btn"
    :class="[`ui-icon-btn--${variant}`, `ui-icon-btn--${size}`]"
    :aria-label="label"
    :aria-pressed="
      pressed === undefined ? undefined : pressed ? 'true' : 'false'
    "
    :title="tooltip ?? label"
    :disabled="disabled"
  >
    <Icon :name="icon" :size="size === 'sm' ? 15 : 17" :stroke-width="1.8" />
  </button>
</template>

<script setup lang="ts">
/**
 * A button that is only an icon. `label` is required (type-checked): it is
 * the accessible name and the tooltip. On touch screens the hit area grows
 * to 44 px around the drawn button.
 */
import Icon from "@/components/Icon.vue";

withDefaults(
  defineProps<{
    icon: string;
    label: string;
    tooltip?: string;
    variant?: "ghost" | "secondary" | "primary";
    size?: "sm" | "md";
    /** Set for toggle buttons (a pressed state is announced). */
    pressed?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
  }>(),
  { variant: "ghost", size: "md", type: "button", pressed: undefined }
);
</script>

<style scoped>
.ui-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-ink-2);
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.ui-icon-btn--sm {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
}
.ui-icon-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.ui-icon-btn--secondary {
  background: var(--color-raised);
  border-color: var(--color-line-strong);
}
.ui-icon-btn--secondary:hover:not(:disabled) {
  background: var(--color-elevated);
}
.ui-icon-btn--primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
.ui-icon-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong);
  color: var(--color-on-accent);
}
.ui-icon-btn[aria-pressed="true"] {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.ui-icon-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.ui-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 44 px touch target without changing the drawn size. */
@media (pointer: coarse) {
  .ui-icon-btn::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}
</style>
