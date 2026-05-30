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
          class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[11px] font-semibold shadow-sm shrink-0"
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
import { reactive } from "vue";
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
import prettyBytes from "pretty-bytes";

const USAGE_DEFAULT = { used: "0 B", total: "0 B", usedPercentage: 0 };

export default {
  name: "sidebar",
  setup() {
    const usage = reactive(USAGE_DEFAULT);
    return { usage, usageAbortController: new AbortController() };
  },
  components: {
    Icon,
    BrandName,
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
