<template>
  <aside class="sd" @click="onItemClick">
    <!-- ── Workspace header ─────────────────────────────────────────── -->
    <header class="sd__header">
      <img class="sd__brand-mark" :src="logoPngURL" alt="logo" />
      <div class="sd__brand-text">
        <div class="sd__brand-name">
          <BrandName name="filebrowser pretty" />
        </div>
        <a
          :href="repoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="sd__brand-version"
          >v{{ version }}</a
        >
      </div>
    </header>

    <!-- Scrollable middle: the header above and the user footer below stay
         pinned (flex-shrink:0); everything here scrolls, so on a short
         viewport the footer is never clipped (the reported cut-off). -->
    <div class="sd__scroll">
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
          <span class="sd__navrow-label">{{
            rootLabel || t("sidebar.myFiles")
          }}</span>
          <span v-if="filesCount > 0" class="sd__navrow-count">
            {{ filesCount }}
          </span>
        </button>

        <!-- Settings + Profile both live on the user row at the bottom (the
           avatar routes into Settings), so a separate nav item here was a
           duplicate destination — removed to match the desktop sidebar. -->
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
         Long-press a row to reorder (touch DnD); tap to open. Collapsible —
         the collapsed state is shared with the desktop sidebar (same prefs
         key) so it syncs across devices. -->
      <nav
        v-if="isLoggedIn && favorites.length > 0"
        class="sd__section sd__favs"
      >
        <button
          type="button"
          class="sd__section-toggle"
          :aria-expanded="!isCollapsed('favorites')"
          @click.stop="toggleSection('favorites')"
        >
          <Icon
            name="chevron-down"
            :size="12"
            :stroke-width="2.4"
            class="sd__chevron"
            :class="{ 'sd__chevron--collapsed': isCollapsed('favorites') }"
          />
          <span>Favorites</span>
        </button>
        <ul
          v-show="!isCollapsed('favorites')"
          ref="favListEl"
          class="sd__fav-list"
        >
          <li
            v-for="(path, index) in favorites"
            :key="path"
            :data-fav-index="index"
            class="sd__fav"
            :class="{
              'sd__fav--dragging': favDragIndex === index,
              'sd__fav--drop-before':
                favDropIndex === index &&
                favDragIndex !== index &&
                !favDropAfter,
              'sd__fav--drop-after':
                favDropIndex === index &&
                favDragIndex !== index &&
                favDropAfter,
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

      <!-- ── Recent (mobile parity with the desktop sidebar) ──────────────
         MRU log of recently-previewed files. Capped at 5 with a "View all"
         disclosure; collapsible (state shared cross-device with desktop). -->
      <nav
        v-if="isLoggedIn && recents.length > 0"
        class="sd__section sd__recents"
      >
        <div class="sd__section-head">
          <button
            type="button"
            class="sd__section-toggle"
            :aria-expanded="!isCollapsed('recent')"
            @click.stop="toggleSection('recent')"
          >
            <Icon
              name="chevron-down"
              :size="12"
              :stroke-width="2.4"
              class="sd__chevron"
              :class="{ 'sd__chevron--collapsed': isCollapsed('recent') }"
            />
            <span>Recent</span>
          </button>
          <button
            v-if="recents.length > RECENTS_INITIAL && !isCollapsed('recent')"
            type="button"
            class="sd__viewall"
            @click.stop="recentsExpanded = !recentsExpanded"
          >
            {{ recentsExpanded ? "Show less" : "View all" }}
          </button>
        </div>
        <ul v-show="!isCollapsed('recent')" class="sd__recent-list">
          <li v-for="(r, ri) in visibleRecents" :key="r.path">
            <router-link
              :to="`/files${r.path}`"
              class="sd__recent-btn"
              :title="r.path"
            >
              <Icon
                name="file"
                :size="13"
                :style="{ color: recentHue(ri) }"
                class="sd__recent-icon"
              />
              <span class="sd__recent-name">{{ r.name }}</span>
            </router-link>
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
    </div>
    <!-- /sd__scroll -->

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
import { useRecents } from "@/composables/useRecents";
import { usePreferences } from "@/composables/usePreferences";
import { useRootLabel } from "@/composables/useRootLabel";
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
  repoUrl,
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

// Custom "My files" label (set via the desktop sidebar's right-click rename).
const { rootLabel } = useRootLabel();

