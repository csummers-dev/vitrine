<template>
  <!-- Settings shell (Phase 6, 5.4): the sections rail and the page, as two
       panels like the files view. On phones the settings home is a list
       (SettingsHome) and each page has a way back to it. -->
  <div class="fb-columns settings-shell flex-1 flex min-h-0 overflow-hidden">
    <div v-if="!isPhone" class="settings-rail-panel">
      <h1 class="settings-rail-head">
        <Icon name="settings-2" :size="16" />
        <span>Settings</span>
      </h1>
      <SettingsRail />
    </div>

    <section class="fb-primary settings-main flex-1 min-w-0 min-h-0">
      <div v-if="isPhone && !isHome" class="settings-pagehead">
        <UiButton
          variant="ghost"
          size="sm"
          icon="chevron-left"
          to="/settings"
          data-testid="settings-back"
          >Settings</UiButton
        >
      </div>
      <router-view />
      <!-- Lightweight overlay that doesn't tear down the router-view -->
      <div v-if="loading" class="settings-loading-overlay">
        <Icon name="loader-circle" :size="14" class="settings-spin" />
        <span>Loading…</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useLayoutStore } from "@/stores/layout";
import { useWindowWidth } from "@/composables/useWindowWidth";
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";
import SettingsRail from "@/components/settings/SettingsRail.vue";

const layoutStore = useLayoutStore();
const route = useRoute();
const width = useWindowWidth();

const loading = computed(() => layoutStore.loading);
const isPhone = computed(() => width.value < 768);
const isHome = computed(() => route.name === "Settings");
</script>

<style scoped>
.settings-main {
  position: relative;
  overflow-y: auto;
}

.settings-rail-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
}
.settings-rail-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-4) var(--space-4) 0;
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--color-ink-1);
  flex-shrink: 0;
}
.settings-rail-head :deep(svg) {
  color: var(--color-ink-3);
}

/* Phone: a way back to the settings list above each page. */
.settings-pagehead {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: var(--space-2) var(--space-2) 0;
  background: var(--color-surface);
}

/* Pinned overlay shown while a settings page is fetching. Sits in the top-
   right of the main content area so it doesn't obscure what's underneath. */
.settings-loading-overlay {
  position: absolute;
  top: 16px;
  right: 24px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  background: var(--color-surface);
  color: var(--color-ink-2);
  border: 1px solid var(--color-line);
  box-shadow: var(--shadow-2);
  pointer-events: none;
}

.settings-spin {
  animation: settings-spin 0.9s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
