<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Top header. Reuses the shared HeaderBar so the chrome stays
         consistent with the file view (hamburger trigger on mobile,
         spacing, sticky behavior). The default slot just shows where
         we are in the app. -->
    <header-bar>
      <nav class="flex items-center gap-0.5 text-[13px] min-w-0 text-ink-2">
        <span class="px-1.5 py-1 rounded text-ink-2 flex items-center gap-1.5">
          <Icon name="settings-2" :size="14" />
          <span>Settings</span>
        </span>
        <span class="text-ink-3 px-0.5 flex items-center">
          <Icon name="chevron-right" :size="12" />
        </span>
        <span class="px-1.5 py-1 rounded text-ink-1 font-semibold">
          {{ activeSectionLabel }}
        </span>
      </nav>
    </header-bar>

    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Inline left rail (220px) — visible at md+. Below md it hides and
           the mobile drawer below takes over. -->
      <div class="w-[220px] shrink-0 max-md:hidden overflow-hidden flex">
        <SettingsRail />
      </div>

      <!-- Mobile drawer instance — opened from the hamburger in the header. -->
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
           caused an unmount-remount loop on pages with async onMounted
           (the page sets loading=true → the v-if swaps → page unmounts
           → its finally sets loading=false → page remounts → repeat). -->
      <section class="flex-1 overflow-y-auto min-w-0 settings-main">
        <router-view />
        <!-- Lightweight overlay that doesn't tear down the router-view -->
        <div v-if="loading" class="settings-loading-overlay">
          <Icon name="loader-circle" :size="14" class="settings-spin" />
          <span>Loading…</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { useMobileNav } from "@/composables/useMobileNav";
import HeaderBar from "@/components/header/HeaderBar.vue";
import Icon from "@/components/Icon.vue";
import SettingsRail from "@/components/settings/SettingsRail.vue";
import Drawer from "@/components/Drawer.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const route = useRoute();
const mobileNav = useMobileNav();

const user = computed(() => authStore.user);
const loading = computed(() => layoutStore.loading);

// NavSection definitions used to compute the active label for the
// breadcrumb in the header. The actual rail is rendered by SettingsRail.vue
// which owns its own (identical) list — keep these in sync if either side
// changes.
interface NavSection {
  to: string;
  label: string;
  icon: string;
  matchPrefix?: string;
}

const userSections = computed<NavSection[]>(() => {
  const list: NavSection[] = [
    {
      to: "/settings/profile",
      label: t("settings.profileSettings"),
      icon: "user",
    },
  ];
  if (user.value?.perm.share) {
    list.push({
      to: "/settings/shares",
      label: t("settings.shareManagement"),
      icon: "share-2",
    });
  }
  return list;
});

const adminSections = computed<NavSection[]>(() => [
  {
    to: "/settings/global",
    label: t("settings.globalSettings"),
    icon: "settings-2",
  },
  {
    to: "/settings/users",
    label: t("settings.userManagement"),
    icon: "users",
    matchPrefix: "/settings/users",
  },
]);

const activeSectionLabel = computed(() => {
  const allSections = [...userSections.value, ...adminSections.value];
  // Prefer exact match, then prefix match for nested admin routes.
  const exact = allSections.find((s) => s.to === route.path);
  if (exact) return exact.label;
  const prefix = allSections.find(
    (s) => s.matchPrefix && route.path.startsWith(s.matchPrefix)
  );
  return prefix?.label ?? "Settings";
});
</script>

<style scoped>
.settings-main {
  background: var(--color-canvas, #fafaf9);
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
