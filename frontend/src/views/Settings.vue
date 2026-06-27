<template>
  <!-- V2-J: no top header bar. The rail runs full-height to the top (with a
       small "Settings" heading); the active section's name renders as a page
       title at the top of the content pane. -->
  <div class="flex-1 flex min-h-0 overflow-hidden">
    <!-- Inline left rail (220px) — visible at md+. Below md it hides and
         the mobile drawer below takes over. -->
    <div class="w-[220px] shrink-0 max-md:hidden overflow-hidden flex flex-col">
      <div class="settings-rail-head">
        <Icon name="settings-2" :size="15" class="text-[var(--color-ink-2)]" />
        <span>Settings</span>
      </div>
      <SettingsRail />
    </div>

    <!-- Mobile drawer instance — opened from the inline hamburger below. -->
    <Drawer
      :open="mobileNav.isOpen.value"
      side="left"
      @cancel="mobileNav.close"
    >
      <SettingsRail borderless @itemClicked="mobileNav.close" />
    </Drawer>

    <!-- Main settings content. Scrollable.
         The router-view is always rendered. Each page manages its own
         loading state — gating the view on `layoutStore.loading` here
         caused an unmount-remount loop on pages with async onMounted.
         Each page renders its own rich header (icon + title + description)
         via <SettingsPage>, so the shell adds no title — only a mobile
         hamburger to reach the rail drawer. -->
    <section class="flex-1 overflow-y-auto min-w-0 settings-main">
      <div class="settings-pagehead">
        <button
          type="button"
          class="settings-pagehead__menu"
          aria-label="Open settings menu"
          title="Menu"
          @click="mobileNav.open"
        >
          <Icon name="menu" :size="18" />
        </button>
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
import { useLayoutStore } from "@/stores/layout";
import { useMobileNav } from "@/composables/useMobileNav";
import Icon from "@/components/Icon.vue";
import SettingsRail from "@/components/settings/SettingsRail.vue";
import Drawer from "@/components/Drawer.vue";
import { computed } from "vue";

const layoutStore = useLayoutStore();
const mobileNav = useMobileNav();

const loading = computed(() => layoutStore.loading);
</script>

<style scoped>
.settings-main {
  background: var(--color-canvas, #fafaf9);
}

/* V2-J / V3-A: "Settings" heading pinned to the top of the full-height rail.
   Tightened (#2) so it sits closer to the nav. */
.settings-rail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--color-ink-1, #18181b);
  flex-shrink: 0;
}

/* V3-A: each page renders its own header via <SettingsPage>, so the shell
   pagehead is now ONLY the mobile hamburger — shown at <md, hidden on desktop
   where the rail is always visible. */
.settings-pagehead {
  display: none;
}
@media (max-width: 768px) {
  .settings-pagehead {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    padding: 12px 16px 8px;
    background: var(--color-canvas, #fafaf9);
  }
}
.settings-pagehead__menu {
  width: 32px;
  height: 32px;
  display: inline-flex;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-2, #52525b);
  margin-left: -4px;
  transition: background-color var(--dur-base) ease;
}
.settings-pagehead__menu:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
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
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  border: 1px solid var(--color-line, #ececec);
  box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.settings-main {
  position: relative;
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
