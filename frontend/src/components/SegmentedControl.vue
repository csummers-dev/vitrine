<template>
  <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :class="['segmented__option', modelValue === opt.value && 'is-selected']"
      :title="opt.label"
      @click="onSelect(opt.value)"
    >
      <Icon v-if="opt.icon" :name="opt.icon" :size="13" :stroke-width="1.6" />
      <span>{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; icon?: string }[];
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: T): void;
}>();

const onSelect = (v: T) => {
  if (v === props.modelValue) return;
  emit("update:modelValue", v);
};
</script>

<style scoped>
.segmented {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-canvas, #fafaf9);
  gap: 2px;
}

.segmented__option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-2, #52525b);
  transition:
    background-color 0.1s ease,
    color 0.1s ease,
    box-shadow 0.1s ease;
}

.segmented__option:hover:not(.is-selected) {
  color: var(--color-ink-1, #18181b);
}

.segmented__option.is-selected {
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(0, 0, 0, 0.04);
}

.segmented__option:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.segmented__option :deep(svg) {
  color: inherit;
}
</style>
