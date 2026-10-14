<template>
  <component
    :is="as"
    class="ui-panel"
    :class="[`ui-panel--${tone}`, { 'is-flush': flush }]"
    :aria-labelledby="title ? titleId : undefined"
  >
    <div v-if="title || $slots.header" class="ui-panel__header">
      <slot name="header">
        <div class="min-w-0">
          <h2 :id="titleId" class="ui-panel__title">{{ title }}</h2>
          <p v-if="description" class="ui-panel__desc">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="ui-panel__actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="ui-panel__body"><slot /></div>
    <div v-if="$slots.footer" class="ui-panel__footer">
      <slot name="footer" />
    </div>
  </component>
</template>

<script setup lang="ts">
/** Rounded surface (card) with optional header, actions and footer. */
import { useId } from "vue";

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** "raised" sits on the content panel; "sunken" is the side-panel grey. */
    tone?: "raised" | "sunken";
    /** No body padding (lists that draw their own rows). */
    flush?: boolean;
    as?: "section" | "div" | "article";
  }>(),
  { tone: "raised", as: "section" }
);
const titleId = `p-${useId()}`;
</script>

<style scoped>
.ui-panel {
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-line);
  overflow: hidden;
}
.ui-panel--raised {
  background: var(--color-raised);
}
.ui-panel--sunken {
  background: var(--color-panel);
  border-color: transparent;
}
.ui-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) 0;
}
.ui-panel__title {
  margin: 0;
  font-size: var(--type-ui);
  line-height: var(--type-ui-lh);
  font-weight: 700;
  color: var(--color-ink-1);
}
.ui-panel__desc {
  margin: 2px 0 0;
  font-size: var(--type-body);
  line-height: var(--type-body-lh);
  color: var(--color-ink-3);
}
.ui-panel__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
.ui-panel__body {
  padding: var(--space-4);
}
.ui-panel.is-flush .ui-panel__body {
  padding: 0;
}
.ui-panel__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-line);
}
</style>
