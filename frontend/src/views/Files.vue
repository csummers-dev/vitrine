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
import { resolveListingSelection } from "@/utils/listingSelection";
import { brand } from "../utils/constants";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";
import { useFavorites } from "@/composables/useFavorites";
import { useRootLabel } from "@/composables/useRootLabel";

const Editor = defineAsyncComponent(() => import("@/views/files/Editor.vue"));
const Preview = defineAsyncComponent(() => import("@/views/files/Preview.vue"));

const layoutStore = useLayoutStore();
const fileStore = useFileStore();
const shortcutsOverlay = useShortcutsOverlay();

const { reload } = storeToRefs(fileStore);

const route = useRoute();
const router = useRouter();
const favorites = useFavorites();
const { rootLabel } = useRootLabel();

const { t } = useI18n({});

// Keep the browser-tab title in sync when the user renames their root label
// while sitting at the storage root. The title is otherwise only refreshed on
// navigation (fetchData); the sidebar / listing header already react on their
// own. A non-empty req.name means we're in a subfolder, where the folder name
// — not the root label — drives the title, so we leave it alone.
watch(rootLabel, () => {
  if (!fileStore.req?.name) {
    document.title = `${rootLabel.value || t("sidebar.myFiles")} - ${brand}`;
  }
});

// Audio tag editor (1.6.0). Driven by the shared prompt name so both the
// listing row context menu and the preview details rail can open it via
// showHover("audio-tags"); closeHovers() dismisses it.
const audioTagsOpen = computed(
  () => layoutStore.currentPromptName === "audio-tags"
);
const closeAudioTags = () => layoutStore.closeHovers();

let fetchDataController = new AbortController();
// Monotonic id for fetchData calls. Only the LATEST call may mutate the shared
// view state (req / loading / error) when it settles, so a superseded call
// (whose in-flight request we aborted) can't stomp the newer result — and,
// crucially, the loading spinner is always reconciled by whichever call is
// latest when it settles, even on cancellation. Without this, a canceled fetch
// returned early and left `loading` stuck true (endless skeleton) — e.g. a
// background move's reload racing a navigation fetch.
let fetchSeq = 0;

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

// A background refresh must never interrupt the user mid-action. We treat these
// as "busy": any open prompt / panel / inline-row edit (rename, new folder/file,
// move, copy, share, conflict, …, all surfaced via currentPromptName), the
// current-folder rename (fileStore.inlineEditing), and an active drag. While
// busy a requested refresh is remembered, not run; it fires the moment they're
// done — so a long transfer can keep refreshing without yanking focus out of a
// rename or closing a panel.
const userBusy = computed(
  () =>
    layoutStore.currentPromptName != null ||
    fileStore.inlineEditing ||
    fileStore.draggedItems.length > 0
);
const pendingReload = ref(false);

watch(route, () => {
  // An explicit navigation supersedes any deferred background refresh.
  pendingReload.value = false;
  fetchData();
});

watch(reload, (newValue) => {
  if (!newValue) return;
  if (userBusy.value) {
    // Defer: remember the intent but drop the flag, so the next true edge still
    // fires this watcher (and so the flag doesn't linger as permanently true).
    pendingReload.value = true;
    fileStore.reload = false;
    return;
  }
  // Refresh the current folder in place (no loading skeleton), so background
  // refreshes — transfer source/destination updates, uploads, tag edits — don't
  // flash the listing.
  void fetchData({ silent: true });
});

watch(userBusy, (busy) => {
  if (!busy && pendingReload.value) {
    pendingReload.value = false;
    void fetchData({ silent: true });
  }
});

// Define functions

const applyPreSelection = (priorSelection: string[] = []) => {
  // Drain the queue immediately so a re-entrant fetch doesn't double-apply.
  const preselect = fileStore.preselect;
  fileStore.preselect = [];

  const req = fileStore.req;
  if (!req) return;

  // resolveListingSelection owns the branch order (preselect → same-folder
  // restore → navigate-up); see its docs. Decoded paths throughout, so direct
  // equality against item.path is correct.
  const indices = resolveListingSelection({
    oldPath: fileStore.oldReq?.path ?? null,
    newPath: req.path,
    isDir: !!req.isDir,
    items: req.items ?? [],
    preselect,
    priorSelection,
  });
  for (const idx of indices) fileStore.selected.push(idx);
};

