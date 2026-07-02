<template>
  <!-- Dual-pane "compare" pane (pane B). List-only; reuses ListingItem rows via
       the global listing CSS (matched by `.fb-listing`). Activating it (click /
       focus) makes it the target of global actions in later stages. -->
  <section
    class="compare-pane"
    :class="{ 'compare-pane--active': panes.activePane === 'b' }"
    aria-label="Second folder pane"
    @pointerdown.capture="panes.setActive('b')"
    @focusin="panes.setActive('b')"
  >
    <!-- Compact header: actions only. The breadcrumb path has moved to the
         per-pane bar at the bottom (`.compare-foot`); a flexible spacer keeps
         the action cluster right-aligned. Chrome is shared with pane A's
         split-only header via the global `.compare-head*` / `.compare-btn`
         classes in listing.css. -->
    <header
      class="compare-head"
      :class="{ 'compare-head--drop': headDropActive }"
      @dragenter="onHeadDragEnter"
      @dragover="onHeadDragOver"
      @dragleave="onHeadDragLeave"
      @drop="onHeadDrop"
    >
      <div class="compare-head__info" :title="folderName">
        <Icon
          name="folder"
          :size="15"
          class="compare-head__icon text-[var(--color-ink-2)]"
        />
        <span class="compare-head__name headline-gradient">{{
          folderName
        }}</span>
        <span v-if="itemCount > 0" class="compare-head__count">
          {{ itemCount }} {{ itemCount === 1 ? "item" : "items" }}
        </span>
      </div>

      <div class="compare-head__actions">
        <button
          type="button"
          class="compare-head__parent"
          :disabled="atRoot"
          title="Parent folder"
          aria-label="Parent folder"
          @click="goUp"
        >
          <Icon name="arrow-up" :size="15" :stroke-width="2.2" />
        </button>
        <button
          type="button"
          class="compare-btn compare-btn--icon"
          :title="`Sort: ${sortLabel} · ${sortAsc ? 'Ascending' : 'Descending'}`"
          :aria-label="`Sort: ${sortLabel}, ${sortAsc ? 'Ascending' : 'Descending'}`"
          @click.stop="openSortMenu"
        >
          <Icon
            name="arrow-up-down"
            :size="14"
            class="text-[var(--color-ink-2)]"
          />
        </button>
        <span class="compare-head__sep" aria-hidden="true"></span>
        <button
          v-if="canCreate"
          type="button"
          class="compare-btn"
          title="New folder"
          aria-label="New folder"
          @click="startPaneNew('newDir')"
        >
          <Icon
            name="folder-plus"
            :size="14"
            class="text-[var(--color-ink-2)]"
          />
        </button>
        <button
          v-if="canUpload"
          type="button"
          class="compare-btn"
          title="Upload to this pane"
          aria-label="Upload to this pane"
          @click="triggerUpload"
        >
          <Icon name="upload" :size="14" class="text-[var(--color-ink-2)]" />
        </button>
        <button
          type="button"
          class="compare-btn"
          title="More actions"
          aria-label="More actions"
          @click.stop="openOverflow"
        >
          <Icon name="ellipsis" :size="15" />
        </button>
        <button
          type="button"
          class="compare-btn compare-btn--close"
          title="Close split view"
          aria-label="Close split view"
          @click="panes.closeSplit()"
        >
          <Icon name="x" :size="15" />
        </button>
      </div>
    </header>
    <input
      ref="uploadInputEl"
      type="file"
      multiple
      class="compare-upload-input"
      @change="onUploadInput"
    />

    <!-- Body. Also a drop zone: dragging a selection from the other pane and
         dropping here moves it into this pane's folder (even when empty). -->
    <div
      class="compare-body"
      :class="{ 'compare-body--drop': dragOver }"
      @click="onBodyClick"
      @dragenter="onBodyDragEnter"
      @dragover="onBodyDragOver"
      @dragleave="onBodyDragLeave"
      @drop="onBodyDrop"
      @contextmenu="onPaneContextMenu"
    >
      <ListingSkeleton
        v-if="panes.loading && !panes.req"
        mode="list"
        :count="8"
      />

      <div v-else-if="panes.error" class="compare-state compare-state--error">
        <Icon name="circle-alert" :size="22" :stroke-width="1.6" />
        <p>Couldn't open this folder.</p>
        <div class="compare-state__actions">
          <button
            type="button"
            class="compare-retry"
            @click="panes.navigateB(panes.secondaryPath)"
          >
            Retry
          </button>
          <button
            type="button"
            class="compare-retry"
            @click="navigateB('/files/', true)"
          >
            Go Home
          </button>
        </div>
      </div>

      <EmptyState
        v-else-if="listRows.length === 0 && !inlineNewKindB"
        icon="folder-open"
        title="Empty folder"
        message="This folder has no items."
      />

      <div v-else class="fb-listing list compare-listing">
        <!-- Column header (Name / Modified / Size) — reuses the global
             `.item.header` grid from listing.css (matched via `.fb-listing`),
             so the columns line up with the rows below. Sits above the scroller
             (sticky) rather than inside it, so it never scrolls away. -->
        <div class="item header compare-colhead">
          <div class="item__select">
            <div
              :class="[
                'item__checkbox',
                allSelectedB && 'item__checkbox--checked',
              ]"
              role="checkbox"
              :aria-checked="allSelectedB"
              tabindex="0"
              :title="allSelectedB ? 'Deselect all' : 'Select all'"
              @click.stop="toggleSelectAllB"
            >
              <Icon
                v-if="allSelectedB"
                name="check"
                :size="11"
                :stroke-width="3.5"
                style="color: white"
              />
            </div>
          </div>
          <p
            :class="{ active: sortBy === 'name' }"
            class="name"
            role="button"
            tabindex="0"
            title="Sort by name"
            aria-label="Sort by name"
            @click="setSort('name')"
          >
            <span>Name</span>
            <Icon :name="colIcon('name')" />
          </p>
          <p
            :class="{ active: sortBy === 'modified' }"
            class="modified"
            role="button"
            tabindex="0"
            title="Sort by modified date"
            aria-label="Sort by modified date"
            @click="setSort('modified')"
          >
            <span>Modified</span>
            <Icon :name="colIcon('modified')" />
          </p>
          <p
            :class="{ active: sortBy === 'size' }"
            class="size"
            role="button"
            tabindex="0"
            title="Sort by size"
            aria-label="Sort by size"
            @click="setSort('size')"
          >
            <span>Size</span>
            <Icon :name="colIcon('size')" />
          </p>
          <div class="header__actions"></div>
        </div>
        <!-- Inline new folder / file (#6): one-row input at the top of the list,
             scoped to pane B's folder. Mirrors pane A's placement (below the
             column header, above the rows). -->
        <div v-if="inlineNewKindB" @click.stop>
          <InlineNewItem :kind="inlineNewKindB" :target="paneNewTarget" />
        </div>
        <RecycleScroller
          ref="scrollerRef"
          class="compare-scroller"
          :items="listRows"
          :item-size="null"
          :min-item-size="40"
          key-field="id"
          :buffer="320"
          v-slot="{ item: row }"
        >
          <div v-if="row.divider" class="compare-divider"></div>
          <Item
            v-else-if="row.item"
            :index="row.item.index"
            :name="row.item.name"
            :isDir="row.item.isDir"
            :url="row.item.url"
            :modified="row.item.modified"
            :type="row.item.type"
            :size="row.item.size"
            :path="row.item.path"
            @dropAlongside="onItemDropAlongside"
            @rowPointerDown="noopRowPointer"
          />
        </RecycleScroller>
      </div>
    </div>

    <!-- Per-pane breadcrumb (Request #3): each split pane shows its OWN path at
         the bottom, mirroring pane A's bottom breadcrumb bar. Driven by pane B's
         `segments`/`navigateB` (the global <breadcrumbs> reads the route, i.e.
         pane A, so it can't be reused here). -->
    <nav class="compare-foot" aria-label="Pane B breadcrumb">
      <div ref="footCrumbsEl" class="compare-foot__crumbs">
        <button
          type="button"
          class="compare-crumb"
          :class="{ 'is-current': segments.length === 0 }"
          title="Home"
          aria-label="Home"
          @click="navigateB('/files/', true)"
        >
          <Icon name="house" :size="14" class="text-[var(--color-accent)]" />
        </button>
        <template v-for="(seg, i) in segments" :key="seg.url">
          <Icon name="chevron-right" :size="12" class="compare-crumb-sep" />
          <button
            type="button"
            class="compare-crumb"
            :class="{ 'is-current': i === segments.length - 1 }"
            :title="seg.name"
            @click="navigateB(seg.url, true)"
          >
            <span class="compare-crumb__label">{{ seg.name }}</span>
          </button>
        </template>
      </div>
    </nav>

    <!-- Selection pill (R3): bulk actions on pane B's current selection. Shows
         only for a MULTI selection (> 1) — matching pane A's pill, which is
         gated on `selectedCount >= 2`. A single selected row must not raise the
         pill: it floats over the body and would otherwise swallow the second
         click of a double-click, so a folder could never be opened. -->
    <div v-if="panes.selectedCount > 1" class="compare-pill" role="toolbar">
      <span class="compare-pill__count"
        >{{ panes.selectedCount }} selected</span
      >
      <button
        type="button"
        class="compare-pill__btn"
        :title="`Move to ${otherPaneLabel}`"
        :aria-label="`Move to ${otherPaneLabel}`"
        @click="void crossPaneTransfer(false)"
      >
        <Icon name="corner-up-left" :size="14" class="text-white/80" />
      </button>
      <button
        type="button"
        class="compare-pill__btn"
        :title="`Copy to ${otherPaneLabel}`"
        :aria-label="`Copy to ${otherPaneLabel}`"
        @click="void crossPaneTransfer(true)"
      >
        <Icon name="copy" :size="14" class="text-white/80" />
      </button>
      <button
        type="button"
        class="compare-pill__btn"
        title="Tag"
        aria-label="Tag"
        @click="tagSelection"
      >
        <Icon name="tag" :size="14" class="text-white/80" />
      </button>
      <button
        v-if="canDownload"
        type="button"
        class="compare-pill__btn"
        title="Download"
        aria-label="Download"
        @click="downloadSelection"
      >
        <Icon name="download" :size="14" class="text-white/80" />
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="compare-pill__btn compare-pill__btn--danger"
        title="Delete"
        aria-label="Delete"
        @click="paneActions.remove()"
      >
        <Icon name="trash" :size="14" class="text-white/80" />
      </button>
      <button
        type="button"
        class="compare-pill__btn"
        title="Clear selection"
        aria-label="Clear selection"
        @click="clearSelection"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>

    <context-menu
      :show="ctxShow"
      :pos="ctxPos"
      :items="ctxItems"
      @hide="ctxShow = false"
    />

    <!-- Sort field dropdown (matches pane A) — the toolbar sort button opens it
         to pick the field; the ↑/↓ button owns direction. -->
    <context-menu
      :show="sortMenuShow"
      :pos="sortMenuPos"
      :items="sortMenuItems"
      @hide="sortMenuShow = false"
    />

    <!-- Pane B parity dialogs (R2): name prompt drives new folder/file +
         rename; the shared confirm drives delete. Both are pane-B-scoped via
         usePaneActions(paneTarget). -->
    <PaneNamePrompt
      :open="paneActions.namePrompt.open"
      :title="paneActions.namePrompt.title"
      :message="paneActions.namePrompt.message"
      :icon="paneActions.namePrompt.icon"
      :initial-value="paneActions.namePrompt.initialValue"
      :placeholder="paneActions.namePrompt.placeholder"
      :confirm-label="paneActions.namePrompt.confirmLabel"
      :select-base-name="paneActions.namePrompt.selectBaseName"
      @confirm="paneActions.confirmNamePrompt"
      @cancel="paneActions.cancelNamePrompt"
    />
    <ConfirmDialog
      :open="paneActions.confirm.open"
      :title="paneActions.confirm.title"
      :message="paneActions.confirm.message"
      :confirm-label="paneActions.confirm.confirmLabel"
      cancel-label="Cancel"
      destructive
      @confirm="paneActions.confirmConfirm"
      @cancel="paneActions.cancelConfirm"
    />
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { useToast } from "vue-toastification";
import Icon from "@/components/Icon.vue";
import Item from "@/components/files/ListingItem.vue";
import InlineNewItem from "@/components/files/InlineNewItem.vue";
import EmptyState from "@/components/EmptyState.vue";
import ListingSkeleton from "@/components/files/ListingSkeleton.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PaneNamePrompt from "@/components/files/PaneNamePrompt.vue";
import { usePanesStore } from "@/stores/panes";
import { useFileStore } from "@/stores/file";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import {
  providePaneContext,
  type ListingState,
} from "@/composables/usePaneContext";
import { useTagsStore } from "@/stores/tags";
import { useDropTarget } from "@/composables/useDropTarget";
import { usePaneActions, type PaneTarget } from "@/composables/usePaneActions";
import { useBulkTagPicker } from "@/composables/useBulkTagPicker";
import { useFavorites } from "@/composables/useFavorites";
import { useFavoriteTitleDialog } from "@/composables/useFavoriteTitleDialog";
import { useListingNavigation } from "@/composables/useListingNavigation";
import { TypeaheadSession } from "@/utils/typeahead";
import { useQuickPeek } from "@/composables/useQuickPeek";
import { sortListing } from "@/utils/secondarySort";
import { copy as copyToClipboard } from "@/utils/clipboard";
import * as upload from "@/utils/upload";
import { files as api } from "@/api";
import { isExtractable } from "@/utils/archive";
import { unzipEnabled } from "@/utils/constants";
import urlUtil from "@/utils/url";

const panes = usePanesStore();
const fileStore = useFileStore();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const router = useRouter();
const toast = useToast();
const tagsStore = useTagsStore();
const bulkTagPicker = useBulkTagPicker();
const favorites = useFavorites();
const favTitleDialog = useFavoriteTitleDialog();
const { performDrop, transferSelectionInto } = useDropTarget();

// Parity file actions (new folder/file · rename · delete) scoped to pane B.
// Targets pane B's live folder + selection and refreshes it when a mutation
// settles. The dialogs it drives are hosted in this component's template.
const paneTarget: PaneTarget = {
  paneId: "b",
  folderUrl: () => panes.secondaryPath,
  selectedItems: () =>
    panes.selected
      .map((i) => panes.req?.items[i])
      .filter((it): it is ResourceItem => it != null),
  reload: () => panes.refreshB(),
};
const paneActions = usePaneActions(paneTarget);

// ── Navigation (in place; files defer to the route preview) ──────────
// The fetch lives on the store (`panes.navigateB`) so it can be driven from
// here, from the sidebar/search when pane B is active, and from the refresh
// path. This component just decides folder-vs-file and renders.
const navigateB = (url: string, isDir?: boolean) => {
  if (isDir === false) {
    void router.push({ path: url });
    return;
  }
  void panes.navigateB(url);
};

providePaneContext({
  paneId: "b",
  listing: panes as unknown as ListingState,
  navigate: navigateB,
});

onMounted(() => {
  void panes.navigateB(panes.secondaryPath || "/files/");
});

// Re-fetch when asked (e.g. a transfer touching this folder settled).
watch(
  () => panes.refreshNonce,
  () => void panes.navigateB(panes.secondaryPath)
);

// ── Breadcrumb + parent ──────────────────────────────────────────────
const segments = computed<{ name: string; url: string }[]>(() => {
  const stripped = (panes.secondaryPath || "/files/").replace(
    /^\/files\/?/,
    ""
  );
  if (stripped === "") return [];
  const parts = stripped.split("/").filter(Boolean);
  let acc = "/files/";
  return parts.map((name) => {
    acc += name + "/";
    return { name: decodeURIComponent(name), url: acc };
  });
});
const atRoot = computed(() => segments.value.length === 0);
const parentPathB = computed(() =>
  atRoot.value ? "" : urlUtil.removeLastDir(panes.secondaryPath) + "/"
);
const goUp = () => {
  if (atRoot.value) return;
  navigateB(parentPathB.value, true);
};

// ── Header parent spring-load (#18) ──────────────────────────────────
// Dragging a selection onto pane B's compact header navigates up a folder,
// mirroring pane A's section-title / split-header drop affordance. Hold over
// the header → after PARENT_SPRING_MS it spring-loads up; a drop moves the
// dragged items into the parent folder. No-op at the root (nowhere to go).
const PARENT_SPRING_MS = 2000;
const headDropActive = ref<boolean>(false);
let headDragDepth = 0;
let headSpringTimer: ReturnType<typeof setTimeout> | null = null;
const cancelHeadSpring = () => {
  if (headSpringTimer !== null) {
    clearTimeout(headSpringTimer);
    headSpringTimer = null;
  }
};
const onHeadDragEnter = (event: DragEvent) => {
  if (!isDragActive.value || atRoot.value) return;
  event.preventDefault();
  headDragDepth++;
  if (headDragDepth === 1) {
    headDropActive.value = true;
    headSpringTimer = setTimeout(() => {
      headSpringTimer = null;
      headDropActive.value = false;
      headDragDepth = 0;
      if (!atRoot.value) navigateB(parentPathB.value, true);
    }, PARENT_SPRING_MS);
  }
};
const onHeadDragOver = (event: DragEvent) => {
  if (!isDragActive.value || atRoot.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect =
      event.ctrlKey || event.metaKey ? "copy" : "move";
  }
};
const onHeadDragLeave = () => {
  if (atRoot.value) return;
  headDragDepth = Math.max(0, headDragDepth - 1);
  if (headDragDepth === 0) {
    headDropActive.value = false;
    cancelHeadSpring();
  }
};
const onHeadDrop = (event: DragEvent) => {
  cancelHeadSpring();
  headDragDepth = 0;
  headDropActive.value = false;
  if (!isDragActive.value || !parentPathB.value) return;
  void performDrop(event, parentPathB.value);
};
// Drag-cancel safety net (review #1): Esc-cancelling a drag fires `dragend` but
// NOT `dragleave`/`drop`, so a pending head spring-load timer would otherwise
// still navigate ~PARENT_SPRING_MS later. Wired to the document `dragend`.
const onPaneDragEnd = () => {
  headDragDepth = 0;
  headDropActive.value = false;
  cancelHeadSpring();
};

// ── Sort (independent of pane A; client-side via the shared util) ────
const SORT_FIELDS: SortKey[] = ["name", "size", "modified", "extension"];
const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  size: "Size",
  modified: "Modified",
  extension: "Type",
};
const sortBy = ref<SortKey>("name");
const sortAsc = ref<boolean>(true);
const sortLabel = computed(() => SORT_LABELS[sortBy.value]);

// Consolidated Sort DROPDOWN — matches pane A: one button opens a popover with
// both the field ("Sort by") and the direction ("Ascending/Descending"),
// replacing the former separate field + ↑/↓ button pair.
const sortMenuShow = ref<boolean>(false);
const sortMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const openSortMenu = (event: MouseEvent) => {
  if (sortMenuShow.value) {
    sortMenuShow.value = false;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  sortMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
  sortMenuShow.value = true;
};
const sortMenuItems = computed<MenuItem[]>(() => [
  { type: "header", label: "Sort by" },
  ...SORT_FIELDS.map((key) => ({
    label: SORT_LABELS[key],
    icon: sortBy.value === key ? "check" : undefined,
    action: () => {
      sortBy.value = key;
      sortMenuShow.value = false;
    },
  })),
  { type: "separator" },
  { type: "header", label: "Direction" },
  {
    label: "Ascending",
    icon: sortAsc.value ? "check" : undefined,
    action: () => {
      sortAsc.value = true;
      sortMenuShow.value = false;
    },
  },
  {
    label: "Descending",
    icon: !sortAsc.value ? "check" : undefined,
    action: () => {
      sortAsc.value = false;
      sortMenuShow.value = false;
    },
  },
]);

// Current-folder details for the compact header (Request: header should carry
// the same kind of info pane A's hero does — name + item count).
const folderName = computed(() => panes.req?.name || "Home");
const itemCount = computed(() => panes.req?.items?.length ?? 0);

// Bottom breadcrumb: when the path overflows the bar it scrolls horizontally
// (overflow-x). Default the scroll to the FAR RIGHT so the current folder (the
// most useful crumb) is visible; the user can scroll left to reveal ancestors.
const footCrumbsEl = ref<HTMLElement | null>(null);
const scrollCrumbsToEnd = () => {
  const el = footCrumbsEl.value;
  if (el) el.scrollLeft = el.scrollWidth;
};
watch(
  () => panes.secondaryPath,
  () => void nextTick(scrollCrumbsToEnd),
  { immediate: true }
);

// Column-header sort (Name / Modified / Size). Clicking the active column flips
// direction; clicking a new column switches to it (ascending). Mirrors pane A's
// header behaviour so the two panes feel identical.
const setSort = (field: SortKey) => {
  if (sortBy.value === field) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortBy.value = field;
    sortAsc.value = true;
  }
};
// Direction caret for a header column. The active column shows its real
// direction (asc → down, desc → up, matching pane A); inactive columns show a
// muted default. Icon is dimmed via the global `.item.header p:not(.active)` CSS.
const colIcon = (field: SortKey) => {
  if (sortBy.value === field) return sortAsc.value ? "arrow-down" : "arrow-up";
  return "arrow-down";
};

// Select-all checkbox in the column header (parity with pane A's header).
const allSelectedB = computed(() => {
  const n = panes.req?.items?.length ?? 0;
  return n > 0 && panes.selectedCount === n;
});
const toggleSelectAllB = () => {
  if (allSelectedB.value) {
    panes.selected = [];
    panes.multiple = false;
  } else if (panes.req?.items) {
    panes.selected = panes.req.items.map((i) => i.index);
    panes.multiple = true;
  }
};

// ── Rows: dirs (sorted) → divider → files (sorted) ───────────────────
interface Row {
  id: string;
  divider: boolean;
  item: ResourceItem | null;
  /** Variable row height for the scroller (item-size=null); only the divider
   *  sets it (slim slot), item rows fall back to min-item-size. */
  size?: number;
}
const listRows = computed<Row[]>(() => {
  const req = panes.req;
  if (!req?.items) return [];
  const dirs: ResourceItem[] = [];
  const files: ResourceItem[] = [];
  for (const it of req.items) (it.isDir ? dirs : files).push(it);
  const primary = { by: sortBy.value, asc: sortAsc.value };
  const sortedDirs = sortListing(dirs, primary, null);
  const sortedFiles = sortListing(files, primary, null);
  const rows: Row[] = [];
  for (const d of sortedDirs)
    rows.push({ id: "d:" + d.url, divider: false, item: d });
  if (sortedDirs.length > 0 && sortedFiles.length > 0)
    rows.push({ id: "__divider__", divider: true, item: null, size: 18 });
  for (const f of sortedFiles)
    rows.push({ id: "f:" + f.url, divider: false, item: f });
  return rows;
});

// ── Per-folder tag prefetch — mirrors FileListing ──
// One batched call per navigation; the merge-refresh in the tags store keeps it
// from clobbering pane A's chips. Folder sizes are fetched lazily per visible
// row (ListingItem) now, so this no longer prefetches every subfolder's
// recursive size up front (DP v2 R1).
watch(
  () => panes.req,
  (req) => {
    if (!req?.isDir || !Array.isArray(req.items)) return;
    void tagsStore.ensureLoaded();
    void tagsStore.loadForPaths(req.items.map((i) => i.url).filter(Boolean));
  },
  { immediate: true }
);

// Dropping onto a file row / the alongside area routes into pane B's folder.
const onItemDropAlongside = (event: DragEvent) => {
  void performDrop(event, panes.secondaryPath);
};
// Touch-drag is lifted per-listing; pane B opts out for now.
const noopRowPointer = () => {};

// ── Cross-pane drop into THIS pane's folder ──────────────────────────
// A drop on the body background — including an EMPTY folder, where there are no
// rows to drop onto — moves the dragged selection into pane B's current folder.
// Drops that land on a row are handled by the row itself (folder into-zone) or
// its `dropAlongside` emit, so we skip those here to avoid a double transfer.
const dropDepth = ref<number>(0);
const isDragActive = computed(() => fileStore.draggedItems.length > 0);
const dragOver = computed(() => dropDepth.value > 0 && isDragActive.value);
const onBodyDragEnter = (e: DragEvent) => {
  if (!isDragActive.value) return;
  e.preventDefault();
  dropDepth.value++;
};
const onBodyDragOver = (e: DragEvent) => {
  if (isDragActive.value) e.preventDefault();
};
const onBodyDragLeave = () => {
  if (dropDepth.value > 0) dropDepth.value--;
};
const onBodyDrop = (e: DragEvent) => {
  dropDepth.value = 0;
  // A row (folder into-zone, or a file row's dropAlongside) already handled it.
  if ((e.target as HTMLElement | null)?.closest(".item")) return;
  void performDrop(e, panes.secondaryPath);
};

// Empty-area click clears pane B's selection — mirrors pane A's `#listing`
// `data-clear-on-click` behaviour. Clicks that land on a row (the row itself or
// the column header, both `.item`) are left to the row's own handler.
const onBodyClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement | null)?.closest(".item")) return;
  if (panes.selectedCount === 0) return;
  panes.selected = [];
  panes.multiple = false;
  panes.activeIndex = -1;
  panes.anchorIndex = -1;
};

