<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <div
        v-if="icon"
        class="settings-page__icon"
        :style="accent ? { '--page-accent': accent } : undefined"
      >
        <Icon :name="icon" :size="20" :stroke-width="1.9" />
      </div>
      <div class="settings-page__heading">
        <h1 class="settings-page__title">{{ title }}</h1>
        <p v-if="description" class="settings-page__description">
          {{ description }}
        </p>
      </div>
    </header>
    <div class="settings-page__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";

defineProps<{
  title: string;
  description?: string;
  /** Optional Lucide icon rendered as a tinted chip beside the title. */
  icon?: string;
  /** CSS color driving the chip tint + glyph, e.g. "var(--c-blue)".
   *  Keep each page's hue in sync with its SettingsRail nav icon. */
  accent?: string;
}>();
</script>

<style scoped>
.settings-page {
  /* V3-A #3: wider content so settings use the reclaimed header space. */
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 32px 80px;
}

.settings-page__header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 24px;
}

/* Tinted icon chip — gives each settings page a spot of color that matches
   its left-rail nav icon. Hue comes from the `accent` prop (--page-accent),
   defaulting to the app accent. */
.settings-page__icon {
  --page-accent: var(--color-accent);
  width: 40px;
  height: 40px;
  border-radius: 11px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--page-accent);
  background: color-mix(
    in srgb,
    var(--page-accent) 14%,
    var(--color-surface, #fff)
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--page-accent) 24%, transparent);
}

.settings-page__heading {
  min-width: 0;
  flex: 1;
}

.settings-page__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
  margin: 0;
  line-height: 1.2;
}

.settings-page__description {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  line-height: 1.5;
}

.settings-page__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

@media (max-width: 540px) {
  .settings-page {
    padding: 20px 16px 60px;
  }
  .settings-page__title {
    font-size: 19px;
  }
}
</style>
