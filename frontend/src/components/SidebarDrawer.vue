<template>
  <aside class="sd" @click="onItemClick">
    <!-- ── Workspace header ─────────────────────────────────────────── -->
    <header class="sd__header">
      <img class="sd__brand-mark" :src="logoPngURL" alt="logo" />
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

    <!-- ── Favorites (mobile parity with the desktop sidebar) ───────────
         Long-press a row to reorder (touch DnD); tap to open. -->
    <nav v-if="isLoggedIn && favorites.length > 0" class="sd__section sd__favs">
      <div class="sd__section-label">Favorites</div>
      <ul ref="favListEl" class="sd__fav-list">
        <li
          v-for="(path, index) in favorites"
          :key="path"
          :data-fav-index="index"
          class="sd__fav"
          :class="{
            'sd__fav--dragging': favDragIndex === index,
            'sd__fav--drop-before':
              favDropIndex === index && favDragIndex !== index && !favDropAfter,
            'sd__fav--drop-after':
              favDropIndex === index && favDragIndex !== index && favDropAfter,
          }"
          @pointerdown="(e) => favDrag.onPointerDown(e, { index, path })"
        >
          <button
            type="button"
            class="sd__fav-btn"
            :title="path"
            @click="(e) => onFavTap(path, e)"
          >
            <Icon
              name="star"
              :size="13"
              :stroke-width="0"
              fill="currentColor"
              class="sd__fav-star"
            />
            <span class="sd__fav-name">{{ favoriteName(path) }}</span>
          </button>
        </li>
      </ul>
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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { useFavorites } from "@/composables/useFavorites";
import { useTouchDrag } from "@/composables/useTouchDrag";
import * as auth from "@/utils/auth";
import {
  version,
  signup,
  hideLoginButton,
  disableUsedPercentage,
  noAuth,
  logoutPage,
  loginPage,
  logoPngURL,
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

// ── Favorites (touch reorder) ──────────────────────────────────────────
const favoritesComposable = useFavorites();
const favorites = computed(() => favoritesComposable.favorites.value);

const favListEl = ref<HTMLElement | null>(null);
const favDragIndex = ref<number | null>(null);
const favDropIndex = ref<number | null>(null);
const favDropAfter = ref(false);
// After a long-press reorder, the trailing click is suppressed so the row
// doesn't also navigate (and close the drawer).
let suppressClickUntil = 0;

/** basename of a favorited folder path, URL-decoded. */
const favoriteName = (path: string): string => {
  const trimmed = String(path).replace(/\/+$/, "");
  const last = trimmed.split("/").filter(Boolean).pop() ?? path;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

const favDrag = useTouchDrag<{ index: number; path: string }>({
  ghostLabel: (p) => favoriteName(p.path),
  scrollEl: () => favListEl.value,
  onStart: (p) => {
    favDragIndex.value = p.index;
  },
  onMove: (_p, _x, y, el) => {
    const row =
      (el?.closest?.("[data-fav-index]") as HTMLElement | null) ?? null;
    if (!row) {
      favDropIndex.value = null;
      return;
    }
    const rect = row.getBoundingClientRect();
    favDropIndex.value = Number(row.dataset.favIndex);
    favDropAfter.value = y > rect.top + rect.height / 2;
  },
  onDrop: (p) => {
    const over = favDropIndex.value;
    if (over === null) return;
    const from = p.index;
    const len = favorites.value.length;
    const slot = favDropAfter.value ? over + 1 : over;
    let target = slot > from ? slot - 1 : slot;
    target = Math.max(0, Math.min(target, len - 1));
    favoritesComposable.reorder(from, target);
  },
  onEnd: () => {
    favDragIndex.value = null;
    favDropIndex.value = null;
    favDropAfter.value = false;
    suppressClickUntil = Date.now() + 350;
  },
});

const onFavTap = (path: string, event: MouseEvent) => {
  // Swallow the click that follows a long-press reorder so we don't navigate
  // (and so the drawer doesn't auto-close on it).
  if (Date.now() < suppressClickUntil) {
    event.stopPropagation();
    return;
  }
  router.push(path);
};

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
  object-fit: contain;
  flex-shrink: 0;
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
  background: var(--accent-gradient);
  color: white;
  border: 1px solid var(--color-accent, #5e6ad2);
  box-shadow: 0 1px 2px rgba(94, 106, 210, 0.18);
}

.sd__btn--primary:hover {
  background: var(--accent-gradient-strong);
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

/* ── Favorites ───────────────────────────────────────────────────────── */
.sd__favs {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sd__fav-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Long favorite lists scroll within their own region; the touch-drag
     composable auto-scrolls this element when a drag nears its edges. */
  overflow-y: auto;
  max-height: 240px;
}

.sd__fav {
  position: relative;
  border-radius: 8px;
}

.sd__fav-btn {
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
}

.sd__fav-btn:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
  color: var(--color-ink-1, #18181b);
}

.sd__fav-star {
  /* Warm gold that reads on both the light canvas and the dark sidebar.
     (Was #b45309 — a dark brown that looked muddy in light mode.) */
  color: #f59e0b;
  flex-shrink: 0;
}

.sd__fav-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Row lifted while being dragged for reorder. */
.sd__fav--dragging {
  opacity: 0.5;
}

/* Insertion line — top edge for a 'before' drop, bottom for 'after'. */
.sd__fav--drop-before::before,
.sd__fav--drop-after::after {
  content: "";
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent-gradient);
  box-shadow: 0 0 0 2px var(--color-canvas, #fafaf9);
}
.sd__fav--drop-before::before {
  top: -1px;
}
.sd__fav--drop-after::after {
  bottom: -1px;
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
  /* Rainbow conic — matches the inline-sidebar avatar in the Colorful UI. */
  background: conic-gradient(
    from 210deg,
    var(--c-lilac),
    var(--c-blue),
    var(--c-teal),
    var(--c-green),
    var(--c-amber),
    var(--c-rose),
    var(--c-lilac)
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