// ── Per-pane right-click context menu ────────────────────────────────
// Each ListingItem's own @contextmenu fires first (bubbling inside-out) and
// adopts the selection into pane B's listing, so by the time this runs
// `panes.selected` reflects the right-clicked row(s). We just open the menu.
const ctxShow = ref<boolean>(false);
const ctxPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const ctxOnRow = ref<boolean>(false);

const onPaneContextMenu = (event: MouseEvent) => {
  // macOS synthesizes contextmenu from ctrl+left-click — treat as a select
  // modifier, not a right-click (mirrors FileListing's handling).
  if (event.ctrlKey) {
    event.preventDefault();
    return;
  }
  const itemEl = (event.target as HTMLElement | null)?.closest?.(
    ".item"
  ) as HTMLElement | null;
  const onRow = itemEl != null && !itemEl.classList.contains("header");
  // A row right-click shows the full menu (the row already adopted the
  // selection). Empty space shows the background menu (New folder/file) when
  // the user can create; otherwise let the native menu through.
  if (!onRow && !canCreate.value) return;
  event.preventDefault();
  ctxOnRow.value = !!onRow;
  ctxPos.value = {
    x: event.clientX + 8,
    y: event.clientY + Math.floor(window.scrollY),
  };
  ctxShow.value = true;
};

