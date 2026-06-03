<template>
  <!-- `relative` makes this content column the containing block for the
       preview shell (which is position:absolute), so the preview fills the
       area beside the sidebar instead of covering the whole viewport. -->
  <div class="relative flex-1 flex flex-col min-h-0 min-w-0">
    <header-bar v-if="error || fileStore.req?.type === undefined">
      <breadcrumbs base="/files" />
    </header-bar>

    <!-- S6-5: offer an in-place retry on transient listing failures; a dead
         favorite gets a tailored "remove pin" card instead. -->
    <errors
      v-if="error"
      :errorCode="error.status"
      :brokenFavoriteName="brokenFavorite ? brokenFavoriteName : undefined"
      @retry="fetchData"
      @removeFavorite="removeBrokenFavorite"
    />
    <component v-else-if="currentView" :is="currentView"></component>
    <!-- Boot-time loading (no view component yet): use the same listing
         skeleton FileListing shows so the layout stays consistent. -->
    <ListingSkeleton v-else mode="list" :count="8" />

    <!-- Audio tag editor (1.6.0). Mounted in this parent so it's reachable
         from BOTH the listing and the preview view (each swaps into the
         router-view above). Opened via showHover("audio-tags"). -->
    <AudioTagEditor
      :open="audioTagsOpen"
      @cancel="closeAudioTags"
      @done="closeAudioTags"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { files as api } from "@/api";
import { storeToRefs } from "pinia";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import HeaderBar from "@/components/header/HeaderBar.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import Errors from "@/views/Errors.vue";
import ListingSkeleton from "@/components/files/ListingSkeleton.vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import FileListing from "@/views/files/FileListing.vue";
import AudioTagEditor from "@/components/files/AudioTagEditor.vue";
import { StatusError } from "@/api/utils";
import { name } from "../utils/constants";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";
import { useFavorites } from "@/composables/useFavorites";

const Editor = defineAsyncComponent(() => import("@/views/files/Editor.vue"));
const Preview = defineAsyncComponent(() => import("@/views/files/Preview.vue"));

const layoutStore = useLayoutStore();
const fileStore = useFileStore();
const shortcutsOverlay = useShortcutsOverlay();

const { reload } = storeToRefs(fileStore);

const route = useRoute();
const router = useRouter();
const favorites = useFavorites();

const { t } = useI18n({});

// Audio tag editor (1.6.0). Driven by the shared prompt name so both the
// listing row context menu and the preview details rail can open it via
// showHover("audio-tags"); closeHovers() dismisses it.
const audioTagsOpen = computed(
  () => layoutStore.currentPromptName === "audio-tags"
);
const closeAudioTags = () => layoutStore.closeHovers();

let fetchDataController = new AbortController();

const error = ref<StatusError | null>(null);

// When a listing fetch fails because a sidebar Favorite points at a folder
// that no longer exists (renamed externally / deleted), we surface a tailored
// "dead pin" card (Errors.vue) offering to remove it — instead of a bare 404.
const brokenFavorite = ref<string | null>(null);
const brokenFavoriteName = computed<string>(() =>
  brokenFavorite.value ? favorites.displayName(brokenFavorite.value) : ""
);

/** Normalize a `/files/...` path for comparison: URL-decode + drop a trailing
 *  slash. Favorites are stored encoded; route.path arrives decoded. */
const normPath = (p: string): string => {
  let s = p;
  try {
    s = decodeURIComponent(p);
  } catch {
    /* malformed escape — compare the raw string */
  }
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
};

const findBrokenFavorite = (): string | null => {
  const target = normPath(route.path);
  return favorites.favorites.value.find((f) => normPath(f) === target) ?? null;
};

const removeBrokenFavorite = () => {
  if (brokenFavorite.value) favorites.remove(brokenFavorite.value);
  brokenFavorite.value = null;
  void router.push("/files/");
};

