<template>
  <label class="ui-radio" :class="{ 'is-disabled': disabled }">
    <input
      type="radio"
      class="ui-radio__input"
      :name="name"
      :value="String(value)"
      :checked="modelValue === value"
      :disabled="disabled"
      v-bind="$attrs"
      @change="emit('update:modelValue', value)"
    />
    <span class="ui-radio__dot" aria-hidden="true"></span>
    <span class="ui-radio__label"
      ><slot>{{ label }}</slot></span
    >
  </label>
</template>

<script setup lang="ts" generic="T extends string | number">
/** A styled native radio button; group them with the same `name`. */
defineOptions({ inheritAttrs: false });
defineProps<{
  modelValue: T;
  value: T;
  name: string;
  label?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: T): void }>();
</script>

<style scoped>
.ui-radio {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--type-ui);
  color: var(--color-ink-1);
}
.ui-radio.is-disabled {
  cursor: not-allowed;
  color: var(--color-ink-3);
}
.ui-radio__input {
  position: absolute;
  width: 18px;
  height: 18px;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
.ui-radio__dot {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-ink-4);
  background: var(--color-raised);
  transition:
    border-color var(--dur-fast) var(--ease),
    border-width var(--dur-fast) var(--ease);
}
.ui-radio__input:checked + .ui-radio__dot {
  border: 5px solid var(--color-accent);
}
.ui-radio__input:focus-visible + .ui-radio__dot {
  box-shadow: var(--focus-ring);
}
.ui-radio__input:disabled + .ui-radio__dot {
  opacity: 0.5;
}
</style>