// "The other pane" = pane A's current folder (left). A friendly name for the
// menu labels; falls back when pane A is at the root (no folder name).
const otherPaneLabel = computed(() => fileStore.req?.name || "the other pane");
/** Pane A's folder URL, normalised to a trailing slash (the transfer dest). */
const otherPaneUrl = computed(() =>
  fileStore.req?.url ? fileStore.req.url.replace(/\/?$/, "/") : ""
);

const copyPath = async (item: ResourceItem) => {
  const path = item.path || item.url;
  if (!path) return;
  try {
    await copyToClipboard({ text: path });
    toast.success(`Path copied: ${path}`);
  } catch {
    /* copy() already tried both clipboard APIs; nothing more to do */
  }
};

/** Move/copy pane B's current selection into pane A's folder. Reuses the same
 *  conflict-resolution + background-transfer pipeline as a cross-pane drag. */
const crossPaneTransfer = async (isCopy: boolean) => {
  const target = otherPaneUrl.value;
  if (!target) return;
  const sourceItems = panes.selected
    .map((i) => panes.req?.items[i])
    .filter((it): it is ResourceItem => it != null);
  await transferSelectionInto(sourceItems, target, isCopy);
};

/** Full move/copy destination picker (#8) — opens pane A's MoveCopyPanel scoped
 *  to pane B's selection + source folder via the prompt `override`, so the user
 *  can pick ANY destination (parity with pane A). The transfer runs through the
 *  same background path; TransferDock refreshes both panes on settle. */
