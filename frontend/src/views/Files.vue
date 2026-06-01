<template>
  <!-- `relative` makes this content column the containing block for the
       preview shell (which is position:absolute), so the preview fills the
       area beside the sidebar instead of covering the whole viewport. -->
  <div class="relative flex-1 flex flex-col min-h-0 min-w-0">
    <header-bar v-if="error || fileStore.req?.type === undefined">
      <breadcrumbs base="/files" />
    </header-bar>

    <!-- S6-5: offer an in-place retry on transient listing failures. -->
    <errors v-if="error" :errorCode="error.status" @retry="fetchData" />
    <component v-else-if="currentView" :is="currentView"></component>
    <!-- Boot-time loading (no view component yet): use the same listing
         skeleton FileListing shows so the layout stays consistent. -->
    <ListingSkeleton v-else mode="list" :count="8" />
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
import { useRoute } from "vue-router";
import FileListing from "@/views/files/FileListing.vue";
import { StatusError } from "@/api/utils";
import { name } from "../utils/constants";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";

const Editor = defineAsyncComponent(() => import("@/views/files/Editor.vue"));
const Preview = defineAsyncComponent(() => import("@/views/files/Preview.vue"));

const layoutStore = useLayoutStore();
const fileStore = useFileStore();
const shortcutsOverlay = useShortcutsOverlay();

const { reload } = storeToRefs(fileStore);

const route = useRoute();

const { t } = useI18n({});

let fetchDataController = new AbortController();

const error = ref<StatusError | null>(null);

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