// ── Recents (mobile parity with the desktop sidebar) ───────────────────
const RECENTS_INITIAL = 5;
const recentsComposable = useRecents();
const recents = computed(() => recentsComposable.recents.value);
const recentsExpanded = ref(false);
const visibleRecents = computed(() =>
  recentsExpanded.value
    ? recents.value
    : recents.value.slice(0, RECENTS_INITIAL)
);
// Cycle the recent-file icons through the six accent hues so the section
// reads colorful — matches the desktop sidebar.
const RECENT_HUES = [
  "var(--c-lilac)",
  "var(--c-blue)",
  "var(--c-teal)",
  "var(--c-green)",
  "var(--c-amber)",
  "var(--c-rose)",
];
const recentHue = (i: number): string => RECENT_HUES[i % RECENT_HUES.length];

// ── Section collapse/expand ────────────────────────────────────────────
// Shared with the desktop Sidebar via the SAME prefs key, so a collapsed
// Favorites / Recent stays collapsed when you switch devices.
const prefs = usePreferences();
const isCollapsed = (key: string): boolean =>
  !!prefs.get<Record<string, boolean>>("sidebarCollapsedSections", {})[key];
const toggleSection = (key: string) => {
  const cur = prefs.get<Record<string, boolean>>(
    "sidebarCollapsedSections",
    {}
  );
  void prefs.set("sidebarCollapsedSections", { ...cur, [key]: !cur[key] });
};

const favListEl = ref<HTMLElement | null>(null);
const favDragIndex = ref<number | null>(null);
const favDropIndex = ref<number | null>(null);
const favDropAfter = ref(false);
// After a long-press reorder, the trailing click is suppressed so the row
// doesn't also navigate (and close the drawer).
let suppressClickUntil = 0;

/** Sidebar label for a favorited folder: the user's custom display title
 *  when set, otherwise the folder's basename. Delegates to the shared
 *  useFavorites.displayName so the mobile drawer matches the desktop
 *  Sidebar — custom titles are stored in (cross-device) preferences, so
 *  without this the drawer fell back to the basename and the names looked
 *  "missing" on phones even though they synced fine. */
const favoriteName = (path: string): string =>
  favoritesComposable.displayName(path);

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

/* Scrollable middle region: absorbs the leftover height between the pinned
   header and footer and scrolls its own overflow, so the footer (user +
   logout) can never be pushed off the bottom on a short viewport. */
.sd__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
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
  width: fit-content;
  text-decoration: none;
  transition: color var(--dur-base) ease;
}
.sd__brand-version:hover {
  color: var(--color-accent, #5e6ad2);
  text-decoration: underline;
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
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease,
    color var(--dur-base) ease;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
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

/* ── Collapsible section headers (Favorites / Recent) ────────────────────
   A chevron toggle replaces the static section label, matching the desktop
   sidebar. The collapsed state persists (and syncs across devices). */
.sd__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
}

.sd__section-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 6px 8px;
  margin: 0;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  transition: color var(--dur-base) ease;
}
.sd__section-toggle:hover {
  color: var(--color-ink-2, #52525b);
}
/* Inside Recent's head (which also holds "View all"), the head owns the
   padding so the toggle drops its own to keep the chevrons aligned. */
.sd__section-head .sd__section-toggle {
  padding: 0;
}

.sd__chevron {
  flex-shrink: 0;
  transition: transform var(--dur-base) ease;
}
.sd__chevron--collapsed {
  transform: rotate(-90deg);
}

.sd__viewall {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 10px;
  font-weight: 500;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  transition: color var(--dur-base) ease;
}
.sd__viewall:hover {
  color: var(--color-accent, #5e6ad2);
}

/* ── Recent list ─────────────────────────────────────────────────────── */
.sd__recents {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sd__recent-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: 240px;
}

.sd__recent-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--color-ink-2, #52525b);
  font-size: 13.5px;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.sd__recent-btn:hover {
  background: var(--color-hover, var(--color-elevated, #f4f4f5));
  color: var(--color-ink-1, #18181b);
}

.sd__recent-icon {
  flex-shrink: 0;
}

.sd__recent-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  /* Keep the row clear of the iOS home indicator / gesture bar. */
  padding-bottom: max(10px, env(safe-area-inset-bottom));
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
  transition: background-color var(--dur-base) ease;
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

/* Rose-tinted so the destructive "leave" action reads apart from the neutral
   nav chrome. */
.sd__logout {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--c-rose);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}

.sd__logout:hover {
  background: color-mix(in srgb, var(--c-rose) 14%, transparent);
  color: var(--c-rose);
}
</style>
