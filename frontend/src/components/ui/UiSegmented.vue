<template>
  <div
    ref="root"
    class="ui-seg"
    :class="`ui-seg--${size}`"
    role="radiogroup"
    :aria-label="ariaLabel"
    @keydown="onKey"
  >
    <button
      v-for="(opt, i) in options"
      :key="String(opt.value)"
      type="button"
      role="radio"
      class="ui-seg__option"
      :class="{
        'is-selected': modelValue === opt.value,
        'is-icon-only': iconOnly,
      }"
      :aria-checked="modelValue === opt.value ? 'true' : 'false'"
      :aria-label="iconOnly ? opt.label : undefined"
      :title="opt.label"
      :tabindex="
        modelValue === opt.value || (!hasSelection && i === 0) ? 0 : -1
      "
      :disabled="opt.disabled"
      @click="select(opt.value)"
    >
      <Icon v-if="opt.icon" :name="opt.icon" :size="14" :stroke-width="1.7" />
      <span v-if="!iconOnly">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
/**
 * Segmented control with radio-group semantics: one tab stop, the arrow
 * keys move and select, Home and End jump to the ends.
 */
import { computed, nextTick, ref } from "vue";
import Icon from "@/components/Icon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: { value: T; label: string; icon?: string; disabled?: boolean }[];
    ariaLabel?: string;
    /** Show icons only (labels become accessible names and tooltips). */
    iconOnly?: boolean;
    size?: "sm" | "md";
  }>(),
  { size: "md" }
);
const emit = defineEmits<{ (e: "update:modelValue", v: T): void }>();

const root = ref<HTMLElement | null>(null);
const hasSelection = computed(() =>
  props.options.some((o) => o.value === props.modelValue)
);

const select = (v: T) => {
  if (v !== props.modelValue) emit("update:modelValue", v);
};

const onKey = (e: KeyboardEvent) => {
  const enabled = props.options.filter((o) => !o.disabled);
  if (!enabled.length) return;
  const cur = enabled.findIndex((o) => o.value === props.modelValue);
  const rtl = root.value
    ? getComputedStyle(root.value).direction === "rtl"
    : false;
  let next = -1;
  switch (e.key) {
    case "ArrowRight":
      next = cur + (rtl ? -1 : 1);
      break;
    case "ArrowLeft":
      next = cur + (rtl ? 1 : -1);
      break;
    case "ArrowDown":
      next = cur + 1;
      break;
    case "ArrowUp":
      next = cur - 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = enabled.length - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  next = (next + enabled.length) % enabled.length;
  select(enabled[next].value);
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
};
</script>

<style scoped>
.ui-seg {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--color-elevated);
}
.ui-seg__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink-2);
  font-family: inherit;
  font-size: var(--type-body);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.ui-seg--sm .ui-seg__option {
  height: 24px;
  padding: 0 var(--space-2);
  font-size: var(--type-small);
}
.ui-seg__option.is-icon-only {
  width: 30px;
  padding: 0;
}
.ui-seg__option:hover:not(.is-selected):not(:disabled) {
  color: var(--color-ink-1);
}
.ui-seg__option.is-selected {
  background: var(--color-raised);
  color: var(--color-ink-1);
  box-shadow: var(--shadow-1);
}
.ui-seg__option:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.ui-seg__option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
