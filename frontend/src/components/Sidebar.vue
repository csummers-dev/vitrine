<template>
  <aside
    class="sidebar-root w-[256px] max-md:w-[64px] max-md:items-center shrink-0 border-r border-line bg-canvas flex flex-col"
  >
    <!-- Workspace header -->
    <div
      class="h-12 px-3 max-md:px-0 max-md:justify-center flex items-center gap-2.5 shrink-0"
    >
      <img
        :src="logoPngURL"
        alt="logo"
        class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-md object-contain shrink-0"
      />
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
          @click="toSettings"
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
        ref="favListEl"
        class="px-2 pt-4 max-md:hidden"
      >
        <div class="px-2 pb-1.5">
          <button
            type="button"
            class="flex items-center gap-1 text-[10px] font-semibold text-ink-3 uppercase tracking-[0.06em] hover:text-ink-2 transition"
            :aria-expanded="!isSectionCollapsed('favorites')"
            @click="toggleSection('favorites')"
          >
            <Icon
              name="chevron-down"
              :size="11"
              :stroke-width="2.4"
              class="transition-transform shrink-0"
              :class="isSectionCollapsed('favorites') ? '-rotate-90' : ''"
            />
            <span>Favorites</span>
          </button>
        </div>
        <ul
          v-show="!isSectionCollapsed('favorites')"
          class="list-none m-0 p-0 space-y-0.5"
        >
          <li
            v-for="(path, index) in favorites"
            :key="path"
            draggable="true"
            class="rounded-md transition"
            :class="[
              // File dragged FROM the listing onto a favorite = move-into:
              // keep the solid 'drop here' ring. (draggingFavIndex is null.)
              favDragOverIndex === index && draggingFavIndex === null
                ? 'ring-2 ring-accent ring-inset bg-selected'
                : '',
              // Reordering one favorite among the others = show an insertion
              // line, NOT the move-into ring (clarity fix). The line renders
              // on the row's top edge for a 'before' drop, or its bottom edge
              // for an 'after' drop (so end-of-list drops are visible too).
              // Never drawn on the row being dragged (it has its own style).
              favDragOverIndex === index &&
              draggingFavIndex !== null &&
              draggingFavIndex !== index &&
              !favDropAfter
                ? 'fav-reorder-target'
                : '',
              favDragOverIndex === index &&
              draggingFavIndex !== null &&
              draggingFavIndex !== index &&
              favDropAfter
                ? 'fav-reorder-target--after'
                : '',
              draggingFavIndex === index ? 'fav-dragging' : '',
            ]"
            @dragstart="onFavDragStart(index, $event)"
            @dragover="onFavDragOver(index, $event)"
            @dragleave="onFavDragLeave(index)"
            @drop="onFavDrop(index, path, $event)"
            @dragend="onFavDragEnd"
          >
            <router-link
              :to="path"
              draggable="false"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition"
              :title="path"
            >
              <Icon
                name="star"
                :size="12"
                :stroke-width="0"
                fill="currentColor"
                class="text-amber-500 shrink-0"
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
        <div class="px-2 pb-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            class="flex items-center gap-1 text-[10px] font-semibold text-ink-3 uppercase tracking-[0.06em] hover:text-ink-2 transition"
            :aria-expanded="!isSectionCollapsed('recent')"
            @click="toggleSection('recent')"
          >
            <Icon
              name="chevron-down"
              :size="11"
              :stroke-width="2.4"
              class="transition-transform shrink-0"
              :class="isSectionCollapsed('recent') ? '-rotate-90' : ''"
            />
            <span>Recent</span>
          </button>
          <button
            v-if="
              recents.length > RECENTS_INITIAL && !isSectionCollapsed('recent')
            "
            type="button"
            class="text-[10px] font-medium text-ink-3 hover:text-accent transition"
            @click="recentsExpanded = !recentsExpanded"
          >
            {{ recentsExpanded ? "Show less" : "View all" }}
          </button>
        </div>
        <ul
          v-show="!isSectionCollapsed('recent')"
          class="list-none m-0 p-0 space-y-0.5"
        >
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
      <div class="sidebar-storage p-3 rounded-lg border border-line bg-surface">
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
            class="h-full rounded-full bg-gradient-to-r from-accent to-[var(--color-accent-grad)] transition-all"
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
          class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-full bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-white text-[11px] font-semibold shadow-sm shrink-0"
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

    <!-- RC-34: cursor-following hint shown while a favorite is dragged
         OUTSIDE the favorites section. Releasing there unpins it (the
         folder on disk is never touched). pointer-events:none so it never
         becomes the drop target. Teleported to body to escape clipping. -->
    <Teleport to="body">
      <div
        v-if="draggingFavIndex !== null && favWillRemove"
        class="fixed z-[10000] pointer-events-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-600 text-white text-[12px] font-medium shadow-lg"
        :style="{
          top: removeHintPos.y + 14 + 'px',
          left: removeHintPos.x + 14 + 'px',
        }"
      >
        <Icon name="star-off" :size="13" />
        <span>Remove from favorites</span>
      </div>
    </Teleport>
  </aside>
