<template>
  <aside
    class="sidebar-root shrink-0 bg-canvas flex flex-col transition-[width] duration-150"
    :class="
      collapsed && isLoggedIn
        ? 'w-[56px] items-center sidebar-collapsed'
        : 'w-[256px] max-md:w-[64px] max-md:items-center'
    "
  >
    <!-- Workspace header -->
    <div
      class="h-12 px-3 max-md:px-0 max-md:justify-center flex items-center gap-2.5 shrink-0 s-rail-head"
    >
      <img
        :src="logoURL"
        alt="logo"
        class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-md object-contain shrink-0"
      />
      <div class="flex-1 min-w-0 max-md:hidden s-hide">
        <div
          class="text-[13px] font-semibold leading-tight truncate text-ink-1"
        >
          <!-- App wordmark: BrandName tints "pretty" in the theme accent.
               Hardcoded brand string (not the instance name) — this is the
               application's identity, not the configured workspace label. -->
          <BrandName name="filebrowser pretty" />
        </div>
        <a
          :href="repoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[11px] text-ink-3 hover:text-accent leading-tight truncate font-mono tabular transition-colors w-fit"
          title="View source on GitHub"
        >
          v{{ version }}
        </a>
      </div>
      <!-- Collapse toggle — sits alongside the title to use the header space
           (expanded only). When collapsed it moves to its own centred row below
           the logo (there's no room for it beside a 64px rail). -->
      <button
        v-if="isLoggedIn && !collapsed"
        type="button"
        class="w-7 h-7 rounded-md hover:bg-hover text-ink-3 hover:text-ink-1 flex items-center justify-center transition shrink-0"
        title="Collapse sidebar"
        aria-label="Collapse sidebar"
        @click="toggleCollapsed"
      >
        <Icon name="chevrons-left" :size="15" />
      </button>
    </div>

    <template v-if="isLoggedIn">
      <!-- Expand toggle for the collapsed rail (centred below the logo). When
           expanded, the toggle lives in the header beside the title instead. -->
      <div v-if="collapsed" class="pt-1 pb-0.5 px-0 flex justify-center">
        <button
          type="button"
          class="w-7 h-7 rounded-md hover:bg-hover text-ink-3 hover:text-ink-1 flex items-center justify-center transition"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          :aria-pressed="collapsed"
          @click="toggleCollapsed"
        >
          <Icon name="chevrons-right" :size="15" />
        </button>
      </div>

      <!-- v2.7.x: the "New folder" / "new file" CTA block is GONE from the
           rail. Creation lives where content lives — the listing's ⋯ menu,
           the empty-space right-click, the split header's button, and the
           inline new-item row — so the sidebar stays pure navigation (the
           gradient slab was also the last heavy chrome on the canvas rail).
           The mobile DRAWER keeps its create buttons: touch has no
           right-click, so the drawer stays the command hub there. -->

      <!-- Quick links -->
      <nav
        class="px-2 pt-2 space-y-0.5 text-[13px] max-md:px-0 max-md:flex max-md:flex-col max-md:items-center s-rail-row"
      >
        <button
          @click="toRoot"
          @contextmenu.prevent="onMyFilesContextMenu($event)"
          :class="[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0 s-rail-btn',
            mainNavActive
              ? 'bg-selected text-accent-ink font-medium'
              : 'hover:bg-hover text-ink-2',
          ]"
          :title="rootLabel || $t('sidebar.myFiles')"
          :aria-label="rootLabel || $t('sidebar.myFiles')"
        >
          <Icon
            name="folder"
            :size="14"
            class="shrink-0"
            :class="
              mainNavActive
                ? 'text-[var(--color-accent-ink)]'
                : 'text-[var(--color-ink-2)]'
            "
          />
          <span class="flex-1 max-md:hidden s-hide">{{
            rootLabel || $t("sidebar.myFiles")
          }}</span>
          <span
            v-if="filesCount > 0"
            class="text-[11px] text-ink-3 tabular max-md:hidden s-hide"
          >
            {{ filesCount }}
          </span>
        </button>

        <!-- Trash / recycle bin (2.4.0 Stage 2). Deleted items land here and
             can be restored or removed for good. -->
        <button
          @click="toTrash"
          :class="[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left max-md:w-10 max-md:h-10 max-md:p-0 max-md:justify-center max-md:gap-0 s-rail-btn',
            trashNavActive
              ? 'bg-selected text-accent-ink font-medium'
              : 'hover:bg-hover text-ink-2',
          ]"
          :title="$t('sidebar.trash')"
          :aria-label="$t('sidebar.trash')"
        >
          <Icon
            name="trash-2"
            :size="14"
            class="shrink-0"
            :class="
              trashNavActive
                ? 'text-[var(--color-accent-ink)]'
                : 'text-[var(--color-ink-2)]'
            "
          />
          <span class="flex-1 max-md:hidden s-hide">{{
            $t("sidebar.trash")
          }}</span>
        </button>

        <!-- Settings is reachable by clicking the username row below (which
             routes to Profile/Settings), so a separate nav item here was a
             duplicate of the same destination. -->
      </nav>

      <!-- Scrollable middle region. ONLY Favorites + Recents live here, so
           they're the only thing that scrolls when the pinned / recent lists
           grow tall. Everything above (header, primary actions, the main
           folder link) stays fixed at the top; the storage card and the
           user/logout row stay fixed at the bottom. `flex-1 min-h-0` lets this
           region absorb the leftover height and scroll internally instead of
           pushing the sidebar past the bottom of the viewport (the bug). In
           icon-rail mode its children are hidden, so it collapses to an empty
           flex spacer — which still correctly pins the user row to the bottom. -->
      <div
        class="sidebar-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        <!-- Collapsed (icon-rail) Favorites: each pinned folder becomes a star
             icon; hovering shows the folder name (title). Recents are omitted
             from the rail entirely (spec). Only rendered while manually
             collapsed — the responsive max-md: rail keeps its prior behaviour
             (favorites hidden). -->
        <nav
          v-if="collapsed && isLoggedIn && favorites.length > 0"
          class="pt-2 flex flex-col items-center gap-1.5"
          aria-label="Favorites"
        >
          <button
            v-for="path in favorites"
            :key="path"
            type="button"
            class="s-rail-btn rounded-md hover:bg-hover flex items-center justify-center transition"
            :title="favoriteName(path)"
            :aria-label="favoriteName(path)"
            @click="navigateFavorite(path)"
            @contextmenu="onFavoriteContextMenu(path, $event)"
          >
            <Icon
              name="star"
              :size="16"
              :stroke-width="0"
              fill="currentColor"
              class="text-[var(--c-amber)]"
            />
          </button>
        </nav>

        <!-- Favorites (v1.3 S3-2). Pinned folders from useFavorites.
             Hidden in icon-rail mode. Empty list is suppressed entirely
             (no "None yet" filler) — the sidebar only shows the section
             when there's content, so first-time users aren't presented
             with empty scaffolding. -->
        <nav
          v-if="isLoggedIn && favorites.length > 0 && !collapsed"
          ref="favListEl"
          class="px-2 pt-4 max-md:hidden"
        >
          <div class="px-2 pb-1.5">
            <button
              type="button"
              class="flex items-center gap-1 text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] hover:text-ink-2 transition"
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
              @contextmenu="onFavoriteContextMenu(path, $event)"
            >
              <!-- Plain div (not a router-link): a real <a> has special
                 browser drag handling that fights the parent <li>'s HTML5
                 drag (reorder/remove never starts). Navigate on click
                 instead — mirrors the listing rows, which drag reliably. -->
              <div
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition cursor-pointer"
                role="link"
                tabindex="0"
                :title="path"
                @click="navigateFavorite(path)"
                @keydown.enter="navigateFavorite(path)"
              >
                <Icon
                  name="star"
                  :size="12"
                  :stroke-width="0"
                  fill="currentColor"
                  class="text-[var(--c-amber)] shrink-0"
                />
                <span class="truncate flex-1">{{ favoriteName(path) }}</span>
              </div>
            </li>
          </ul>
        </nav>

        <!-- Recent (v1.3 S3-1). MRU log of recently-previewed files.
           Capped at 5 visible; "View all" disclosure expands the rest
           (up to the 50-cap from the store). Click opens preview by
           routing to the file's URL. -->
        <nav
          v-if="isLoggedIn && recents.length > 0 && !collapsed"
          class="px-2 pt-4 max-md:hidden"
        >
          <div class="px-2 pb-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              class="flex items-center gap-1 text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] hover:text-ink-2 transition"
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
          </div>
          <ul
            v-show="!isSectionCollapsed('recent')"
            class="list-none m-0 p-0 space-y-0.5"
          >
            <li
              v-for="(r, ri) in visibleRecents"
              :key="r.path"
              @contextmenu="onRecentContextMenu(r, $event)"
            >
              <router-link
                :to="`/files${r.path}`"
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-hover text-ink-2 transition"
                :title="r.path"
                @click="onRecentClick(`/files${r.path}`, $event)"
              >
                <Icon
                  name="file"
                  :size="12"
                  class="text-[var(--color-ink-3)] shrink-0"
                />
                <span class="truncate flex-1">{{ recentLabel(r.name) }}</span>
              </router-link>
            </li>
          </ul>
        </nav>
      </div>
      <!-- /sidebar-scroll -->
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

    <!-- Logged-OUT spacer only. Logged-in uses the scrollable Favorites/Recents
         region above as its flex-1, so a second flex-1 sibling here would split
         the height 50/50 and unstick the bottom rows. (Storage + the user row
         are logged-in only, so logged-out just needs the login links pinned to
         the top.) -->
    <div v-if="!isLoggedIn" class="flex-1"></div>

    <!-- Storage card (hidden in icon-rail) -->
    <div
      v-if="isLoggedIn && isFiles && !disableUsedPercentage"
      class="px-3 pb-3 max-md:hidden s-hide"
    >
      <div class="sidebar-storage p-3 rounded-lg border border-line bg-surface">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-1.5">
            <Icon
              name="hard-drive"
              :size="14"
              class="text-[var(--color-ink-2)]"
            />
            <span class="text-[12px] font-semibold text-ink-1">Storage</span>
          </div>
          <span class="text-[11px] text-ink-3 tabular"
            >{{ usage.usedPercentage }}%</span
          >
        </div>
        <div class="h-1.5 rounded-full bg-elevated overflow-hidden">
          <div
            class="h-full rounded-full storage-fill transition-all"
            :style="{ width: usage.usedPercentage + '%' }"
          ></div>
        </div>
        <div class="mt-2 text-[11px] text-ink-3 tabular flex justify-between">
          <span>{{ usage.used }} used</span>
          <span>{{ usage.total }}</span>
        </div>
      </div>
    </div>

    <!-- User row (inset divider — a full-bleed line read as leftover chrome
         on the chromeless rail; collapsed/mobile rails stay divider-less) -->
    <div
      v-if="isLoggedIn"
      class="mx-4 border-t border-line max-md:hidden s-hide"
    ></div>
    <div
      v-if="isLoggedIn"
      class="px-3 pb-3 pt-2 flex items-center gap-1.5 max-md:px-0 max-md:flex-col max-md:gap-1 s-rail-row"
    >
      <button
        @click="toAccountSettings"
        class="flex-1 flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-hover transition min-w-0 max-md:flex-none max-md:p-0 s-rail-btn"
        :title="user.username"
      >
        <div
          class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-full avatar-accent flex items-center justify-center text-white text-[11px] font-semibold shadow-sm shrink-0"
        >
          {{ userInitials }}
        </div>
        <div class="flex-1 min-w-0 text-left max-md:hidden s-hide">
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
        class="w-7 h-7 max-md:w-9 max-md:h-9 rounded-md flex items-center justify-center transition sidebar-logout s-rail-btn"
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

    <!-- Shared right-click menu for Favorites + Recent rows. Teleports to
         <body> (inside ContextMenu) so it's never clipped by the sidebar. -->
    <context-menu
      :show="sidebarMenuShow"
      :pos="sidebarMenuPos"
      :items="sidebarMenuItems"
      @hide="hideSidebarMenu"
    />
  </aside>
