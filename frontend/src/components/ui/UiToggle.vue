<template>
  <span class="ui-toggle-wrap" :class="{ 'is-disabled': disabled }">
    <button
      :id="switchId"
      type="button"
      role="switch"
      class="ui-toggle"
      :class="{ 'is-on': modelValue }"
      :aria-checked="modelValue ? 'true' : 'false'"
      :aria-label="label ? undefined : ariaLabel"
      :aria-labelledby="
        label ? labelId : ariaLabel ? undefined : row?.labelId || undefined
      "
      :aria-describedby="row?.descriptionId ?? undefined"
      :disabled="disabled"
      @click="flip"
    >
      <span class="ui-toggle__thumb"></span>
    </button>
    <!-- Clicking the label flips the switch too. -->
    <span v-if="label" :id="labelId" class="ui-toggle__label" @click="flip">{{
      label
    }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * On/off switch: a button with role="switch". Space and Enter toggle (the
 * button does that natively); a visible `label` is clickable too. Settings
 * rows that print their own label pass `ariaLabel` or an `id` their
 * <label for> points at.
 */
import { computed, useId } from "vue";
import { useFieldContext } from "./fieldContext";

const props = defineProps<{
  modelValue: boolean;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const auto = useId();
const switchId = computed(() => props.id ?? `t-${auto}`);
const labelId = computed(() => `${switchId.value}-label`);
const row = useFieldContext(() => switchId.value);

const flip = () => {
  if (props.disabled) return;
  emit("update:modelValue", !props.modelValue);
};
</script>

<style scoped>
.ui-toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.ui-toggle {
  --track-w: 34px;
  --track-h: 20px;
  --thumb: 16px;
  --pad: 2px;
  position: relative;
  width: var(--track-w);
  height: var(--track-h);
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-ink-4);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease);
}
.ui-toggle.is-on {
  background: var(--color-accent);
}
.ui-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.ui-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-toggle__thumb {
  position: absolute;
  top: var(--pad);
  left: var(--pad);
  width: var(--thumb);
  height: var(--thumb);
  border-radius: var(--radius-full);
  background: var(--paper);
  box-shadow: var(--shadow-1);
  transition: transform var(--dur-slow) var(--ease);
}
.ui-toggle.is-on .ui-toggle__thumb {
  transform: translateX(calc(var(--track-w) - var(--thumb) - var(--pad) * 2));
}
.ui-toggle__label {
  font-size: var(--type-ui);
  color: var(--color-ink-1);
  cursor: pointer;
  user-select: none;
}
.is-disabled .ui-toggle__label {
  color: var(--color-ink-3);
  cursor: not-allowed;
}
</style>
