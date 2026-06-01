<template>
  <aside
    class="sidebar-root w-[256px] max-md:w-[64px] max-md:items-center shrink-0 border-r border-line bg-canvas flex flex-col"
  >
    <!-- Workspace header -->
    <div
      class="h-12 px-3 max-md:px-0 max-md:justify-center flex items-center gap-2.5 shrink-0"
    >
      <div
        class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-md bg-gradient-to-br from-[#5e6ad2] to-[#4f5ac4] flex items-center justify-center shadow-sm shrink-0"
      >
        <Icon name="folder" :size="14" :stroke-width="1.8" class="text-white" />
      </div>
      <div class="flex-1 min-w-0 max-md:hidden">
        <div
          class="text-[13px] font-semibold leading-tight truncate text-ink-1"
        >
          <!-- App wordmark: BrandName tints "pretty" in the theme accent.
               Hardcoded brand string (not the instance name) — this is the
               application's identity, not the configured workspace label. -->
          <BrandName name="filebrowser pretty" />
        </div>
        <div
          class="text-[11px] text-ink-3 leading-tight truncate font-mono tabular"
        >
          v{{ version }}
        </div>
      </div>
    </div>

    <template v-if="isLoggedIn">
      <!-- Primary actions -->
      <div
        v-if="user.perm.create"
        class="px-3 pb-2 flex gap-1.5 max-md:flex-col max-md:items-center"
      >
        <button
          @click="showHover('newDir')"
          class="flex-1 h-8 rounded-md bg-accent text-white text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-accent-strong transition shadow-sm max-md:flex-none max-md:w-10 max-md:h-10 max-md:p-0"
          :title="$t('sidebar.newFolder')"
          :aria-label="$t('sidebar.newFolder')"
        >
          <Icon name="folder-plus" :size="14" />
          <span class="max-md:hidden">{{ $t("sidebar.newFolder") }}</span>
        </button>
        <button
          @click="showHover('newFile')"
          class="w-8 h-8 max-md:w-10 max-md:h-10 rounded-md border border-line bg-surface hover:bg-elevated flex items-center justify-center text-ink-2 transition"
          :title="$t('sidebar.newFile')"
          :aria-label="$t('sidebar.newFile')"
        >
          <Icon name="file-plus" :size="14" />
        </button>
      </div>

      <!-- Quick links -->
      <nav
        class="px-2 pt-2 space-y-0.5 text-[13px] max-md:px-0 max-md:flex max-md:flex-col max-md:items-center"
      >
        <button
          @click="toRoot"
          :class="[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0',
            isFiles
              ? 'bg-selected text-accent font-medium'
              : 'hover:bg-hover text-ink-2',
          ]"
          :title="$t('sidebar.myFiles')"
          :aria-label="$t('sidebar.myFiles')"
        >
          <Icon name="folder" :size="14" />
          <span class="flex-1 max-md:hidden">{{ $t("sidebar.myFiles") }}</span>
          <span
            v-if="filesCount > 0"
            class="text-[11px] text-ink-3 tabular max-md:hidden"
          >
            {{ filesCount }}
          </span>
        </button>

        <button
          v-if="user.perm.admin"
          @click="toGlobalSettings"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-ink-2 transition text-left max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0"
          :title="$t('sidebar.settings')"
          :aria-label="$t('sidebar.settings')"
        >
          <Icon name="settings-2" :size="14" />
          <span class="flex-1 max-md:hidden">{{ $t("sidebar.settings") }}</span>
        </button>
      </nav>

      <!-- Favorites (v1.3 S3-2). Pinned folders from useFavorites.
           Hidden in icon-rail mode. Empty list is suppressed entirely
           (no "None yet" filler) — the sidebar only shows the section
           when there's content, so first-time users aren't presented
           with empty scaffolding. -->
      <nav
        v-if="isLoggedIn && favorites.length > 0"
        class="px-2 pt-4 max-md:hidden"
      >
        <div
          class="px-2 pb-1.5 text-[10px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
        >
          Favorites
        </div>
        <ul class="list-none m-0 p-0 space-y-0.5">
          <li v-for="path in favorites" :key="path">
            <router-link
              :to="path"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition"
              :title="path"
            >
              <Icon
                name="star"
                :size="12"
                :stroke-width="0"
                fill="currentColor"
                class="text-amber-700 shrink-0"
              />
              <span class="truncate flex-1">{{ favoriteName(path) }}</span>
            </router-link>
          </li>
        </ul>
      </nav>

      <!-- Recent (v1.3 S3-1). MRU log of recently-previewed files.
           Capped at 5 visible; "View all" disclosure expands the rest
           (up to the 50-cap from the store). Click opens preview by
           routing to the file's URL. -->
      <nav
        v-if="isLoggedIn && recents.length > 0"
        class="px-2 pt-4 max-md:hidden"
      >
        <div
          class="px-2 pb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
        >
          <span>Recent</span>
          <button
            v-if="recents.length > RECENTS_INITIAL"
            type="button"
            class="text-[10px] font-medium text-ink-3 hover:text-accent transition"
            @click="recentsExpanded = !recentsExpanded"
          >
            {{ recentsExpanded ? "Show less" : "View all" }}
          </button>
        </div>
        <ul class="list-none m-0 p-0 space-y-0.5">
          <li v-for="r in visibleRecents" :key="r.path">
            <router-link
              :to="`/files${r.path}`"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition"
              :title="r.path"
            >
              <Icon name="file" :size="12" class="text-ink-3 shrink-0" />
              <span class="truncate flex-1">{{ r.name }}</span>
            </router-link>
          </li>
        </ul>
      </nav>

      <!-- Smart folders (v1.3 S2-6). Section header + list + "+ New"
           CTA. Hidden in icon-rail mode (the eyebrow + list don't
           collapse gracefully to 40 px width). -->
      <nav class="px-2 pt-4 max-md:hidden" v-if="isLoggedIn">
        <div
          class="px-2 pb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
        >
          <span>Smart folders</span>
          <button
            type="button"
            class="w-4 h-4 inline-flex items-center justify-center rounded text-ink-3 hover:text-accent hover:bg-hover transition"
            title="New smart folder"
            aria-label="New smart folder"
            @click="openNewSmartFolder"
          >
            <Icon name="plus" :size="11" :stroke-width="2" />
          </button>
        </div>
        <ul class="list-none m-0 p-0 space-y-0.5">
          <li v-for="f in smartFolders" :key="f.id">
            <router-link
              :to="`/smart/${f.id}`"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition"
              :title="f.query || f.name"
            >
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="`smart-folder-dot--${f.color}`"
              />
              <span class="truncate flex-1">{{ f.name }}</span>
            </router-link>
          </li>
          <li
            v-if="smartFolders.length === 0"
            class="px-2 py-1 text-[11.5px] text-ink-3 italic"
          >
            None yet.
          </li>
        </ul>
      </nav>

      <SmartFolderSheet
        :open="smartSheetOpen"
        :folder="smartSheetTarget"
        @cancel="closeSmartSheet"
        @saved="closeSmartSheet"
        @deleted="closeSmartSheet"
      />
    </template>

    <template v-else>
      <!-- Logged-out actions -->
      <nav
        class="px-2 pt-2 space-y-0.5 text-[13px] max-md:px-0 max-md:flex max-md:flex-col max-md:items-center"
      >
        <router-link
          v-if="!hideLoginButton"
          to="/login"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-ink-2 transition max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0"
          :title="$t('sidebar.login')"
          :aria-label="$t('sidebar.login')"
        >
          <Icon name="log-in" :size="14" />
          <span class="flex-1 max-md:hidden">{{ $t("sidebar.login") }}</span>
        </router-link>
        <router-link
          v-if="signup"
          to="/login"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-ink-2 transition max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0"
          :title="$t('sidebar.signup')"
          :aria-label="$t('sidebar.signup')"
        >
          <Icon name="user-plus" :size="14" />
          <span class="flex-1 max-md:hidden">{{ $t("sidebar.signup") }}</span>
        </router-link>
      </nav>
    </template>

    <div class="flex-1"></div>

    <!-- Storage card (hidden in icon-rail) -->
    <div
      v-if="isLoggedIn && isFiles && !disableUsedPercentage"
      class="px-3 pb-3 max-md:hidden"
    >
      <div class="p-3 rounded-lg border border-line bg-surface">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-1.5">
            <Icon name="hard-drive" :size="14" class="text-ink-2" />
            <span class="text-[12px] font-semibold text-ink-1">Storage</span>
          </div>
          <span class="text-[11px] text-ink-3 tabular"
            >{{ usage.usedPercentage }}%</span
          >
        </div>
        <div class="h-1.5 rounded-full bg-elevated overflow-hidden">
          <div
            class="h-full rounded-full bg-gradient-to-r from-accent to-[#7c87e5] transition-all"
            :style="{ width: usage.usedPercentage + '%' }"
          ></div>
        </div>
        <div class="mt-2 text-[11px] text-ink-3 tabular flex justify-between">
          <span>{{ usage.used }} used</span>
          <span>{{ usage.total }}</span>
        </div>
      </div>
    </div>

    <!-- User row -->
    <div
      v-if="isLoggedIn"
      class="px-3 pb-3 border-t border-line pt-3 flex items-center gap-1.5 max-md:px-0 max-md:flex-col max-md:gap-1"
    >
      <button
        @click="toAccountSettings"
        class="flex-1 flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-hover transition min-w-0 max-md:flex-none max-md:p-0"
        :title="user.username"
      >
        <div
          class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-full bg-gradient-to-br from-[#7c87e5] to-[#4f5ac4] flex items-center justify-center text-white text-[11px] font-semibold shadow-sm shrink-0"
        >
          {{ userInitials }}
        </div>
        <div class="flex-1 min-w-0 text-left max-md:hidden">
          <div
            class="text-[13px] font-medium leading-tight truncate text-ink-1"
          >
            {{ user.username }}
          </div>
          <div class="text-[11px] text-ink-3 leading-tight truncate">
            {{ user.perm.admin ? "admin" : "user" }}
          </div>
        </div>
      </button>
      <button
        v-if="canLogout"
        @click="logout"
        class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-md hover:bg-hover flex items-center justify-center text-ink-3 hover:text-ink-1 transition"
        :title="$t('sidebar.logout')"
        :aria-label="$t('sidebar.logout')"
      >
        <Icon name="log-out" :size="14" />
      </button>
    </div>
  </aside>
</template>

<script>
import { reactive, ref } from "vue";
import { mapActions, mapState } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import * as auth from "@/utils/auth";
import {
  version,
  signup,
  hideLoginButton,
  disableExternal,
  disableUsedPercentage,
  noAuth,
  logoutPage,
  loginPage,
} from "@/utils/constants";
import { files as api } from "@/api";
import Icon from "@/components/Icon.vue";
import BrandName from "@/components/BrandName.vue";
import SmartFolderSheet from "@/components/SmartFolderSheet.vue";
import prettyBytes from "pretty-bytes";
import { usePreferences } from "@/composables/usePreferences";
import { useRecents } from "@/composables/useRecents";
import { useFavorites } from "@/composables/useFavorites";

// How many recents to show before the "View all" disclosure kicks in.
// 5 keeps the section compact in the default sidebar layout.
const RECENTS_INITIAL = 5;

const USAGE_DEFAULT = { used: "0 B", total: "0 B", usedPercentage: 0 };

export default {
  name: "sidebar",
  setup() {
    const usage = reactive(USAGE_DEFAULT);
    // Smart folder sheet state (v1.3 S2-6). Lives in the Sidebar so
    // the "+ New" affordance + the sheet share a parent. Refs so they
    // unwrap correctly in the template and via `this.` access.
    const prefs = usePreferences();
    const smartSheetOpen = ref(false);
    // `smartSheetTarget` holds either a SmartFolder when editing or
    // null when creating. No explicit annotation because this <script>
    // block isn't lang=ts; the assignments at the call sites carry
    // enough shape info for Vue's template type-check.
    const smartSheetTarget = ref(null);

    // v1.3 S3-1 / S3-2: Recents + Favorites composables threaded into
    // the Options API via setup() so the computed below can read
    // them. RECENTS_INITIAL is exposed too so the template can show
    // the "View all" disclosure conditionally.
    const recentsComposable = useRecents();
    const favoritesComposable = useFavorites();
    const recentsExpanded = ref(false);
    return {
      usage,
      usageAbortController: new AbortController(),
      prefs,
      smartSheetOpen,
      smartSheetTarget,
      recentsComposable,
      favoritesComposable,
      recentsExpanded,
      RECENTS_INITIAL,
    };
  },
  components: {
    Icon,
    BrandName,
    SmartFolderSheet,
  },
  inject: ["$showError"],
  computed: {
    ...mapState(useAuthStore, ["user", "isLoggedIn"]),
    ...mapState(useFileStore, ["isFiles", "reload"]),
    ...mapState(useLayoutStore, ["currentPromptName"]),
    signup: () => signup,
    hideLoginButton: () => hideLoginButton,
    version: () => version,
    disableExternal: () => disableExternal,
    disableUsedPercentage: () => disableUsedPercentage,
    canLogout: () => !noAuth && (loginPage || logoutPage !== "/login"),
    userInitials() {
      const name = this.user?.username || "";
      const parts = name.split(/[\s._-]/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    },
    filesCount() {
      const fileStore = useFileStore();
      return (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0);
    },
    /** Smart-folder list straight from user prefs (S1-2 composable).
     *  Reactive because usePreferences's get reads through the auth
     *  store's user.preferences map, which Pinia tracks. */
    smartFolders() {
      return this.prefs.get("smartFolders", []);
    },
    /** Recents + Favorites (v1.3 S3-1 / S3-2). Reactive reads from
     *  the composables — the underlying prefs Pinia store handles
     *  cross-tab + post-mutation reactivity. */
    recents() {
      return this.recentsComposable.recents.value;
    },
    favorites() {
      return this.favoritesComposable.favorites.value;
    },
    /** First N recents OR the full list depending on the
     *  "View all" toggle. Cap from useRecents (50) is the upper
     *  bound; the toggle just expands within that. */
    visibleRecents() {
      return this.recentsExpanded
        ? this.recents
        : this.recents.slice(0, RECENTS_INITIAL);
    },
  },
  methods: {
    ...mapActions(useLayoutStore, ["closeHovers", "showHover"]),
    abortOngoingFetchUsage() {
      this.usageAbortController.abort();
    },
    async fetchUsage() {
      const path = this.$route.path.endsWith("/")
        ? this.$route.path
        : this.$route.path + "/";
      let usageStats = USAGE_DEFAULT;
      if (this.disableUsedPercentage) {
        return Object.assign(this.usage, usageStats);
      }
      try {
        this.abortOngoingFetchUsage();
        this.usageAbortController = new AbortController();
        const usage = await api.usage(path, this.usageAbortController.signal);
        usageStats = {
          used: prettyBytes(usage.used, { binary: true }),
          total: prettyBytes(usage.total, { binary: true }),
          usedPercentage: Math.round((usage.used / usage.total) * 100),
        };
      } finally {
        return Object.assign(this.usage, usageStats);
      }
    },
    toRoot() {
      this.$router.push({ path: "/files" });
      this.closeHovers();
    },
    /** Display name for a favorited folder — basename of the path,
     *  URL-decoded. "/files/Documents/Letters/" → "Letters". v1.3 S3-2. */
    favoriteName(path) {
      const trimmed = path.replace(/\/+$/, "");
      const segments = trimmed.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? path;
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    },
    /** Open the SmartFolderSheet in create mode. Edit mode is reached
     *  by clicking the pencil icon inside SmartFolderView, which has
     *  its own sheet instance — we don't try to share state across
     *  the two locations. */
    openNewSmartFolder() {
      this.smartSheetTarget = null;
      this.smartSheetOpen = true;
    },
    closeSmartSheet() {
      this.smartSheetOpen = false;
      this.smartSheetTarget = null;
    },
    toAccountSettings() {
      this.$router.push({ path: "/settings/profile" });
      this.closeHovers();
    },
    toGlobalSettings() {
      this.$router.push({ path: "/settings/global" });
      this.closeHovers();
    },
    logout: auth.logout,
  },
  watch: {
    $route: {
      handler(to) {
        if (to.path.includes("/files")) {
          this.fetchUsage();
        }
      },
      immediate: true,
    },
  },
  unmounted() {
    this.abortOngoingFetchUsage();
  },
};
</script>