const fetchData = async (opts: { silent?: boolean } = {}) => {
  // A SILENT reload revalidates the SAME folder in place: keep the current rows
  // on screen and skip the loading skeleton, so a background refresh (the
  // transfer source-folder refresh, an upload finishing, a tag edit, …) doesn't
  // blank the listing and flash on every tick. The fresh data is swapped in when
  // it arrives — changed rows just animate in/out via the list transition.
  // Navigation and explicit (re)loads stay non-silent and show the skeleton.
  const silent = opts.silent === true;
  const seq = ++fetchSeq;

  // Snapshot the selected items' paths BEFORE clearing, so a refresh that lands
  // back in the same folder can restore the selection (see applyPreSelection).
  // Decoded paths survive the reload even though the row indices won't.
  const priorSelection =
    fileStore.selected.length > 0
      ? fileStore.selected
          .map((i) => fileStore.req?.items[i]?.path)
          .filter((p): p is string => p !== undefined)
      : [];

  // Reset view information.
  fileStore.reload = false;
  error.value = null;
  brokenFavorite.value = null;
  if (!silent) {
    // Navigation / explicit load: clear the view and show the skeleton. (A
    // silent reload defers the selection clear to the swap-in step below so the
    // current rows + selection stay put until the new data is ready.)
    fileStore.selected = [];
    fileStore.multiple = false;
    layoutStore.closeHovers();
    layoutStore.loading = true;
  }

  let url = route.path;
  if (url === "") url = "/";
  if (url[0] !== "/") url = "/" + url;
  // Cancel the ongoing request
  fetchDataController.abort();
  fetchDataController = new AbortController();
  try {
    const res = await api.fetch(url, fetchDataController.signal);
    // A newer fetchData superseded this one — it now owns the view.
    if (seq !== fetchSeq) return;
    // For a silent reload the old rows stayed up the whole time; clear the
    // (now stale-indexed) selection in the SAME synchronous step as swapping in
    // the new data + re-resolving it, so there's no intermediate frame with the
    // selection blanked. Non-silent already cleared it up front.
    if (silent) {
      fileStore.selected = [];
      fileStore.multiple = false;
    }
    fileStore.updateRequest(res);
    // Title format: "<folder | root label | My files> - vitrine".
    // At the storage root the listing has no folder name, so fall back to the
    // user's custom root label (nav.rootLabel pref) and finally "My files" —
    // mirroring the sidebar quick-link and the listing header.
    document.title = `${res.name || rootLabel.value || t("sidebar.myFiles")} - ${brand}`;
    layoutStore.loading = false;

    // Restores selection (preselect queue, same-folder refresh, or the
    // previously visited child folder on up-navigation).
    applyPreSelection(priorSelection);
  } catch (err) {
    // Superseded by a newer fetchData: that call now owns `loading` / `req` /
    // `error`, so this stale (usually aborted) call must stay out of its way —
    // clearing the spinner here would yank it from under the live fetch.
    if (seq !== fetchSeq) return;
    // We're the latest fetch. Unlike before, we do NOT early-return on a bare
    // cancellation: if the latest request is aborted with no successor (a
    // teardown, or a reload that raced another fetch), nothing else would ever
    // clear the spinner and the skeleton would spin until a full reload. So we
    // fall through and always reset `loading`. A genuine error still surfaces
    // the error card; a plain cancel just stops the spinner.
    if (!(err instanceof StatusError && err.is_canceled)) {
      if (err instanceof Error) {
        error.value = err;
      }
      // A 404 (deleted/renamed) or 403 (now inaccessible) on a path that's
      // still pinned → flag it so the error card offers to clear the dead
      // favorite.
      if (
        err instanceof StatusError &&
        (err.status === 404 || err.status === 403)
      ) {
        brokenFavorite.value = findBrokenFavorite();
      }
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
