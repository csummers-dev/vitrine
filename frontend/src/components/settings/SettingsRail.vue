<template>
  <!-- Settings sections (Phase 6, 5.4). `rail`: the left panel on wider
       screens. `list`: the phone's settings home, a list that opens each
       section, with the way back to the files and the account below. -->
  <nav
    class="settings-rail"
    :class="`settings-rail--${variant}`"
    aria-label="Settings sections"
  >
    <router-link
      v-if="variant === 'list'"
      to="/files/"
      class="srail-item srail-item--files"
      @click="emit('itemClicked')"
    >
      <Icon name="chevron-left" :size="16" />
      <span class="srail-item__label">{{
        rootLabel || t("sidebar.myFiles")
      }}</span>
    </router-link>

    <template v-for="group in groups" :key="group.title">
      <h2 class="srail-group">{{ group.title }}</h2>
      <ul class="srail-list">
        <li v-for="section in group.sections" :key="section.to">
          <router-link
            :to="section.to"
            class="srail-item"
            :class="{ 'srail-item--active': isActive(section) }"
            :aria-current="isActive(section) ? 'page' : undefined"
            @click="emit('itemClicked')"
          >
            <span class="srail-item__icon"
              ><Icon :name="section.icon" :size="16"
            /></span>
            <span class="srail-item__label">{{ section.label }}</span>
            <Icon
              v-if="variant === 'list'"
              name="chevron-right"
              :size="16"
              class="srail-item__chev"
            />
          </router-link>
        </li>
      </ul>
    </template>

    <div class="flex-1"></div>

    <!-- Phone: who you're signed in as, and sign out (the main sidebar isn't
         on screen here). -->
    <footer v-if="variant === 'list' && user" class="srail-account">
      <button
        type="button"
        class="srail-account__who"
        :title="user.username"
        @click="goProfile"
      >
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          alt=""
          class="srail-account__avatar"
        />
        <span v-else class="srail-account__avatar avatar-accent">{{
          userInitials
        }}</span>
        <span class="srail-account__text">
          <span class="srail-account__name">{{ user.username }}</span>
          <span class="srail-account__role">{{
            user.perm.admin ? "Admin" : "User"
          }}</span>
        </span>
      </button>
      <UiButton
        v-if="canLogout"
        variant="ghost"
        size="sm"
        icon="log-out"
        @click="logout"
        >{{ t("sidebar.logout") }}</UiButton
      >
    </footer>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useRootLabel } from "@/composables/useRootLabel";
import { profileAvatarUrl } from "@/composables/useProfileAvatar";
import * as auth from "@/utils/auth";
import { noAuth, loginPage, logoutPage } from "@/utils/constants";
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";

const { t } = useI18n();
const authStore = useAuthStore();
const avatarUrl = profileAvatarUrl;

withDefaults(
  defineProps<{
    /** "rail" beside the content; "list" as the phone's settings home. */
    variant?: "rail" | "list";
  }>(),
  { variant: "rail" }
);

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
    hue: "var(--c-lilac)",
    matchPrefix: "/settings/users",
  },
  {
    to: "/settings/audit",
    label: t("settings.audit"),
    icon: "scroll-text",
    hue: "var(--c-lilac)",
  },
  {
    to: "/settings/webhooks",
    label: t("settings.webhooks"),
    icon: "webhook",
    hue: "var(--c-teal)",
  },
]);

const route = useRoute();
const isActive = (s: NavSection) =>
  route.path === s.to ||
  (!!s.matchPrefix && route.path.startsWith(s.matchPrefix));

const groups = computed(() => {
  const out = [{ title: "Your account", sections: userSections.value }];
  if (user.value?.perm.admin)
    out.push({ title: "Administration", sections: adminSections.value });
  return out;
});
</script>

<style scoped>
.settings-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-3) var(--space-2);
}
.srail-group {
  margin: var(--space-4) var(--space-2) var(--space-1);
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--color-ink-3);
}
.srail-group:first-of-type {
  margin-top: var(--space-1);
}
.srail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.srail-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-md);
  font-size: var(--type-body);
  color: var(--color-ink-2);
  text-decoration: none;
  transition: background-color var(--dur-base) ease;
}
.srail-item:hover {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.srail-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
/* Current section: the raised pill the main sidebar uses. */
.srail-item--active {
  background: var(--color-raised);
  color: var(--color-ink-1);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.srail-item--active .srail-item__icon {
  color: var(--color-accent-ink);
}
.srail-item__icon {
  display: inline-flex;
  color: var(--color-ink-3);
}
.srail-item__label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srail-item__chev {
  color: var(--color-ink-3);
}

/* Phone list: bigger rows on a panel, no current-item pill. */
.settings-rail--list {
  padding: var(--space-3);
}
.settings-rail--list .srail-list {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  gap: 0;
}
.settings-rail--list .srail-list li + li {
  border-top: 1px solid var(--color-line);
}
.settings-rail--list .srail-item {
  min-height: 48px;
  border-radius: 0;
  padding: 0 var(--space-3);
  font-size: var(--type-ui);
  color: var(--color-ink-1);
}
.settings-rail--list .srail-item--active {
  background: transparent;
  box-shadow: none;
  font-weight: 400;
}
.settings-rail--list .srail-item--files {
  min-height: 40px;
  padding: 0 var(--space-1);
  color: var(--color-accent-ink);
}

.srail-account {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-line);
}
.srail-account__who {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  border-radius: var(--radius-md);
  text-align: left;
}
.srail-account__who:hover {
  background: var(--color-hover);
}
.srail-account__avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--color-on-accent);
}
.srail-account__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.srail-account__name {
  font-size: var(--type-body);
  font-weight: 500;
  color: var(--color-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srail-account__role {
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
</style>
