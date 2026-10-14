<template>
  <div class="settings-row" :class="{ 'is-stacked': stacked }">
    <div class="settings-row__label">
      <label
        v-if="label"
        :id="labelId"
        class="settings-row__title"
        :for="htmlFor ?? ctx.controlId.value"
      >
        {{ label }}
      </label>
      <p
        v-if="description"
        :id="descriptionId"
        class="settings-row__description"
      >
        {{ description }}
      </p>
      <slot name="extra" />
    </div>
    <div class="settings-row__control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { provideFieldContext } from "@/components/ui/fieldContext";

const props = withDefaults(
  defineProps<{
    label?: string;
    description?: string;
    /** When true, stack the control below the label instead of side-by-side.
     *  Useful for full-width inputs (password fields, long selects). */
    stacked?: boolean;
    /** Optional `for` attribute pairing the label with an input id.
     *  Named `htmlFor` because `for` is a reserved word in the parser. */
    htmlFor?: string;
  }>(),
  { stacked: false }
);

// The control inside (UiToggle, UiSelect, UiTextField) is named by this
// row's label and described by its description.
const base = `sr-${useId()}`;
const labelId = `${base}-label`;
const descriptionId = `${base}-desc`;
const ctx = provideFieldContext({
  labelId: props.label ? labelId : "",
  descriptionId: props.description ? descriptionId : null,
});
</script>

<style scoped>
.settings-row {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-row.is-stacked {
  flex-direction: column;
  align-items: stretch;
}

.settings-row__label {
  flex: 1;
  min-width: 0;
}

.settings-row__title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-1);
  cursor: default;
}

.settings-row__description {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-ink-3);
  line-height: 1.45;
  max-width: 460px;
}

.settings-row__control {
  flex-shrink: 0;
}

.settings-row.is-stacked .settings-row__control {
  flex-shrink: 1;
}
</style>