</template>

<script>
import { reactive, ref } from "vue";
import { useToast } from "vue-toastification";
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
  logoPngURL,
} from "@/utils/constants";
import { files as api } from "@/api";
import Icon from "@/components/Icon.vue";
import BrandName from "@/components/BrandName.vue";
import UndoToast from "@/components/UndoToast.vue";
import prettyBytes from "pretty-bytes";
import { usePreferences } from "@/composables/usePreferences";
import { useRecents } from "@/composables/useRecents";
import { useFavorites } from "@/composables/useFavorites";
import { useDropTarget } from "@/composables/useDropTarget";

// How many recents to show before the "View all" disclosure kicks in.
// 5 keeps the section compact in the default sidebar layout.
const RECENTS_INITIAL = 5;

const USAGE_DEFAULT = { used: "0 B", total: "0 B", usedPercentage: 0 };

export default {
  name: "sidebar",
  setup() {
    const usage = reactive(USAGE_DEFAULT);
    const prefs = usePreferences();

    // v1.3 S3-1 / S3-2: Recents + Favorites composables threaded into
    // the Options API via setup() so the computed below can read
    // them. RECENTS_INITIAL is exposed too so the template can show
    // the "View all" disclosure conditionally.
    const recentsComposable = useRecents();
    const favoritesComposable = useFavorites();
    const recentsExpanded = ref(false);
    // ── Favorites drag (RC-25/26 + RC-32/33/34) ───────────────────────
    // The file-into-favorite drop (RC-26) reuses the shared useDropTarget so
    // move/conflict handling matches the rest of the app. The reorder (RC-32)
    // and remove-on-drag-out (RC-34) gestures are handled here. RC-33: a
    // favorite drag never carries file payload, so it can't move/copy the
    // underlying folder — favorites act purely as links + reorder/remove.
    const { performDrop } = useDropTarget();
    const toast = useToast();
    const draggingFavIndex = ref(null);
    const favDragOverIndex = ref(null);
    // Whether the insertion point is AFTER the hovered row (cursor in its
    // bottom half) vs before it (top half). Drives which edge the insertion
    // line renders on — and, crucially, lets a drop at the very END of the
    // list show a line (previously only a top-edge line existed).
    const favDropAfter = ref(false);
    const favWillRemove = ref(false);
    const removeHintPos = ref({ x: 0, y: 0 });
    const favListEl = ref(null);

    /** basename of a favorited folder path, URL-decoded.
     *  "/files/Documents/Letters/" → "Letters". */
    const favoriteName = (path) => {
      const trimmed = String(path).replace(/\/+$/, "");
      const segments = trimmed.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? path;
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    };

    const isInsideFavList = (target) =>
      !!favListEl.value &&
      target instanceof Node &&
      favListEl.value.contains(target);

    const cleanupFavDrag = () => {
      draggingFavIndex.value = null;
      favDragOverIndex.value = null;
      favDropAfter.value = false;
      favWillRemove.value = false;
      document.removeEventListener("dragover", onFavDocDragOver, true);
      document.removeEventListener("drop", onFavDocDrop, true);
    };

    // Document-level (capture-phase) listeners, attached only while a
    // favorite is being dragged, so we can detect a release OUTSIDE the
    // favorites section (= remove). Capture phase lets us preventDefault the
    // drop everywhere and, when outside, stop it before any listing/breadcrumb
    // drop handler runs.
    const onFavDocDragOver = (event) => {
      if (draggingFavIndex.value === null) return;
      // Allow the drop anywhere so the drop event actually fires even when
      // released outside the list (otherwise the browser rejects it).
      event.preventDefault();
      const inside = isInsideFavList(event.target);
      favWillRemove.value = !inside;
      if (!inside) removeHintPos.value = { x: event.clientX, y: event.clientY };
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    const onFavDocDrop = (event) => {
      if (draggingFavIndex.value === null) return;
      // Inside the section → let the <li> @drop run (reorder). Only act on a
      // release OUTSIDE the favorites section.
      if (isInsideFavList(event.target)) return;
      // preventDefault stops the browser's default link-drop. We deliberately
      // do NOT stopPropagation: the downstream drop handlers (listing row,
      // breadcrumb, global upload) all no-op on a favorite drag (no file
      // payload), and letting the event bubble lets FileListing's global drop
      // handler reset the drag-dim opacity it applied on dragenter. Stopping
      // propagation here left the listing stuck at 50% opacity after a remove.
      event.preventDefault();
      const list = favoritesComposable.favorites.value;
      const removedIndex = draggingFavIndex.value;
      const path = list[removedIndex];
      const name = path ? favoriteName(path) : "";
      // RC-34: unpin ONLY — the folder on disk is never touched.
      if (path) favoritesComposable.remove(path);
      cleanupFavDrag();
      // Offer an undo (RC review #5) — re-insert at the exact prior position.
      if (path) {
        const id = toast(
          {
            component: UndoToast,
            props: {
              message: `Removed “${name}” from favorites`,
              icon: "star-off",
              onClick: () => {
                favoritesComposable.insert(path, removedIndex);
                toast.dismiss(id);
              },
            },
          },
          { timeout: 6000, closeOnClick: false, icon: false }
        );
      }
    };

    const onFavDragStart = (index, event) => {
      draggingFavIndex.value = index;
      favWillRemove.value = false;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        // Internal marker. A favorite drag never populates
        // fileStore.draggedItems, so it can't trigger a move/copy (RC-33).
        event.dataTransfer.setData("text/x-fb-favorite", String(index));
      }
      document.addEventListener("dragover", onFavDocDragOver, true);
      document.addEventListener("drop", onFavDocDrop, true);
    };
    const onFavDragOver = (index, event) => {
      // RC-32: a favorite reorder takes priority — branch on the favorite
      // drag FIRST so a stale draggedItems snapshot (left over when
      // spring-load unmounts a listing row before its dragend) can't
      // mis-route the reorder into a file move.
      if (draggingFavIndex.value !== null) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        favDragOverIndex.value = index;
        // Top half → insert BEFORE this row; bottom half → AFTER it. The
        // "after" case is what lets a drop at the very bottom of the list
        // show an insertion line at the row's lower edge.
        const rect = event.currentTarget?.getBoundingClientRect();
        favDropAfter.value = rect
          ? event.clientY > rect.top + rect.height / 2
          : false;
        return;
      }
      // RC-26: a file/folder dragged from the listing drops INTO this favorite.
      if (useFileStore().draggedItems.length > 0) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            event.ctrlKey || event.metaKey ? "copy" : "move";
        }
        favDragOverIndex.value = index;
      }
    };
    const onFavDragLeave = (index) => {
      if (favDragOverIndex.value === index) favDragOverIndex.value = null;
    };
    const onFavDrop = (index, path, event) => {
      const after = favDropAfter.value;
      favDragOverIndex.value = null;
      // RC-32/33: favorite reorder — never a filesystem move/copy.
      if (draggingFavIndex.value !== null) {
        event.preventDefault();
        const from = draggingFavIndex.value;
        const len = favoritesComposable.favorites.value.length;
        // Gap in the ORIGINAL array where the item should land: before the
        // hovered row, or after it (bottom-half / end-of-list drop).
        const insertSlot = after ? index + 1 : index;
        // reorder() removes first then re-inserts, so any slot past `from`
        // shifts down by one — convert to the post-removal target index and
        // clamp to a valid insert position (max = len-1 = append at end).
        let target = insertSlot > from ? insertSlot - 1 : insertSlot;
        target = Math.max(0, Math.min(target, len - 1));
        favoritesComposable.reorder(from, target);
        cleanupFavDrag();
        return;
      }
      // RC-26: a file/folder dropped into this favorite folder.
      if (useFileStore().draggedItems.length > 0) {
        const targetUrl = path.endsWith("/") ? path : path + "/";
        void performDrop(event, targetUrl);
      }
    };
    const onFavDragEnd = () => {
      cleanupFavDrag();
    };

    // ── Section collapse/expand (RC-35) ────────────────────────────────
    // Persisted per-section under one prefs object so first-time users get
    // everything expanded by default.
    const isSectionCollapsed = (key) =>
      !!prefs.get("sidebarCollapsedSections", {})[key];
    const toggleSection = (key) => {
      const cur = prefs.get("sidebarCollapsedSections", {});
      void prefs.set("sidebarCollapsedSections", {
        ...cur,
        [key]: !cur[key],
      });
    };

    return {
      usage,
      usageAbortController: new AbortController(),
      prefs,
      recentsComposable,
      favoritesComposable,
      recentsExpanded,
      RECENTS_INITIAL,
      performDrop,
      draggingFavIndex,
      favDropAfter,
      favDragOverIndex,
      favWillRemove,
      removeHintPos,
      favListEl,
      favoriteName,
      onFavDragStart,
      onFavDragOver,
      onFavDragLeave,
      onFavDrop,
      onFavDragEnd,
      cleanupFavDrag,
      isSectionCollapsed,
      toggleSection,
    };
  },
  components: {
    Icon,
    BrandName,
  },
  computed: {
    ...mapState(useAuthStore, ["user", "isLoggedIn"]),
    ...mapState(useFileStore, ["isFiles", "reload"]),
    ...mapState(useLayoutStore, ["currentPromptName"]),
    signup: () => signup,
    hideLoginButton: () => hideLoginButton,
    version: () => version,
    logoPngURL: () => logoPngURL,
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
    toAccountSettings() {
      this.$router.push({ path: "/settings/profile" });
      this.closeHovers();
    },
    toSettings() {
      // Settings always opens on Profile (RC-31). Global settings remains
      // one click away in the settings left rail. /settings already
      // redirects to /settings/profile, but route it explicitly so intent
      // is obvious at the call site.
      this.$router.push({ path: "/settings/profile" });
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
    // Safety: drop any favorite-drag document listeners if we unmount
    // mid-drag (dragend normally handles this).
    this.cleanupFavDrag();
  },
};
</script>

<style scoped>
/* ── Favorites drag affordances ──────────────────────────────────────
   Reordering a favorite must NOT look like moving a file *into* a folder.
   Move-into keeps the solid accent ring (set via Tailwind in the template);
   reordering instead shows a thin insertion line where the item will land,
   plus a "lifted" dashed treatment on the row being dragged. */

/* Insertion line marking where the favorite will land: the TOP edge of the
   hovered row for a 'before' drop, or the BOTTOM edge for an 'after' drop
   (the latter is what makes a drop at the very end of the list visible). */
.fav-reorder-target,
.fav-reorder-target--after {
  position: relative;
}
.fav-reorder-target::before,
.fav-reorder-target--after::after {
  content: "";
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent-gradient);
  box-shadow: 0 0 0 2px var(--color-canvas, #fafaf9);
}
.fav-reorder-target::before {
  top: -1px;
}
.fav-reorder-target--after::after {
  bottom: -1px;
}

/* The favorite currently being dragged for reorder: lifted, dashed — clearly
   "picked up to re-order", distinct from the solid move-into highlight. */
.fav-dragging {
  opacity: 0.5;
  outline: 1px dashed var(--color-accent, #5e6ad2);
  outline-offset: -1px;
}
</style>