</template>

<script>
import { reactive, ref, computed } from "vue";
import { useToast } from "vue-toastification";
import { mapActions, mapState } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import * as auth from "@/utils/auth";
import {
  version,
  repoUrl,
  signup,
  hideLoginButton,
  disableExternal,
  disableUsedPercentage,
  noAuth,
  logoutPage,
  loginPage,
} from "@/utils/constants";
import { useBrandLogo } from "@/composables/useBrandLogo";
import { files as api } from "@/api";
import Icon from "@/components/Icon.vue";
import BrandName from "@/components/BrandName.vue";
import UndoToast from "@/components/UndoToast.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import prettyBytes from "pretty-bytes";
import { usePreferences } from "@/composables/usePreferences";
import { displayName } from "@/utils/filename";
import { useRecents } from "@/composables/useRecents";
import { useFavorites } from "@/composables/useFavorites";
import { useFavoriteTitleDialog } from "@/composables/useFavoriteTitleDialog";
import { useRootLabel } from "@/composables/useRootLabel";
import { useDropTarget } from "@/composables/useDropTarget";
import { useActivePane } from "@/composables/useActivePane";

// How many recents to show before the "View all" disclosure kicks in.
// 5 keeps the section compact in the default sidebar layout.
const RECENTS_INITIAL = 5;

