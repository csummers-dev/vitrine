<template>
  <div
    class="ui-field"
    :class="{ 'is-invalid': !!error, 'is-disabled': disabled }"
  >
    <label v-if="label" :for="inputId" class="ui-field__label">{{
      label
    }}</label>
    <div class="ui-field__control">
      <select
        :id="inputId"
        class="ui-select__input"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy ?? row?.descriptionId ?? undefined"
        :aria-label="label ? undefined : ariaLabel"
        :aria-labelledby="
          label || ariaLabel ? undefined : row?.labelId || undefined
        "
        v-bind="$attrs"
        @change="onChange"
      >
        <option
          v-for="o in options"
          :key="String(o.value)"
          :value="String(o.value)"
          :selected="o.value === modelValue"
          :disabled="o.disabled"
        >
          {{ o.label }}
        </option>
      </select>
      <Icon
        name="chevron-down"
        :size="15"
        class="ui-select__chevron"
        aria-hidden="true"
      />
    </div>
    <div v-if="error" :id="errorId" class="ui-field__error">{{ error }}</div>
    <div v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
/**
 * A styled native <select>: phones keep their own picker and keyboards
 * their usual behaviour. Option values may be strings or numbers; the
 * model gets back the option's own value, not its string form.
 */
import Icon from "@/components/Icon.vue";
import { useFieldIds } from "./useFieldIds";
import { useFieldContext } from "./fieldContext";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; disabled?: boolean }[];
  label?: string;
  ariaLabel?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}>();

const emit = defineEmits<{ (e: "update:modelValue", v: T): void }>();

const { inputId, hintId, errorId, describedBy } = useFieldIds(
  () => props.id,
  () => props.hint,
  () => props.error
);
const row = useFieldContext(() => inputId.value);

const onChange = (e: Event) => {
  const raw = (e.target as HTMLSelectElement).value;
  const opt = props.options.find((o) => String(o.value) === raw);
  if (opt) emit("update:modelValue", opt.value);
};
</script>

<style scoped src="./fieldStyles.css"></style>
<style scoped>
.ui-select__input {
  appearance: none;
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 var(--space-8) 0 var(--space-3);
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--type-ui);
  cursor: pointer;
  outline: none;
}
.ui-select__input:disabled {
  cursor: not-allowed;
}
.ui-select__chevron {
  position: absolute;
  right: var(--space-3);
  color: var(--color-ink-3);
  pointer-events: none;
}
</style>