const openMovePicker = (isCopy: boolean) => {
  const items = selectionItems().map((i) => ({
    url: i.url,
    name: i.name,
    isDir: i.isDir,
    size: i.size,
    modified: i.modified,
  }));
  if (items.length === 0) return;
  layoutStore.showHover({
    prompt: isCopy ? "copy" : "move",
    props: {
      override: { items, sourceUrl: panes.secondaryPath.replace(/\/?$/, "/") },
    },
  });
};

// Inline new folder / file (#6): instead of pane B's old dialog, show the same
// `InlineNewItem` row pane A uses, scoped to pane B's folder via `target`. The
// kind ref drives a one-row input at the top of the list; clearing it dismisses.
const inlineNewKindB = ref<"newDir" | "newFile" | null>(null);
const startPaneNew = (kind: "newDir" | "newFile") => {
  inlineNewKindB.value = kind;
};
const paneNewTarget = computed(() => ({
  folderUrl: panes.secondaryPath.replace(/\/?$/, "/"),
  reload: () => panes.refreshB(),
  close: () => {
    inlineNewKindB.value = null;
  },
}));

const canCreate = computed(() => !!authStore.user?.perm.create);
const canRename = computed(() => !!authStore.user?.perm.rename);
const canDelete = computed(() => !!authStore.user?.perm.delete);
const canDownload = computed(() => !!authStore.user?.perm.download);
const canUpload = computed(() => !!authStore.user?.perm.create);
const canShare = computed(
  () => !!authStore.user?.perm.share && !!authStore.user?.perm.download
);