const USAGE_DEFAULT = { used: "0 B", total: "0 B", usedPercentage: 0 };

// Theme-correct brand mark (module singleton — safe outside setup()).
const { logoURL: brandLogoURL } = useBrandLogo();

export default {
  name: "sidebar",
  setup() {
    const usage = reactive(USAGE_DEFAULT);
    const prefs = usePreferences();

    // V2 #27: respect the "show file extensions" pref in the Recents list
    // (recents are files only). prefs.get is reactive, so this re-evaluates
    // when the toggle changes.
    const recentLabel = (filename) =>
      displayName(filename, false, prefs.get("nav.showExtensions", true));

    // v1.3 S3-1 / S3-2: Recents + Favorites composables threaded into
    // the Options API via setup() so the computed below can read
    // them. RECENTS_INITIAL is exposed too so the template can show
    // the "View all" disclosure conditionally.
    const recentsComposable = useRecents();
    const favoritesComposable = useFavorites();
    const favTitleDialog = useFavoriteTitleDialog();
    const rootLabelComposable = useRootLabel();
    // Folder navigation (Home / favorites / recents) targets the active pane:
    // pane B in place when split + B active, else a normal route push (pane A).
    // (useActivePane owns the router internally, so no local useRouter here.)
    const { navigate: navigateActivePane, targetsPaneB } = useActivePane();
    // Recents are <router-link>s (keep the href semantics for the pane-A case);
    // when pane B is the active target, intercept the click and divert to B.
    const onRecentClick = (path, event) => {
      if (targetsPaneB()) {
        event.preventDefault();
        navigateActivePane(path);
      }
    };
    const toast = useToast();

    // ── Right-click context menus for the sidebar lists ───────────────
    // Favorites + Recent rows had no context menu. Wire a shared
    // ContextMenu (teleported to body, so it isn't clipped by the
    // sidebar's overflow) with per-list item sets.
    const sidebarMenuShow = ref(false);
    const sidebarMenuPos = ref({ x: 0, y: 0 });
    const sidebarMenuItems = ref([]);
    const hideSidebarMenu = () => {
      sidebarMenuShow.value = false;
    };
    const openSidebarMenu = (event, items) => {
      event.preventDefault();
      event.stopPropagation();
      sidebarMenuItems.value = items;
      sidebarMenuPos.value = { x: event.clientX, y: event.clientY };
      sidebarMenuShow.value = true;
    };
    const copyToClipboard = async (text) => {
      // Modern path first; on failure (insecure HTTP context / denied
      // permission) fall back to a hidden-textarea execCommand copy so
      // LAN/HTTP homelab deployments still work. Confirm with a toast either
      // way — the OS clipboard is invisible, so the user needs feedback.
      try {
        await navigator.clipboard.writeText(text);
        toast.success(`Path copied: ${text}`);
        return;
      } catch {
        /* fall through to the legacy path */
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success(`Path copied: ${text}`);
      } catch {
        /* both methods failed — silently no-op */
      }
    };
    // Favorites: Open · display title · remove. The title editor opens the
    // global FavoriteTitleDialog (mounted in App.vue).
    const onFavoriteContextMenu = (path, event) => {
      openSidebarMenu(event, [
        {
          label: "Open",
          icon: "external-link",
          action: () => {
            hideSidebarMenu();
            navigateActivePane(path);
          },
        },
        {
          label: "Favorites display title…",
          icon: "star",
          action: () => {
            hideSidebarMenu();
            favTitleDialog.open(path);
          },
        },
        { type: "separator" },
        {
          label: "Remove from Favorites",
          icon: "star-off",
          destructive: true,
          action: () => {
            hideSidebarMenu();
            favoritesComposable.remove(path);
          },
        },
      ]);
    };
    // "My files" quick-link: rename its label (a preferences alias — the real
    // storage root is untouched). The rename dialog itself can clear the alias
    // back to the default by submitting an empty value.
    const onMyFilesContextMenu = (event) => {
      openSidebarMenu(event, [
        {
          label: "Rename…",
          icon: "pencil",
          action: () => {
            hideSidebarMenu();
            rootLabelComposable.openDialog();
          },
        },
      ]);
    };
    // Recent: Open · copy path · remove from the recents log.
    const onRecentContextMenu = (recent, event) => {
      openSidebarMenu(event, [
        {
          label: "Open",
          icon: "external-link",
          action: () => {
            hideSidebarMenu();
            navigateActivePane(`/files${recent.path}`);
          },
        },
        {
          label: "Copy path",
          icon: "link",
          action: () => {
            hideSidebarMenu();
            void copyToClipboard(recent.path);
          },
        },
        { type: "separator" },
        {
          label: "Remove from Recent",
          icon: "x",
          destructive: true,
          action: () => {
            hideSidebarMenu();
            recentsComposable.remove(recent.path);
          },
        },
      ]);
    };
    // ── Favorites drag (RC-25/26 + RC-32/33/34) ───────────────────────
    // The file-into-favorite drop (RC-26) reuses the shared useDropTarget so
    // move/conflict handling matches the rest of the app. The reorder (RC-32)
    // and remove-on-drag-out (RC-34) gestures are handled here. RC-33: a
    // favorite drag never carries file payload, so it can't move/copy the
    // underlying folder — favorites act purely as links + reorder/remove.
    const { performDrop } = useDropTarget();
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

    /** Sidebar label for a favorited folder: the user's custom display title
     *  when set, otherwise the folder's URL-decoded basename. The title is a
     *  presentation alias stored in prefs — set via the row right-click menu
     *  or the section ⋯ menu, never touching the real folder. */
    const favoriteName = (path) => favoritesComposable.displayName(path);

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

    // Navigate to a favorited folder on click (the row is a plain div, not a
    // router-link — see the template comment for why).
    const navigateFavorite = (path) => {
      navigateActivePane(path);
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

    // ── Whole-sidebar collapse (icon rail) ──────────────────────────────
    // User-toggled, persisted in prefs. When on, the sidebar shrinks to a
    // narrow icon rail at ANY width (the max-md: responsive rail only kicks in
    // on narrow viewports). prefs.get is reactive, so this computed re-evaluates
    // when the toggle flips. Favorites collapse to star icons; Recents are
    // hidden entirely (per the spec — the rail stays compact).
    const collapsed = computed(() => !!prefs.get("sidebarCollapsed", false));
    const toggleCollapsed = () => {
      void prefs.set("sidebarCollapsed", !collapsed.value);
    };

    return {
      usage,
      usageAbortController: new AbortController(),
      prefs,
      recentLabel,
      recentsComposable,
      favoritesComposable,
      RECENTS_INITIAL,
      performDrop,
      draggingFavIndex,
      favDropAfter,
      favDragOverIndex,
      favWillRemove,
      removeHintPos,
      favListEl,
      favoriteName,
      navigateFavorite,
      navigateActivePane,
      onRecentClick,
      onFavDragStart,
      onFavDragOver,
      onFavDragLeave,
      onFavDrop,
      onFavDragEnd,
      cleanupFavDrag,
      isSectionCollapsed,
      toggleSection,
      collapsed,
      toggleCollapsed,
      sidebarMenuShow,
      sidebarMenuPos,
      sidebarMenuItems,
      hideSidebarMenu,
      onFavoriteContextMenu,
      onRecentContextMenu,
      onMyFilesContextMenu,
      rootLabel: rootLabelComposable.rootLabel,
    };
  },
  components: {
    Icon,
    BrandName,
    ContextMenu,
  },
  computed: {
    ...mapState(useAuthStore, ["user", "isLoggedIn"]),
    ...mapState(useFileStore, ["isFiles", "reload"]),
    ...mapState(useLayoutStore, ["currentPromptName"]),
    // V2 #18: the "My files" row is the home anchor — keep it highlighted on
    // the file views AND while the user is in Settings (Settings is reached via
    // the account row, so nothing else in the nav would otherwise be lit).
    mainNavActive() {
      return this.isFiles || this.$route.path.startsWith("/settings");
    },
    trashNavActive() {
      return this.$route.path.startsWith("/trash");
    },
    signup: () => signup,
    hideLoginButton: () => hideLoginButton,
    version: () => version,
    repoUrl: () => repoUrl,
    logoURL: () => brandLogoURL.value,
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
     *  Always capped at RECENTS_INITIAL (5) — the sidebar shows only the
     *  5 most recent files (the store still keeps up to 50). */
    visibleRecents() {
      return this.recents.slice(0, RECENTS_INITIAL);
    },
  },
  methods: {
    ...mapActions(useLayoutStore, ["closeHovers"]),
    // Calm Minimal: recent-file icons are a uniform muted ink (chrome), not the
    // old six-hue cycle.
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
        // Guard the division: some backends/mounts report total=0 (quota
        // unavailable, network filesystem), which made `used / total` NaN or
        // Infinity → the bar rendered "NaN%". Fall back to 0% and clamp.
        const used = Number(usage.used) || 0;
        const total = Number(usage.total) || 0;
        const pct = total > 0 ? Math.round((used / total) * 100) : 0;
        usageStats = {
          used: prettyBytes(used, { binary: true }),
          total: prettyBytes(total, { binary: true }),
          usedPercentage: Math.min(100, Math.max(0, pct)),
        };
      } finally {
        return Object.assign(this.usage, usageStats);
      }
    },
    toRoot() {
      // Home targets the active pane: pane B in place when split + B active,
      // else a route push to the files root (pane A).
      this.navigateActivePane("/files/");
      this.closeHovers();
    },
    toTrash() {
      this.$router.push({ path: "/trash" });
      this.closeHovers();
    },
    toAccountSettings() {
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
/* Sign-out button: rose-tinted so the destructive "leave" action stands out
   from the neutral nav chrome. Stronger rose + soft rose wash on hover. */
.sidebar-logout {
  color: var(--c-rose);
}
.sidebar-logout:hover {
  color: var(--c-rose);
  background: color-mix(in srgb, var(--c-rose) 14%, transparent);
}

/* New-file button: green-tinted so the secondary "create" action reads as
   colorful alongside the accent-gradient New folder button (rather than a
   flat neutral square). */
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
  outline: 1px dashed var(--color-accent, #6e72d9);
  outline-offset: -1px;
}

/* ── Manual collapse → icon rail (any width) ──────────────────────────
   Mirrors the max-md: responsive rail, but user-toggled (persisted in prefs)
   so it works at any viewport width. These descendant selectors outrank the
   single-class Tailwind utilities on the same elements, so the base classes
   don't need touching. Markers: `s-hide` (drop text/sections), `s-rail-head`
   (centre the logo row), `s-rail-row` (stack + centre a row of controls),
   `s-rail-btn` (square 40×40 icon button). */
.sidebar-collapsed .s-hide {
  display: none;
}
.sidebar-collapsed .s-rail-head {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}
.sidebar-collapsed .s-rail-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-left: 0;
  padding-right: 0;
}
/* Tiles sized smaller than the rail so the squircle reads as a compact icon
   button, not a big crowded block (the icons themselves are unchanged). */
.sidebar-collapsed .s-rail-btn {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  gap: 0;
  flex: 0 0 auto;
  justify-content: center;
}
/* Don't let `space-y-*` margins (carried from the expanded layout) stack on top
   of the row gap above — keeps the vertical rhythm even across all rail groups. */
.sidebar-collapsed .s-rail-row > * + * {
  margin-top: 0;
}
</style>