const currentView = computed(() => {
  if (fileStore.req?.type === undefined) {
    return null;
  }

  if (fileStore.req.isDir) {
    return FileListing;
  }
  // CSV files use Preview's CsvViewer for table view, unless ?edit=true.
  if (fileStore.req.extension.toLowerCase() === ".csv") {
    if (route.query.edit === "true") return Editor;
    return Preview;
  }
  // Text / textImmutable: read = Preview (TextViewer in the new shell);
  // Editor still owns the write flow, reachable via ?edit=true.
  if (fileStore.req.type === "text" || fileStore.req.type === "textImmutable") {
    if (route.query.edit === "true") return Editor;
    return Preview;
  }
  return Preview;
});

// Define hooks
onMounted(() => {
  fetchData();
  fileStore.isFiles = true;
  window.addEventListener("keydown", keyEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyEvent);
});

onUnmounted(() => {
  fileStore.isFiles = false;
  if (layoutStore.showShell) {
    layoutStore.toggleShell();
  }
  fileStore.updateRequest(null);
  fetchDataController.abort();
});

watch(route, () => {
  fetchData();
});
watch(reload, (newValue) => {
  newValue && fetchData();
});

// Define functions

const applyPreSelection = () => {
  // Drain the queue immediately so a re-entrant fetch doesn't double-
  // apply. Snapshot first, then clear.
  const preselect = fileStore.preselect;
  fileStore.preselect = [];

  if (!fileStore.req?.isDir || fileStore.oldReq === null) return;

  if (preselect.length > 0) {
    // Re-select every queued path that exists in the new listing.
    // Preselect paths are decoded (per setPreselect's contract);
    // item.path is also decoded — direct equality is correct.
    // Missing paths are silently skipped (e.g., a moved-then-deleted
    // file should just drop out of the selection).
    for (const path of preselect) {
      const idx = fileStore.req.items.findIndex((item) => item.path === path);
      if (idx !== -1) fileStore.selected.push(idx);
    }
    return;
  }

  // Fallback: navigating UP a level (parent breadcrumb, browser back)
  // selects the child folder we just came from. Only fires when no
  // explicit preselect was queued.
  if (fileStore.oldReq.path.startsWith(fileStore.req.path)) {
    const name = fileStore.oldReq.path
      .substring(fileStore.req.path.length)
      .split("/")
      .shift();
    const index = fileStore.req.items.findIndex(
      (val) => val.path == fileStore.req!.path + name
    );
    if (index !== -1) fileStore.selected.push(index);
  }
};

const fetchData = async () => {
  // Reset view information.
  fileStore.reload = false;
  fileStore.selected = [];
  fileStore.multiple = false;
  layoutStore.closeHovers();

  // Set loading to true and reset the error.
  layoutStore.loading = true;
  error.value = null;
  brokenFavorite.value = null;

  let url = route.path;
  if (url === "") url = "/";
  if (url[0] !== "/") url = "/" + url;
  // Cancel the ongoing request
  fetchDataController.abort();
  fetchDataController = new AbortController();
  try {
    const res = await api.fetch(url, fetchDataController.signal);
    fileStore.updateRequest(res);
    document.title = `${res.name || t("sidebar.myFiles")} - ${t("files.files")} - ${name}`;
    layoutStore.loading = false;

    // Selects the post-reload target item or the previously visited child folder
    applyPreSelection();
  } catch (err) {
    if (err instanceof StatusError && err.is_canceled) {
      return;
    }
    if (err instanceof Error) {
      error.value = err;
    }
    // A 404 (deleted/renamed) or 403 (now inaccessible) on a path that's still
    // pinned → flag it so the error card offers to clear the dead favorite.
    if (
      err instanceof StatusError &&
      (err.status === 404 || err.status === 403)
    ) {
      brokenFavorite.value = findBrokenFavorite();
    }
    layoutStore.loading = false;
  }
};
const keyEvent = (event: KeyboardEvent) => {
  // F1 → keyboard cheat sheet. The same overlay is the primary `?`
  // target; keeping F1 too because it's the conventional "help" key in
  // desktop apps and costs nothing.
  if (event.key === "F1") {
    event.preventDefault();
    shortcutsOverlay.open();
  }
};
</script>
