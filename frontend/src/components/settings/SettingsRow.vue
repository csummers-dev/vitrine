<template>
  <div ref="rowEl" class="settings-row" :class="{ 'is-stacked': stacked }">
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
      <!-- What can go wrong with this setting (5.4), and a save error that
           belongs to this control. -->
      <p v-if="risk" class="settings-row__risk">
        <Icon name="triangle-alert" :size="13" />
        <span>{{ risk }}</span>
      </p>
      <p v-if="error" class="settings-row__error" role="alert">
        <Icon name="circle-alert" :size="13" />
        <span>{{ error }}</span>
      </p>
      <slot name="extra" />
    </div>
    <div class="settings-row__control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUpdated, ref, useId } from "vue";
import Icon from "@/components/Icon.vue";
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
    /** A one-line note on the risk this setting carries. */
    risk?: string;
    /** An error from saving this setting, shown next to it. */
    error?: string;
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

// A plain <input>, <select> or <textarea> in the row (not one of the Ui
// controls, which register themselves) is named by the row's label too
// (7.1: axe "label").
const rowEl = ref<HTMLElement | null>(null);
const nameNativeControl = () => {
  if (!props.label || props.htmlFor || ctx.controlId.value) return;
  const el = rowEl.value?.querySelector<HTMLElement>(
    ".settings-row__control input:not([type=hidden]), .settings-row__control select, .settings-row__control textarea"
  );
  if (!el) return;
  if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby"))
    el.setAttribute("aria-labelledby", labelId);
  if (props.description && !el.hasAttribute("aria-describedby"))
    el.setAttribute("aria-describedby", descriptionId);
};
onMounted(nameNativeControl);
onUpdated(nameNativeControl);
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

.settings-row__risk,
.settings-row__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 6px 0 0;
  max-width: 460px;
  font-size: var(--type-small);
  line-height: 1.45;
}
.settings-row__risk {
  color: var(--status-warning);
}
.settings-row__error {
  color: var(--status-danger);
  font-weight: 500;
}
.settings-row__risk :deep(svg),
.settings-row__error :deep(svg) {
  flex: none;
  margin-top: 2px;
}
.settings-row__control {
  flex-shrink: 0;
}

.settings-row.is-stacked .settings-row__control {
  flex-shrink: 1;
}
</style>
