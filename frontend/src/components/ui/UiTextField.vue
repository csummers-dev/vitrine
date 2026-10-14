<template>
  <div
    class="ui-field"
    :class="{ 'is-invalid': !!error, 'is-disabled': disabled }"
  >
    <label v-if="label" :for="inputId" class="ui-field__label">{{
      label
    }}</label>
    <div class="ui-field__control">
      <Icon
        v-if="icon"
        :name="icon"
        :size="15"
        class="ui-text__icon"
        aria-hidden="true"
      />
      <component
        :is="rows ? 'textarea' : 'input'"
        :id="inputId"
        ref="input"
        class="ui-text__input"
        :class="{
          'is-mono': mono,
          'has-icon': !!icon,
          'has-clear': showClear,
          'is-multiline': !!rows,
        }"
        :type="rows ? undefined : type"
        :rows="rows"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy ?? row?.descriptionId ?? undefined"
        :aria-label="label ? undefined : ariaLabel"
        :aria-labelledby="
          label || ariaLabel ? undefined : row?.labelId || undefined
        "
        v-bind="$attrs"
        @input="
          emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        @keydown.esc="onEscape"
      />
      <button
        v-if="showClear"
        type="button"
        class="ui-text__clear"
        :aria-label="clearLabel"
        :title="clearLabel"
        @click="clear"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>
    <div v-if="error" :id="errorId" class="ui-field__error">{{ error }}</div>
    <div v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Labelled text input. The hint and error are linked with aria-describedby;
 * an error also sets aria-invalid. `clearable` adds a clear button (search
 * fields), and Escape clears too. `mono` is for paths, codes and sizes;
 * `rows` makes it a multi-line textarea.
 */
import { computed, ref } from "vue";
import Icon from "@/components/Icon.vue";
import { useFieldIds } from "./useFieldIds";
import { useFieldContext } from "./fieldContext";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
    hint?: string;
    error?: string;
    icon?: string;
    mono?: boolean;
    clearable?: boolean;
    clearLabel?: string;
    type?: "text" | "search" | "email" | "password" | "url" | "number" | "tel";
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    autocomplete?: string;
    inputmode?:
      | "text"
      | "numeric"
      | "decimal"
      | "search"
      | "email"
      | "url"
      | "tel";
    id?: string;
    /** A multi-line field (textarea) with this many rows. */
    rows?: number;
  }>(),
  { type: "text", clearLabel: "Clear" }
);

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "clear"): void;
}>();

const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const { inputId, hintId, errorId, describedBy } = useFieldIds(
  () => props.id,
  () => props.hint,
  () => props.error
);
const row = useFieldContext(() => inputId.value);

const showClear = computed(
  () =>
    props.clearable && !!props.modelValue && !props.disabled && !props.readonly
);

const clear = () => {
  emit("update:modelValue", "");
  emit("clear");
  input.value?.focus();
};
const onEscape = (e: KeyboardEvent) => {
  if (!props.clearable || !props.modelValue) return;
  e.stopPropagation();
  clear();
};

defineExpose({ focus: () => input.value?.focus(), input });
</script>

<style scoped src="./fieldStyles.css"></style>
<style scoped>
.ui-text__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--type-ui);
  outline: none;
}
.ui-text__input.is-multiline {
  height: auto;
  padding: var(--space-2) var(--space-3);
  line-height: var(--type-ui-lh);
  resize: vertical;
}
.ui-text__input::placeholder {
  color: var(--color-ink-4);
}
.ui-text__input.is-mono {
  font-family: var(--font-mono);
  font-size: var(--type-body);
}
.ui-text__input.has-icon {
  padding-left: var(--space-8);
}
.ui-text__input.has-clear {
  padding-right: var(--space-8);
}
.ui-text__icon {
  position: absolute;
  left: var(--space-3);
  color: var(--color-ink-3);
  pointer-events: none;
}
.ui-text__clear {
  position: absolute;
  right: var(--space-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
}
.ui-text__clear:hover {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.ui-text__clear:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
