<template>
  <aside class="sd" @click="onItemClick">
    <!-- ── Workspace header ─────────────────────────────────────────── -->
    <header class="sd__header">
      <div class="sd__brand-mark">
        <Icon name="folder" :size="16" :stroke-width="1.8" />
      </div>
      <div class="sd__brand-text">
        <div class="sd__brand-name">
          <BrandName name="filebrowser pretty" />
        </div>
        <div class="sd__brand-version">v{{ version }}</div>
      </div>
    </header>

    <!-- ── Primary actions ──────────────────────────────────────────── -->
    <div v-if="user?.perm.create" class="sd__primary">
      <button
        type="button"
        class="sd__btn sd__btn--primary"
        @click="newDir"
        :aria-label="t('sidebar.newFolder')"
      >
        <Icon name="folder-plus" :size="15" />
        <span>{{ t("sidebar.newFolder") }}</span>
      </button>
      <button
        type="button"
        class="sd__btn sd__btn--ghost"
        @click="newFile"
        :aria-label="t('sidebar.newFile')"
        :title="t('sidebar.newFile')"
      >
        <Icon name="file-plus" :size="15" />
      </button>
    </div>

    <!-- ── Navigation ───────────────────────────────────────────────── -->
    <nav v-if="isLoggedIn" class="sd__section sd__nav">
      <div class="sd__section-label">Navigate</div>
      <button
        type="button"
        class="sd__navrow"
        :class="{ 'is-active': isFiles }"
        @click="goFiles"
      >
        <Icon name="folder" :size="15" />
        <span class="sd__navrow-label">{{ t("sidebar.myFiles") }}</span>
        <span v-if="filesCount > 0" class="sd__navrow-count">
          {{ filesCount }}
        </span>
      </button>

      <router-link
        to="/settings/profile"
        class="sd__navrow"
        :class="{ 'is-active': isProfile }"
      >
        <Icon name="user" :size="15" />
        <span class="sd__navrow-label">Profile</span>
      </router-link>

      <button
        v-if="user?.perm.admin"
        type="button"
        class="sd__navrow"
        :class="{ 'is-active': isAdmin }"
        @click="goAdmin"
      >
        <Icon name="settings-2" :size="15" />
        <span class="sd__navrow-label">{{ t("sidebar.settings") }}</span>
      </button>
    </nav>

    <!-- Logged-out navigation -->
    <nav v-else class="sd__section sd__nav">
      <div class="sd__section-label">Account</div>
      <router-link v-if="!hideLoginButton" to="/login" class="sd__navrow">
        <Icon name="log-in" :size="15" />
        <span class="sd__navrow-label">{{ t("sidebar.login") }}</span>
      </router-link>
      <router-link v-if="signup" to="/login" class="sd__navrow">
        <Icon name="user-plus" :size="15" />
        <span class="sd__navrow-label">{{ t("sidebar.signup") }}</span>
      </router-link>
    </nav>

    <div class="sd__spacer"></div>

    <!-- ── Storage card ─────────────────────────────────────────────── -->
    <div
      v-if="isLoggedIn && isFiles && !disableUsedPercentage"
      class="sd__section"
    >
      <div class="sd__storage">
        <div class="sd__storage-head">
          <div class="sd__storage-title">
            <Icon name="hard-drive" :size="14" />
            <span>Storage</span>
          </div>
          <span class="sd__storage-pct">{{ usage.usedPercentage }}%</span>
        </div>
        <div class="sd__storage-bar">
          <div
            class="sd__storage-fill"
            :style="{ width: usage.usedPercentage + '%' }"
          ></div>
        </div>
        <div class="sd__storage-meta">
          <span>{{ usage.used }} used</span>
          <span>{{ usage.total }}</span>
        </div>
      </div>
    </div>

    <!-- ── User row ─────────────────────────────────────────────────── -->
    <footer v-if="isLoggedIn" class="sd__user">
      <button
        type="button"
        class="sd__user-btn"
        @click="goProfile"
        :title="user?.username"
      >
        <span class="sd__avatar">{{ userInitials }}</span>
        <span class="sd__user-text">
          <span class="sd__user-name">{{ user?.username }}</span>
          <span class="sd__user-role">
            {{ user?.perm.admin ? "Admin" : "User" }}
          </span>
        </span>
      </button>
      <button
        v-if="canLogout"
        type="button"
        class="sd__logout"
        @click="logout"
        :title="t('sidebar.logout')"
        :aria-label="t('sidebar.logout')"
      >
        <Icon name="log-out" :size="15" />
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
/**
 * Mobile drawer sidebar. Purpose-built for the Drawer overlay used at
 * narrow widths — unlike `Sidebar.vue` (which has to support the inline
 * desktop + sm-md icon-rail layouts), this component renders one clean
 * full-width layout designed for a 280-ish-px drawer panel.
 *
 * Same data sources and behavior as Sidebar.vue, just with a layout and
 * spacing tuned for touch: 44 px tap targets, section labels, dividers,
 * a tinted storage card. Click delegation in the root closes the drawer
 * via the parent's @click listener when the user picks any nav item.
 */
