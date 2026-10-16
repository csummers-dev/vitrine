<template>
  <section class="settings-section">
    <header v-if="title || $slots.header" class="settings-section__header">
      <div class="settings-section__header-text">
        <h2 v-if="title" class="settings-section__title">{{ title }}</h2>
        <p v-if="description" class="settings-section__description">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.headerRight" class="settings-section__header-right">
        <slot name="headerRight" />
      </div>
    </header>
    <div class="settings-section__body" :class="{ 'has-rows': hasRows }">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="settings-section__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** When true, child SettingsRows get separators between them. */
    hasRows?: boolean;
  }>(),
  { hasRows: true }
);
</script>

<style scoped>
.settings-section {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
}

.settings-section__header {
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--color-line);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.settings-section__header-text {
  flex: 1;
  min-width: 0;
}

.settings-section__header-right {
  flex-shrink: 0;
}

.settings-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-1);
  margin: 0;
  letter-spacing: -0.005em;
}

.settings-section__description {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--color-ink-2);
  line-height: 1.45;
}

.settings-section__body.has-rows :deep(.settings-row + .settings-row) {
  border-top: 1px solid var(--color-line);
}

.settings-section__footer {
  padding: 12px 18px;
  border-top: 1px solid var(--color-line);
  background: var(--color-canvas);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
