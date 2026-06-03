<template>
  <aside
    class="settings-rail w-full flex flex-col overflow-y-auto bg-canvas"
    :class="{ 'border-r border-line': !borderless }"
  >
    <!-- Mobile-only: quick return to the file browser, pinned at the top with
         the same folder glyph the main sidebar uses. On desktop the always-
         visible main sidebar already provides this, so it's drawer-only. -->
    <nav v-if="borderless" class="px-2 pt-3 text-[13px]">
      <router-link to="/files/" v-slot="{ navigate }" custom>
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-ink-2 transition text-left"
          @click="(e) => onNavClick(e, navigate)"
        >
          <span class="flex items-center text-[var(--c-lilac)]">
            <Icon name="folder" :size="14" />
          </span>
          <span class="flex-1">{{ rootLabel || t("sidebar.myFiles") }}</span>
        </button>
      </router-link>
    </nav>

    <div class="px-4 pt-5 pb-2">
      <div
        class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
      >
        User
      </div>
    </div>
    <nav class="px-2 space-y-0.5 text-[13px]">
      <router-link
        v-for="section in userSections"
        :key="section.to"
        :to="section.to"
        v-slot="{ isActive, navigate }"
        custom
      >
        <button
          type="button"
          :class="[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left',
            isActive
              ? 'bg-selected text-accent font-medium'
              : 'hover:bg-hover text-ink-2',
          ]"
          @click="(e) => onNavClick(e, navigate)"
        >
          <span class="flex items-center" :style="{ color: section.hue }">
            <Icon :name="section.icon" :size="14" />
          </span>
          <span class="flex-1">{{ section.label }}</span>
        </button>
      </router-link>
    </nav>

    <template v-if="user?.perm.admin">
      <div class="px-4 pt-5 pb-2">
        <div
          class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
        >
          Administration
        </div>
      </div>
      <nav class="px-2 space-y-0.5 text-[13px]">
        <router-link
          v-for="section in adminSections"
          :key="section.to"
          :to="section.to"
          v-slot="{ isActive, navigate }"
          custom
        >
          <button
            type="button"
            :class="[
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left',
              isActive ||
              (section.matchPrefix &&
                $route.path.startsWith(section.matchPrefix))
                ? 'bg-selected text-accent font-medium'
                : 'hover:bg-hover text-ink-2',
            ]"
            @click="(e) => onNavClick(e, navigate)"
          >
            <span class="flex items-center" :style="{ color: section.hue }">
              <Icon :name="section.icon" :size="14" />
            </span>
            <span class="flex-1">{{ section.label }}</span>
          </button>
        </router-link>
      </nav>
    </template>

    <div class="flex-1"></div>

    <!-- Mobile-only account + sign-out footer. On the settings route the main
         sidebar isn't shown on mobile, so this rail is the only place to see
         who you're signed in as and to sign out (desktop already has the main
         sidebar for that). The "Back to files" chip moved to the top as a
         proper My Files link. -->
    <footer
      v-if="borderless && user"
      class="px-3 pb-3 pt-3 border-t border-line flex items-center gap-1.5"
    >
      <button
        type="button"
        class="flex-1 flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-hover transition min-w-0 text-left"
        :title="user.username"
        @click="goProfile"
      >
        <div
          class="w-7 h-7 rounded-full avatar-rainbow flex items-center justify-center text-white text-[11px] font-semibold shadow-sm shrink-0"
        >
          {{ userInitials }}
        </div>
        <div class="flex-1 min-w-0">
          <div
            class="text-[13px] font-medium leading-tight truncate text-ink-1"
          >
            {{ user.username }}
          </div>
          <div class="text-[11px] text-ink-3 leading-tight truncate">
            {{ user.perm.admin ? "Admin" : "User" }}
          </div>
        </div>
      </button>
      <button
        v-if="canLogout"
        type="button"
        class="settings-rail__logout w-7 h-7 rounded-md flex items-center justify-center transition"
        :title="t('sidebar.logout')"
        :aria-label="t('sidebar.logout')"
        @click="logout"
      >
        <Icon name="log-out" :size="14" />
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useRootLabel } from "@/composables/useRootLabel";
import * as auth from "@/utils/auth";
import { noAuth, loginPage, logoutPage } from "@/utils/constants";
import Icon from "@/components/Icon.vue";

const { t } = useI18n();
const authStore = useAuthStore();

const props = withDefaults(
  defineProps<{
    /** When rendered inside a drawer, drop the right border (the drawer
     *  panel already has its own divider). */
    borderless?: boolean;
  }>(),
  { borderless: false }
);
void props;

const emit = defineEmits<{
  /** Fires when the user clicks a nav item. The parent uses this to close
   *  the mobile drawer after picking a destination. */
  (e: "itemClicked"): void;
}>();

const user = computed(() => authStore.user);

// ── Mobile-only account footer + My Files link ──────────────────────────
const router = useRouter();
const { rootLabel } = useRootLabel();

const userInitials = computed(() => {
  const name = user.value?.username ?? "";
  const parts = name.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
});

const canLogout = computed(
  () => !noAuth && (loginPage || logoutPage !== "/login")
);

const logout = () => auth.logout();

const goProfile = () => {
  void router.push("/settings/profile");
  emit("itemClicked");
};

interface NavSection {
  to: string;
  label: string;
  icon: string;
  /** Per-section glyph hue (one of the 6 accent tokens). Keep each in sync
   *  with the matching page's `accent` on its SettingsPage header. */
  hue: string;
  /** When matched as a prefix, the link is highlighted (for nested routes). */
  matchPrefix?: string;
}

const userSections = computed<NavSection[]>(() => {
  const list: NavSection[] = [
    {
      to: "/settings/profile",
      label: t("settings.profileSettings"),
      icon: "user",
      hue: "var(--c-blue)",
    },
  ];
  if (user.value?.perm.share) {
    list.push({
      to: "/settings/shares",
      label: t("settings.shareManagement"),
      icon: "share-2",
      hue: "var(--c-teal)",
    });
  }
  list.push({
    to: "/settings/sessions",
    label: t("settings.sessions"),
    icon: "monitor-smartphone",
    hue: "var(--c-green)",
  });
  return list;
});

const adminSections = computed<NavSection[]>(() => [
  {
    to: "/settings/global",
    label: t("settings.globalSettings"),
    icon: "settings-2",
    hue: "var(--c-lilac)",
  },
  {
    to: "/settings/users",
    label: t("settings.userManagement"),
    icon: "users",
    hue: "var(--c-amber)",
    matchPrefix: "/settings/users",
  },
  {
    to: "/settings/audit",
    label: t("settings.audit"),
    icon: "scroll-text",
    hue: "var(--c-rose)",
  },
  {
    to: "/settings/webhooks",
    label: t("settings.webhooks"),
    icon: "webhook",
    hue: "var(--c-teal)",
  },
]);

const onNavClick = (e: MouseEvent, navigate: (e: MouseEvent) => void) => {
  navigate(e);
  emit("itemClicked");
};
</script>

<style scoped>
/* Sign-out button: rose-tinted so the destructive "leave" action reads apart
   from the neutral nav chrome — matches the main sidebar / drawer. */
.settings-rail__logout {
  color: var(--c-rose);
}
.settings-rail__logout:hover {
  color: var(--c-rose);
  background: color-mix(in srgb, var(--c-rose) 14%, transparent);
}
</style>