import { computed, onMounted, onUnmounted, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import * as auth from "@/utils/auth";
import {
  version,
  signup,
  hideLoginButton,
  disableUsedPercentage,
  noAuth,
  logoutPage,
  loginPage,
} from "@/utils/constants";
import { files as api } from "@/api";
import prettyBytes from "pretty-bytes";
import Icon from "@/components/Icon.vue";
import BrandName from "@/components/BrandName.vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

const user = computed(() => authStore.user);
const isLoggedIn = computed(() => authStore.isLoggedIn);
const isFiles = computed(() => fileStore.isFiles);
const isProfile = computed(() => route.path === "/settings/profile");
const isAdmin = computed(() => route.path.startsWith("/settings/global"));

const filesCount = computed(
  () => (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0)
);

const canLogout = computed(
  () => !noAuth && (loginPage || logoutPage !== "/login")
);

const userInitials = computed(() => {
  const name = user.value?.username ?? "";
  const parts = name.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
});

// ── Storage usage fetch (mirrors Sidebar.vue) ──────────────────────────
const USAGE_DEFAULT = { used: "0 B", total: "0 B", usedPercentage: 0 };
const usage = reactive({ ...USAGE_DEFAULT });
let usageAbort: AbortController | null = null;

const fetchUsage = async () => {
  if (disableUsedPercentage) {
    Object.assign(usage, USAGE_DEFAULT);
    return;
  }
  const path = route.path.endsWith("/") ? route.path : route.path + "/";
  try {
    usageAbort?.abort();
    usageAbort = new AbortController();
    const u = await api.usage(path, usageAbort.signal);
    Object.assign(usage, {
      used: prettyBytes(u.used, { binary: true }),
      total: prettyBytes(u.total, { binary: true }),
      usedPercentage: Math.round((u.used / u.total) * 100),
    });
  } catch {
    /* ignored — keep last known values */
  }
};

watch(
  () => route.path,
  (p) => {
    if (p.includes("/files")) fetchUsage();
  },
  { immediate: true }
);

onMounted(fetchUsage);
onUnmounted(() => usageAbort?.abort());

// ── Actions ────────────────────────────────────────────────────────────
const newDir = () => layoutStore.showHover("newDir");
const newFile = () => layoutStore.showHover("newFile");
const goFiles = () => router.push("/files/");
const goProfile = () => router.push("/settings/profile");
const goAdmin = () => router.push("/settings/global");
const logout = () => auth.logout();

/**
 * Delegated click handler — the Layout closes the drawer when any
 * actionable element inside the drawer is clicked. We rely on event
 * bubbling: each row/button does its own work, and the drawer
 * dismisses afterward via Layout.vue's onDrawerNavClick handler.
 *
 * We add a no-op here so the parent's listener fires cleanly (Vue's
 * scoped click handler on the root catches all child clicks via
 * bubbling regardless).
 */
const onItemClick = (_event: MouseEvent) => {
  void _event;
};
</script>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-1, #18181b);
  font-family: var(--font-sans, system-ui);
  font-size: 13px;
}

/* ── Workspace header ────────────────────────────────────────────────── */
.sd__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-line, #ececec);
  flex-shrink: 0;
}

.sd__brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  /* Track the accent picker (RC-5) — fall back to lilac when unset. */
  background: linear-gradient(
    135deg,
    var(--color-accent, #5e6ad2) 0%,
    var(--color-accent-strong, #4f5ac4) 100%
  );
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.sd__brand-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sd__brand-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd__brand-version {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

/* ── Primary actions row ─────────────────────────────────────────────── */
.sd__primary {
  display: flex;
  gap: 8px;
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.sd__btn {
  height: 36px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.sd__btn--primary {
  flex: 1;
  background: var(--color-accent, #5e6ad2);
  color: white;
  border: 1px solid var(--color-accent, #5e6ad2);
  box-shadow: 0 1px 2px rgba(94, 106, 210, 0.18);
}

.sd__btn--primary:hover {
  background: var(--color-accent-strong, #4f5ac4);
}

.sd__btn--ghost {
  width: 36px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.sd__btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

/* ── Section + nav rows ──────────────────────────────────────────────── */
.sd__section {
  padding: 8px 8px 4px;
  flex-shrink: 0;
}

.sd__section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  padding: 6px 8px;
}

.sd__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sd__navrow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.sd__navrow:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
  color: var(--color-ink-1, #18181b);
}

.sd__navrow.is-active {
  background: var(
    --color-selected,
    var(--color-accent-soft, rgba(94, 106, 210, 0.1))
  );
  color: var(--color-accent, #5e6ad2);
  font-weight: 600;
}

.sd__navrow-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd__navrow-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-3, #a1a1aa);
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
}

.sd__spacer {
  flex: 1;
}

/* ── Storage card ────────────────────────────────────────────────────── */
.sd__storage {
  margin: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
}

.sd__storage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sd__storage-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
}

.sd__storage-pct {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-3, #a1a1aa);
}

.sd__storage-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-elevated, #f4f4f5);
  overflow: hidden;
}

.sd__storage-fill {
  height: 100%;
  border-radius: 999px;
  /* RC-7: track the accent + its per-preset gradient end-stop. */
  background: linear-gradient(
    90deg,
    var(--color-accent, #5e6ad2) 0%,
    var(--color-accent-grad, #7c87e5) 100%
  );
  transition: width 0.3s ease;
}

.sd__storage-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-3, #a1a1aa);
}

/* ── User row footer ─────────────────────────────────────────────────── */
.sd__user {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--color-line, #ececec);
  flex-shrink: 0;
}

.sd__user-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  min-width: 0;
  text-align: left;
  font: inherit;
  transition: background-color 0.12s ease;
}

.sd__user-btn:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
}

.sd__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  /* Accent gradient — matches the brand mark + the inline-sidebar avatar.
     Tracks the accent picker (RC-5); falls back to lilac when unset. */
  background: linear-gradient(
    135deg,
    var(--color-accent, #5e6ad2) 0%,
    var(--color-accent-strong, #4f5ac4) 100%
  );
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.sd__user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.sd__user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd__user-role {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}

.sd__logout {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.sd__logout:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
  color: var(--color-ink-1, #18181b);
}
</style>
