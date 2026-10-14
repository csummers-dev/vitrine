<template>
  <header class="ui-page-header">
    <div class="ui-page-header__main">
      <div v-if="eyebrow" class="ui-page-header__eyebrow">{{ eyebrow }}</div>
      <slot name="breadcrumb" />
      <h1 v-if="title" class="ui-page-header__title">{{ title }}</h1>
      <div
        v-if="$slots.meta || meta"
        class="ui-page-header__meta"
        v-bind="metaAttrs"
      >
        <slot name="meta">{{ meta }}</slot>
      </div>
    </div>
    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * Page heading for full-page views (Trash, Storage, Duplicates…): an
 * eyebrow, the title (or a breadcrumb in its place), a meta line and an
 * actions slot. At phone width the actions wrap under the title.
 */
defineProps<{
  eyebrow?: string;
  title?: string;
  meta?: string;
  /** Extra attributes for the meta line (e.g. a data-testid). */
  metaAttrs?: Record<string, string>;
}>();
</script>

<style scoped>
.ui-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-5) var(--space-5) var(--space-4);
}
.ui-page-header__main {
  flex: 1 1 260px;
  min-width: 0;
}
.ui-page-header__eyebrow {
  margin-bottom: var(--space-1);
  font-size: var(--type-caption);
  line-height: var(--type-caption-lh);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-ink-3);
}
.ui-page-header__title {
  margin: 0;
  font-size: var(--type-display);
  line-height: var(--type-display-lh);
  font-weight: 700;
  color: var(--color-ink-1);
  overflow-wrap: anywhere;
}
.ui-page-header__meta {
  margin-top: var(--space-1);
  font-size: var(--type-body);
  line-height: var(--type-body-lh);
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
.ui-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
@media (max-width: 767px) {
  .ui-page-header {
    padding: var(--space-4) var(--space-3) var(--space-3);
  }
  .ui-page-header__title {
    font-size: var(--type-title);
    line-height: var(--type-title-lh);
  }
}
</style>
