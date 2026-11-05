<template>
  <header class="ui-page-header">
    <!-- Phone: the sidebar is a drawer, and this heading is the only bar on
         the page, so it carries the button that opens it (as the Files hero
         does). -->
    <button
      v-if="navMenu"
      type="button"
      class="ui-page-header__menu"
      aria-label="Open navigation menu"
      title="Open menu"
      @click="mobileNav.open"
    >
      <Icon name="menu" :size="18" />
    </button>
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
      <slot />
    </div>
    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useMobileNav } from "@/composables/useMobileNav";

/**
 * Page heading for full-page views (Trash, Storage, Duplicates…): an
 * eyebrow, the title (or a breadcrumb in its place), a meta line and an
 * actions slot; anything in the default slot goes under the meta line.
 * At phone width the actions wrap under the title.
 */
withDefaults(
  defineProps<{
    eyebrow?: string;
    title?: string;
    meta?: string;
    /** Extra attributes for the meta line (e.g. a data-testid). */
    metaAttrs?: Record<string, string>;
    /** Show the phone-width button that opens the navigation drawer. */
    navMenu?: boolean;
  }>(),
  { navMenu: true }
);

const mobileNav = useMobileNav();
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
.ui-page-header__menu {
  display: none;
  align-self: flex-start;
  width: 32px;
  height: 32px;
  margin-left: -4px;
  border-radius: var(--radius-md);
  align-items: center;
  justify-content: center;
  color: var(--color-ink-2);
  flex-shrink: 0;
  transition: background-color var(--dur-base) ease;
}
.ui-page-header__menu:hover {
  background: var(--color-hover);
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
  .ui-page-header__menu {
    display: inline-flex;
  }
  .ui-page-header {
    padding: var(--space-4) var(--space-3) var(--space-3);
  }
  .ui-page-header__title {
    font-size: var(--type-title);
    line-height: var(--type-title-lh);
  }
}
</style>