const run = (fn: () => void) => {
  ctxShow.value = false;
  fn();
};

const ctxItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];

  // ── Background (empty-space) menu: folder-level actions, mirroring pane A's
  // background menu (#8) — create + upload + refresh act on THIS pane's folder. ─
  if (!ctxOnRow.value) {
    if (canCreate.value) {
      items.push({
        label: "New folder",
        icon: "folder-plus",
        action: () => run(() => startPaneNew("newDir")),
      });
      items.push({
        label: "New file",
        icon: "file-plus",
        action: () => run(() => startPaneNew("newFile")),
      });
    }
    if (canUpload.value) {
      items.push({
        label: "Upload",
        icon: "upload",
        action: () => run(triggerUpload),
      });
    }
    if (items.length > 0) items.push({ type: "separator" });
    items.push({
      label: "Refresh",
      icon: "rotate-ccw",
      kbd: "/",
      action: () => run(() => panes.refreshB()),
    });
    return items;
  }

  // ── Row menu: mirrors pane A's rowMenuItems order + option set so the two
  // panes feel identical. Single-item actions first (Open · Tag · Favorites
  // title · Share · Extract), then Rename + Move/Copy across + Copy path +
  // Download, then Delete, then create. Pane A's clipboard Cut/Copy/Paste, its
  // Move/Copy-to destination pickers, and the audio-tag editor are all
  // fileStore-bound (they'd act on the WRONG pane here), so they're omitted; the
  // cross-pane Move/Copy below is pane B's equivalent of the move/copy pickers.
  const sel = panes.selectedCount;
  if (sel === 0) return items;
  const single =
    sel === 1 ? (panes.req?.items[panes.selected[0]] ?? null) : null;

  if (single) {
    items.push({
      label: single.isDir ? "Open folder" : "Open",
      icon: "external-link",
      action: () => run(() => navigateB(single.url, single.isDir)),
    });
    items.push({
      label: "Tag…",
      icon: "tag",
      action: () => run(tagSelection),
    });
    if (single.isDir && favorites.isFavorited(single.url)) {
      const favUrl = single.url;
      items.push({
        label: "Favorites display title…",
        icon: "star",
        action: () => run(() => favTitleDialog.open(favUrl)),
      });
    }
    if (canShare.value) {
      items.push({
        label: "Share…",
        icon: "share",
        action: () => run(shareSelection),
      });
    }
    if (unzipEnabled && canCreate.value && isExtractable(single.name)) {
      items.push({
        label: "Extract…",
        icon: "package-open",
        action: () => run(extractSelection),
      });
    }
  }

  // ── Rename · Move/Copy across · Copy path · Download ────────────────
  items.push({ type: "separator" });
  if (canRename.value && single) {
    items.push({
      label: "Rename",
      icon: "pencil",
      // Inline rename (#6): pane B is the active pane when right-clicked, so the
      // global "rename" prompt drives THIS row's inline input (ListingItem gates
      // `isRenaming` on `activePane === paneId`) — same in-place edit as pane A,
      // not the old dialog. submitRename refreshes pane B (pane-aware).
      action: () => run(() => layoutStore.showHover("rename")),
    });
  }
  // Full destination picker — choose ANY folder (parity with pane A's
  // "Move/Copy … to…"). Opens MoveCopyPanel scoped to pane B via `override`.
  items.push({
    label:
      sel === 1
        ? single?.isDir
          ? "Move folder to…"
          : "Move file to…"
        : `Move ${sel} items to…`,
    icon: "forward",
    action: () => run(() => openMovePicker(false)),
  });
  items.push({
    label:
      sel === 1
        ? single?.isDir
          ? "Copy folder to…"
          : "Copy file to…"
        : `Copy ${sel} items to…`,
    icon: "copy-plus",
    action: () => run(() => openMovePicker(true)),
  });
  // (No "Move/Copy to the other pane" items here — the full destination picker
  // above covers any target, and cross-pane is still on the selection pill +
  // drag. Listing them felt redundant/odd in the menu.)
  if (single) {
    items.push({
      label: "Copy path",
      icon: "link",
      action: () => run(() => void copyPath(single)),
    });
  }
  if (canDownload.value) {
    items.push({
      label: sel === 1 ? "Download" : `Download ${sel} items`,
      icon: "download",
      action: () => run(downloadSelection),
    });
  }

  if (canDelete.value) {
    items.push({ type: "separator" });
    items.push({
      label: sel === 1 ? "Delete" : `Delete ${sel} items`,
      icon: "trash-2",
      destructive: true,
      action: () => run(() => paneActions.remove()),
    });
  }

  if (canCreate.value) {
    items.push({ type: "separator" });
    items.push({
      label: "New folder",
      icon: "folder-plus",
      action: () => run(() => startPaneNew("newDir")),
    });
    items.push({
      label: "New file",
      icon: "file-plus",
      action: () => run(() => startPaneNew("newFile")),
    });
  }
  return items;
});

