<template>
  <label class="ui-check" :class="{ 'is-disabled': disabled }">
    <input
      ref="input"
      type="checkbox"
      class="ui-check__input"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="label ? undefined : ariaLabel"
      :aria-checked="indeterminate ? 'mixed' : undefined"
      v-bind="$attrs"
      @change="
        emit('update:modelValue', ($event.target as HTMLInputElement).checked)
      "
    />
    <span class="ui-check__box" aria-hidden="true">
      <Icon v-if="indeterminate" name="minus" :size="12" :stroke-width="3" />
      <Icon v-else-if="modelValue" name="check" :size="12" :stroke-width="3" />
    </span>
    <span v-if="label || $slots.default" class="ui-check__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
/**
 * A styled native checkbox. `indeterminate` (for "select all" with some
 * selected) sets the input's own indeterminate state and aria-checked=mixed.
 */
import { onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue: boolean;
  label?: string;
  ariaLabel?: string;
  indeterminate?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const input = ref<HTMLInputElement | null>(null);
const sync = () => {
  if (input.value) input.value.indeterminate = !!props.indeterminate;
};
onMounted(sync);
watch(() => props.indeterminate, sync);
</script>

<style scoped>
.ui-check {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--type-ui);
  color: var(--color-ink-1);
}
.ui-check.is-disabled {
  cursor: not-allowed;
  color: var(--color-ink-3);
}
.ui-check__input {
  position: absolute;
  width: 18px;
  height: 18px;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
.ui-check__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: var(--radius-xs);
  border: 1.5px solid var(--color-ink-4);
  background: var(--color-raised);
  color: var(--color-on-accent);
  transition:
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.ui-check__input:checked + .ui-check__box,
.ui-check__input:indeterminate + .ui-check__box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.ui-check__input:focus-visible + .ui-check__box {
  box-shadow: var(--focus-ring);
}
.ui-check__input:disabled + .ui-check__box {
  opacity: 0.5;
}
</style>