// ── Toolbar: upload · tag · download · selection helpers (R3) ─────────
const selectionItems = () => paneTarget.selectedItems();
// The tag system is keyed by row URL throughout (FileListing's bulk-tag, the
// byPath cache, and forPath() all use `.url`), so tag targets must be urls —
// NOT the storage `.path`, or the picker would write a key the rows never read.
const selectionUrls = () =>
  selectionItems()
    .map((i) => i.url)
    .filter(Boolean);

const uploadInputEl = ref<HTMLInputElement | null>(null);
const triggerUpload = () => uploadInputEl.value?.click();

// Upload into pane B's folder. Mirrors FileListing's uploadInput but targets
// `panes.secondaryPath` and reuses the same conflict-resolution + handleFiles
// pipeline (the upload dock surfaces progress). Note: uploads run through the
// upload store, not the transfer dock, so pane B isn't auto-refreshed on
// completion yet — the user refreshes pane B to see new files (follow-up).
const onUploadInput = async (event: Event) => {
  const input = event.currentTarget as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  const folderUpload = !!files[0].webkitRelativePath;
  const list: UploadList = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    list.push({
      file: f,
      name: f.name,
      size: f.size,
      isDir: false,
      fullPath: folderUpload ? f.webkitRelativePath : undefined,
    });
  }
  input.value = ""; // allow re-picking the same file
  const path = panes.secondaryPath.replace(/\/?$/, "/");
  const conflict = await upload.checkConflict(list, path);
  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: { conflict, isUploadAction: true, to: path },
      confirm: (e: Event, result: Array<ConflictingResource>) => {
        e.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const it = result[i];
          if (it.checked.length === 2) continue;
          else if (it.checked.length === 1 && it.checked[0] === "origin")
            list[it.index].overwrite = true;
          else list.splice(it.index, 1);
        }
        if (list.length > 0) upload.handleFiles(list, path, true);
      },
    });
    return;
  }
  upload.handleFiles(list, path);
};

const tagSelection = () => {
  const urls = selectionUrls();
  if (urls.length) bulkTagPicker.open(urls);
};

// Share + Extract open pane A's existing SlideOvers, but pass pane B's item via
// `override` (props on the prompt) so they don't read pane A's selection.
const shareSelection = () => {
  const it = selectionItems()[0];
  if (!it) return;
  layoutStore.showHover({
    prompt: "share",
    props: { override: { url: it.url, name: it.name, path: it.path } },
  });
};
const extractSelection = () => {
  const it = selectionItems()[0];
  if (!it) return;
  layoutStore.showHover({
    prompt: "extract",
    props: {
      override: {
        url: it.url,
        name: it.name,
        size: it.size,
        base: panes.secondaryPath,
      },
    },
  });
};

const downloadSelection = () => {
  const items = selectionItems();
  if (items.length === 0) return;
  if (items.length === 1 && !items[0].isDir) api.download(null, items[0].url);
  else api.download("zip", ...items.map((i) => i.url));
};

const clearSelection = () => {
  panes.selected = [];
  panes.multiple = false;
};

// The ⋯ overflow reuses the same items as the right-click menu, anchored to
// the BUTTON (not the click point) so the menu always opens in the same spot
// just below it — matching pane A's header ⋯ menu. Row actions when there's a
// selection, else the create actions.
const openOverflow = (event: MouseEvent) => {
  ctxOnRow.value = panes.selectedCount > 0;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  ctxPos.value = {
    // Right-align the menu under the button (ContextMenu min-width ~200px; its
    // positioner clamps to the viewport so a right-edge overflow self-corrects).
    x: rect.right - 200,
    y: rect.bottom + 6 + Math.floor(window.scrollY),
  };
  ctxShow.value = true;
};

// ── Keyboard navigation (R4): drives pane B when it's the active pane ─────
// FileListing's global key handler bails while pane B is active, so the two
// never both act. Pane B is list-only, so columns = 1 and grid = false; the
// composable writes the selection/cursor onto the `panes` store (pane B).
const scrollerRef = ref<{ scrollToItem?: (i: number) => void } | null>(null);
const orderedItems = computed<ResourceItem[]>(() =>
  listRows.value.filter((r) => r.item).map((r) => r.item as ResourceItem)
);
const revealRow = (reqIndex: number) => {
  const pos = listRows.value.findIndex((r) => r.item?.index === reqIndex);
  if (pos >= 0) scrollerRef.value?.scrollToItem?.(pos);
};
const paneNav = useListingNavigation({
  ordered: () => orderedItems.value,
  columnsFor: () => 1,
  grid: () => false,
  reveal: revealRow,
  listing: panes as unknown as ListingState,
});
const openActive = () => {
  const idx = panes.activeIndex >= 0 ? panes.activeIndex : panes.selected[0];
  if (idx === undefined || idx < 0) return;
  const it = panes.req?.items[idx];
  if (it) navigateB(it.url, it.isDir);
};
const selectAllB = () => {
  if (!panes.req?.items) return;
  panes.selected = panes.req.items.map((i) => i.index);
  panes.multiple = true;
};

// Type-ahead: printable keys jump to the next matching name (own session so it
// doesn't share pane A's buffer). Mirrors FileListing's typeaheadPush.
const typeaheadB = new TypeaheadSession();
const typeaheadPushB = (ch: string) => {
  const matchIndex = typeaheadB.push(ch, orderedItems.value, panes.activeIndex);
  if (matchIndex < 0) return;
  panes.selected = [matchIndex];
  panes.activeIndex = matchIndex;
  panes.anchorIndex = matchIndex;
  revealRow(matchIndex);
};

// Quick Look: pane B's "single selected item" getter for the shared peek
// overlay (rendered once in FileListing; state lives in the singleton).
const quickPeek = useQuickPeek();
const singleSelectedItemB = (): ResourceItem | null =>
  panes.selected.length === 1
    ? (panes.req?.items[panes.selected[0]] ?? null)
    : null;

const onPaneKeydown = (event: KeyboardEvent) => {
  if (!panes.split || panes.activePane !== "b") return;
  if (layoutStore.currentPrompt !== null) return; // a global prompt owns the keys
  // Pane B's own dialogs (name prompt / delete confirm) don't route through the
  // layout store, so guard them explicitly — otherwise arrows / ⌘A / Delete
  // would drive the listing behind the open modal (the confirm dialog only
  // stops Esc/Enter, not the nav keys).
  if (paneActions.namePrompt.open || paneActions.confirm.open) return;
  const t = event.target as HTMLElement | null;
  const tag = t?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || t?.isContentEditable === true) {
    return;
  }

  if (event.key === "Escape") {
    panes.selected = [];
    panes.activeIndex = -1;
    panes.anchorIndex = -1;
    typeaheadB.reset();
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        paneNav.move("up", event.shiftKey);
        return;
      case "ArrowDown":
        event.preventDefault();
        paneNav.move("down", event.shiftKey);
        return;
      case "Home":
        event.preventDefault();
        paneNav.move("home", event.shiftKey);
        return;
      case "End":
        event.preventDefault();
        paneNav.move("end", event.shiftKey);
        return;
      case "Enter":
        event.preventDefault();
        openActive();
        return;
      case "/":
        // Mirrors pane A: "/" reloads THIS pane's folder. Sits before the
        // type-ahead default so it isn't swallowed as a search key.
        event.preventDefault();
        panes.refreshB();
        return;
      case "Delete":
        // Backspace is deliberately NOT bound (matches pane A) — too easy to hit
        // by accident for a destructive action.
        if (!canDelete.value || panes.selectedCount === 0) return;
        event.preventDefault();
        paneActions.remove(undefined, event.shiftKey);
        return;
      case " ": {
        // Quick Look, mirroring pane A: Space with a single selected item
        // toggles the peek overlay; a space mid-type-ahead still joins the
        // search prefix. The one <QuickPeek/> instance (in FileListing) shows
        // whichever pane's getter opened it.
        if (typeaheadB.isActive()) {
          event.preventDefault();
          typeaheadPushB(event.key);
          return;
        }
        const peekItem = singleSelectedItemB();
        if (!peekItem) return;
        event.preventDefault();
        quickPeek.toggle(singleSelectedItemB);
        return;
      }
    }
    // Type-ahead — printable single chars (and a space mid-session, e.g.
    // "My Doc"), matching FileListing's behaviour.
    if (
      event.key.length === 1 &&
      (/\S/.test(event.key) || (event.key === " " && typeaheadB.isActive()))
    ) {
      event.preventDefault();
      typeaheadPushB(event.key);
      return;
    }
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllB();
  }
};

onMounted(() => {
  window.addEventListener("keydown", onPaneKeydown);
  document.addEventListener("dragend", onPaneDragEnd);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onPaneKeydown);
  document.removeEventListener("dragend", onPaneDragEnd);
  // Review #2: clear any pending head spring-load timer if the pane unmounts
  // (e.g. split closed) so it can't fire a navigate on a torn-down pane.
  cancelHeadSpring();
});
</script>

<style scoped>
.compare-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  border-left: 1px solid var(--color-line, #ececec);
  position: relative;
}
/* Active-pane affordance: the ONLY indicator is the header (tint + accent
   underline) — no edge line on the pane itself. Edge accents on the inner
   side looked like a colored line "swapping" across the 1px divider; on the
   outer side they left the middle feeling empty. The centre divider
   (`.compare-pane` border-left) stays a plain static separator. */

/* The base `.compare-head` / `.compare-head__actions` / `.compare-head__sep` /
   `.compare-btn*` chrome is now defined GLOBALLY in listing.css so pane A's
   split-only header shares one source of truth. Only the pane-B-specific active
   tint stays scoped here (pane A uses `.fb-primary--active`). */
.compare-pane--active .compare-head {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.06));
  /* Accent underline so the active pane reads clearly from its header alone
     (the edge ring was removed). Inset shadow → no layout shift. */
  box-shadow: inset 0 -2px 0 0 var(--color-accent, #6e72d9);
}
/* Parent spring-load drop target (#18): dragging a selection onto pane B's
   header navigates up a folder. Matches pane A's `.compare-head--drop`. The
   accent ring wins over the active-pane underline while a drag hovers. */
.compare-head--drop,
.compare-pane--active .compare-head--drop {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
  box-shadow: inset 0 0 0 2px var(--color-accent, #6e72d9);
}

/* Per-pane breadcrumb at the bottom of pane B (Request #3). Mirrors pane A's
   `.fb-breadcrumb-bar` + bordered crumb pill so the two panes read identically. */
.compare-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 5px 16px 10px;
  min-width: 0;
}
.compare-foot__crumbs {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  min-width: 0;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.compare-foot__crumbs::-webkit-scrollbar {
  display: none;
}
.compare-foot__crumbs > * {
  flex-shrink: 0;
}
.compare-crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 200px;
  padding: 3px 7px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}
/* The text lives in this span so `text-overflow: ellipsis` truncates a single
   over-long name (an inline-flex button can't ellipsize its own text). The crumb
   itself is capped at `max-width: 200px` above, so long names ellipsize there. */
.compare-crumb__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* #3: the current crumb must NOT be the only shrinkable child — in this
   `overflow-x: auto` bar the non-shrinking siblings fill the row and would
   collapse a `flex-shrink: 1` current crumb to ZERO width (the reported "empty
   last entry"). Keep it `flex-shrink: 0` like the rest (inherited from
   `.compare-foot__crumbs > *`) so the bar scrolls and the crumb stays visible. */
.compare-crumb:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}
.compare-crumb.is-current {
  color: var(--color-ink-1, #18181b);
  font-weight: 600;
  cursor: default;
}
.compare-crumb-sep {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.compare-upload-input {
  display: none;
}

/* Selection pill — floats over pane B's body; bulk actions on its selection.
   Uses the inverse-surface token (like pane A's #multiple-selection pill) so it
   stays dark in BOTH themes — `var(--color-ink-1)` flipped to white in dark
   mode, which inverted the pill (the bug). Text/icons are white on the dark
   chrome in both themes to match. */
.compare-pill {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 6px 5px 12px;
  border-radius: 999px;
  background: var(--color-inverse-surface, #18181b);
  color: #fff;
  box-shadow:
    var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.15)),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 6;
  max-width: calc(100% - 24px);
}
.compare-pill__count {
  font-size: 12.5px;
  font-weight: 500;
  margin-right: 4px;
  white-space: nowrap;
  color: #fff;
}
.compare-pill__btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}
.compare-pill__btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.compare-pill__btn--danger:hover {
  background: rgba(176, 96, 96, 0.2);
  color: var(--status-danger);
}

.compare-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* Cross-pane drop affordance — a dashed accent frame while a drag hovers. */
.compare-body--drop {
  outline: 2px dashed var(--color-accent, #6e72d9);
  outline-offset: -4px;
  border-radius: 8px;
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.06));
}

/* The `.fb-listing.list` container picks up the global row layout from
   listing.css; here we just make it fill + host the virtual scroller. The 1rem
   bottom-pad removal (#16) lives in listing.css as
   `:is(#listing, .fb-listing).compare-listing` — it MUST match the ID-level
   specificity of the base padding rule, which a scoped class here can't. */
.compare-listing {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.compare-scroller {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  scrollbar-gutter: stable;
}
/* The recycler wraps each row in an absolutely-positioned item-view; drop the
   row's margin there so the fixed 44px item-size supplies the rhythm. */
.compare-listing :deep(.vue-recycle-scroller__item-view > .item) {
  margin: 0;
}

.compare-divider {
  height: 1px;
  margin: 5px 12px;
  background: var(--color-line, #ececec);
}

.compare-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
  text-align: center;
}
.compare-state--error {
  color: var(--c-rose);
}
.compare-state p {
  margin: 0;
}
.compare-state__actions {
  display: inline-flex;
  gap: 8px;
}
.compare-retry {
  margin-top: 2px;
  height: 30px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.compare-retry:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
</style>
