<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <header-bar>
      <breadcrumbs base="/files" />
      <div class="flex-1"></div>
      <search />

      <template #actions>
        <!-- Vertical divider -->
        <div class="w-px h-5 bg-line mx-1"></div>

        <!-- View toggle segmented control -->
        <div
          class="h-7 p-0.5 rounded-md border border-line bg-surface flex items-center"
        >
          <button
            @click="setView('list')"
            :class="[
              'h-6 w-7 rounded flex items-center justify-center transition',
              viewMode === 'list'
                ? 'bg-elevated text-ink-1 shadow-sm'
                : 'text-ink-3 hover:text-ink-1',
            ]"
            title="List"
            aria-label="List view"
          >
            <Icon name="list" :size="14" />
          </button>
          <button
            @click="setView('mosaic')"
            :class="[
              'h-6 w-7 rounded flex items-center justify-center transition',
              viewMode === 'mosaic'
                ? 'bg-elevated text-ink-1 shadow-sm'
                : 'text-ink-3 hover:text-ink-1',
            ]"
            title="Grid"
            aria-label="Grid view"
          >
            <Icon name="layout-grid" :size="14" />
          </button>
          <button
            @click="setView('mosaic gallery')"
            :class="[
              'h-6 w-7 rounded flex items-center justify-center transition',
              viewMode === 'mosaic gallery'
                ? 'bg-elevated text-ink-1 shadow-sm'
                : 'text-ink-3 hover:text-ink-1',
            ]"
            title="Gallery"
            aria-label="Gallery view"
          >
            <Icon name="image" :size="14" />
          </button>
        </div>

        <!-- Sort cycle button. Click cycles through Name → Modified →
             Size (and back). No chevron — this is a cycle button, not a
             dropdown menu. Collapses to icon-only at < md. `min-w` is
             sized to fit the widest label ("Modified") so the button
             stays the same width regardless of the active sort. -->
        <button
          class="h-7 px-2 min-w-[110px] max-md:min-w-0 max-md:w-7 max-md:h-7 max-md:px-0 max-md:justify-center rounded-md border border-line bg-surface hover:bg-elevated inline-flex items-center justify-center gap-1.5 text-[13px] text-ink-2 transition"
          @click="cycleSort"
          :title="`Sort: ${sortLabel}`"
          :aria-label="`Sort: ${sortLabel}`"
        >
          <Icon name="arrow-down-narrow-wide" :size="14" />
          <span class="max-md:hidden">{{ sortLabel }}</span>
        </button>

        <!-- Upload (primary; collapses to icon-only at < md) -->
        <button
          v-if="headerButtons.upload"
          class="h-7 px-2.5 max-md:w-7 max-md:h-7 max-md:px-0 max-md:justify-center rounded-md bg-accent text-white text-[13px] font-medium flex items-center gap-1.5 hover:bg-accent-strong shadow-sm transition"
          @click="uploadFunc"
          :title="t('buttons.upload')"
          :aria-label="t('buttons.upload')"
        >
          <Icon name="upload" :size="14" />
          <span class="max-md:hidden">{{ t("buttons.upload") }}</span>
        </button>
      </template>
    </header-bar>

    <div class="flex-1 flex min-h-0 overflow-hidden">
      <section class="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div
          v-if="isMobile"
          id="file-selection"
          :class="{
            'file-selection-margin-bottom': fileStore.multiple,
          }"
        >
          <span v-if="fileStore.selectedCount > 0">
            {{ t("prompts.filesSelected", fileStore.selectedCount) }}
          </span>
          <action
            v-if="headerButtons.share"
            icon="share"
            :label="t('buttons.share')"
            show="share"
          />
          <action
            v-if="headerButtons.rename"
            icon="pencil"
            :label="t('buttons.rename')"
            show="rename"
          />
          <action
            v-if="headerButtons.copy"
            icon="copy"
            :label="t('buttons.copyFile')"
            show="copy"
          />
          <action
            v-if="headerButtons.move"
            icon="forward"
            :label="t('buttons.moveFile')"
            show="move"
          />
          <action
            v-if="headerButtons.delete"
            icon="trash-2"
            :label="t('buttons.delete')"
            show="delete"
          />
        </div>

        <!-- Section title (folder name + counts + folder-level actions).
             F2: also acts as a drop target + spring-load shortcut to the
             PARENT folder during a drag. Lit up with an accent ring when
             a drag is over it; drop = move to parent; hover for 2 s with
             a drag in progress = navigate up. Hidden when the user is
             already at the root of their scope. -->
        <div
          v-if="!layoutStore.loading && fileStore.req && fileStore.req.isDir"
          class="section-title px-5 pt-4 pb-3 flex items-end justify-between gap-3 max-md:px-4 max-md:pt-3 max-md:pb-2"
          :class="{ 'section-title--drop': sectionDropActive }"
          @dragenter="onSectionDragEnter"
          @dragover="onSectionDragOver"
          @dragleave="onSectionDragLeave"
          @drop="onSectionDrop"
        >
          <div class="min-w-0">
            <div
              class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-1"
            >
              Folder
            </div>
            <!-- Inline rename for the current folder: when the user picks
                 "Rename folder" from the ⋯ menu, swap the h1 for an input
                 that commits on Enter / blur and cancels on Esc. Same UX
                 as ListingItem's row rename so the affordance feels
                 consistent across the app. -->
            <input
              v-if="isRenamingCurrentFolder"
              ref="folderRenameInputEl"
              v-model.trim="folderRenameValue"
              class="folder-rename-input text-[22px] font-semibold text-ink-1 leading-tight truncate max-md:text-[18px]"
              type="text"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="submitFolderRename"
              @keydown.esc.prevent="cancelFolderRename"
              @blur="onFolderRenameBlur"
            />
            <h1
              v-else
              class="text-[22px] font-semibold text-ink-1 leading-tight truncate max-md:text-[18px]"
            >
              {{ folderTitle }}
            </h1>
            <div class="mt-1 text-[13px] text-ink-3 tabular max-md:text-[12px]">
              {{ folderMeta }}
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              v-if="headerButtons.share"
              class="h-7 px-2 max-md:w-7 max-md:px-0 max-md:justify-center rounded-md border border-line bg-surface hover:bg-elevated text-[13px] text-ink-2 flex items-center gap-1.5 transition"
              @click="layoutStore.showHover('share')"
              :title="t('buttons.share')"
              :aria-label="t('buttons.share')"
            >
              <Icon name="share" :size="14" />
              <span class="max-md:hidden">{{ t("buttons.share") }}</span>
            </button>
            <button
              v-if="headerButtons.download"
              class="h-7 px-2 max-md:w-7 max-md:px-0 max-md:justify-center rounded-md border border-line bg-surface hover:bg-elevated text-[13px] text-ink-2 flex items-center gap-1.5 transition"
              @click="download"
              :title="t('buttons.download')"
              :aria-label="t('buttons.download')"
            >
              <Icon name="download" :size="14" />
              <span class="max-md:hidden">{{ t("buttons.download") }}</span>
            </button>
            <button
              class="w-7 h-7 rounded-md border border-line bg-surface hover:bg-elevated text-ink-2 flex items-center justify-center transition"
              title="More"
              aria-label="More"
              @click.stop="showSectionMore"
            >
              <Icon name="ellipsis" :size="14" />
            </button>
          </div>
        </div>

        <!-- Section title "More" dropdown -->
        <context-menu
          :show="sectionMoreShow"
          :pos="sectionMorePos"
          @hide="hideSectionMore"
        >
          <action
            v-if="authStore.user?.perm.create"
            icon="folder-plus"
            :label="t('sidebar.newFolder')"
            show="newDir"
          />
          <action
            v-if="authStore.user?.perm.create"
            icon="file-plus"
            :label="t('sidebar.newFile')"
            show="newFile"
          />
          <!-- Rename the CURRENTLY VIEWED folder (not selected items).
               Hidden at the storage root since you can't rename "/". -->
          <action
            v-if="canRenameCurrentFolder"
            icon="pencil"
            label="Rename folder"
            @action="startFolderRename"
          />
          <action icon="rotate-ccw" label="Refresh" @action="refresh" />
          <action icon="info" :label="t('buttons.info')" show="info" />
        </context-menu>

        <!-- Loading: skeleton rows matching the current view mode. Mirrors
         the real ListingItem layout so the page doesn't reflow on load. -->
        <ListingSkeleton
          v-if="layoutStore.loading"
          :mode="viewMode === 'list' ? 'list' : 'mosaic'"
          :count="viewMode === 'list' ? 10 : 12"
        />
        <template v-else>
          <div
            v-if="
              (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0) ==
              0
            "
          >
            <EmptyState
              icon="folder-open"
              :title="
                folderTitle ? `${folderTitle} is empty` : t('files.lonely')
              "
              hint="Drop files here or use the Upload button to add content."
            >
              <button
                v-if="headerButtons.upload"
                type="button"
                class="empty-cta"
                @click="uploadFunc"
              >
                <Icon name="upload" :size="13" />
                <span>{{ t("buttons.upload") }}</span>
              </button>
            </EmptyState>
            <input
              style="display: none"
              type="file"
              id="upload-input"
              @change="uploadInput($event)"
              multiple
            />
            <input
              style="display: none"
              type="file"
              id="upload-folder-input"
              @change="uploadInput($event)"
              webkitdirectory
              multiple
            />
          </div>
          <div
            v-else
            id="listing"
            ref="listing"
            class="file-icons"
            data-clear-on-click="true"
            :class="authStore.user?.viewMode ?? ''"
            @click="handleEmptyAreaClick"
          >
            <div>
              <div class="item header">
                <div class="item__select">
                  <div
                    :class="[
                      'item__checkbox',
                      allSelected && 'item__checkbox--checked',
                    ]"
                    role="checkbox"
                    :aria-checked="allSelected"
                    tabindex="0"
                    @click.stop="toggleSelectAll"
                    :title="allSelected ? 'Deselect all' : 'Select all'"
                  >
                    <Icon
                      v-if="allSelected"
                      name="check"
                      :size="11"
                      :stroke-width="3.5"
                      style="color: white"
                    />
                  </div>
                </div>
                <p
                  :class="{ active: nameSorted }"
                  class="name"
                  role="button"
                  tabindex="0"
                  @click="sort('name')"
                  :title="t('files.sortByName')"
                  :aria-label="t('files.sortByName')"
                >
                  <span>{{ t("files.name") }}</span>
                  <Icon :name="nameIcon" />
                </p>
                <p
                  :class="{ active: modifiedSorted }"
                  class="modified"
                  role="button"
                  tabindex="0"
                  @click="sort('modified')"
                  :title="t('files.sortByLastModified')"
                  :aria-label="t('files.sortByLastModified')"
                >
                  <span>Modified</span>
                  <Icon :name="modifiedIcon" />
                </p>
                <p
                  :class="{ active: sizeSorted }"
                  class="size"
                  role="button"
                  tabindex="0"
                  @click="sort('size')"
                  :title="t('files.sortBySize')"
                  :aria-label="t('files.sortBySize')"
                >
                  <span>{{ t("files.size") }}</span>
                  <Icon :name="sizeIcon" />
                </p>
                <div class="header__actions"></div>
              </div>
            </div>

            <!-- Inline new folder / new file row (Stage 8). Replaces the legacy
             modal: appears at the top of the listing with a focused input. -->
            <div v-if="inlineNewKind" @click.stop>
              <InlineNewItem :kind="inlineNewKind" />
            </div>

            <TransitionGroup
              v-if="fileStore.req?.numDirs ?? false"
              tag="div"
              name="list"
              class="listing-section"
              data-clear-on-click="true"
              @contextmenu="showContextMenu"
            >
              <item
                v-for="item in dirs"
                :key="base64(item.name)"
                v-bind:index="item.index"
                v-bind:name="item.name"
                v-bind:isDir="item.isDir"
                v-bind:url="item.url"
                v-bind:modified="item.modified"
                v-bind:type="item.type"
                v-bind:size="item.size"
                v-bind:path="item.path"
              >
              </item>
            </TransitionGroup>

            <div
              v-if="
                (fileStore.req?.numDirs ?? 0) > 0 &&
                (fileStore.req?.numFiles ?? 0) > 0
              "
              class="folder-file-divider"
              data-clear-on-click="true"
            ></div>

            <TransitionGroup
              v-if="fileStore.req?.numFiles ?? false"
              tag="div"
              name="list"
              class="listing-section"
              data-clear-on-click="true"
              @contextmenu="showContextMenu"
            >
              <item
                v-for="item in files"
                :key="base64(item.name)"
                v-bind:index="item.index"
                v-bind:name="item.name"
                v-bind:isDir="item.isDir"
                v-bind:url="item.url"
                v-bind:modified="item.modified"
                v-bind:type="item.type"
                v-bind:size="item.size"
                v-bind:path="item.path"
              >
              </item>
            </TransitionGroup>
            <context-menu
              :show="isContextMenuVisible"
              :pos="contextMenuPos"
              @hide="hideContextMenu"
            >
              <!-- Extract appears at the top so a zip-on-zip workflow
               (open archive, extract elsewhere) doesn't require hunting
               through the menu. Gated on single .zip selection. -->
              <action
                v-if="headerButtons.extract"
                icon="package-open"
                :label="t('buttons.unzip')"
                show="extract"
              />
              <action
                v-if="headerButtons.share"
                icon="share"
                :label="t('buttons.share')"
                show="share"
              />
              <action
                v-if="headerButtons.rename"
                icon="pencil"
                :label="t('buttons.rename')"
                show="rename"
              />
              <action
                v-if="headerButtons.copy"
                id="copy-button"
                icon="copy"
                :label="t('buttons.copyFile')"
                show="copy"
              />
              <action
                v-if="headerButtons.move"
                id="move-button"
                icon="forward"
                :label="t('buttons.moveFile')"
                show="move"
              />
              <action
                v-if="headerButtons.delete"
                id="delete-button"
                icon="trash-2"
                :label="t('buttons.delete')"
                show="delete"
              />
              <action
                v-if="headerButtons.download"
                icon="download"
                :label="t('buttons.download')"
                @action="download"
                :counter="fileStore.selectedCount"
              />
              <action icon="info" :label="t('buttons.info')" show="info" />
            </context-menu>

            <input
              style="display: none"
              type="file"
              id="upload-input"
              @change="uploadInput($event)"
              multiple
            />
            <input
              style="display: none"
              type="file"
              id="upload-folder-input"
              @change="uploadInput($event)"
              webkitdirectory
              multiple
            />

            <div
              :class="{ active: showBulkPill }"
              id="multiple-selection"
              @click.stop
            >
              <span class="multiple-selection__count">
                {{ fileStore.selectedCount }} selected
              </span>

              <div class="multiple-selection__divider"></div>

              <button
                v-if="headerButtons.download"
                @click="download"
                :title="t('buttons.download')"
              >
                <Icon name="download" :size="14" />
                <span>{{ t("buttons.download") }}</span>
              </button>
              <button
                v-if="headerButtons.copy"
                @click="layoutStore.showHover('copy')"
                :title="t('buttons.copyFile')"
              >
                <Icon name="copy" :size="14" />
                <span>{{ t("buttons.copyFile") }}</span>
              </button>
              <button
                v-if="headerButtons.move"
                @click="layoutStore.showHover('move')"
                :title="t('buttons.moveFile')"
              >
                <Icon name="forward" :size="14" />
                <span>{{ t("buttons.moveFile") }}</span>
              </button>
              <button
                v-if="headerButtons.delete"
                @click="layoutStore.showHover('delete')"
                class="multiple-selection__danger"
                :title="t('buttons.delete')"
              >
                <Icon name="trash-2" :size="14" />
                <span>{{ t("buttons.delete") }}</span>
              </button>

              <div class="multiple-selection__divider"></div>

              <button
                @click="clearSelection"
                class="multiple-selection__close"
                :title="t('buttons.clear')"
                :aria-label="t('buttons.clear')"
              >
                <Icon name="x" :size="14" />
              </button>
            </div>
          </div>
        </template>
      </section>
      <InfoPane />
    </div>

    <!-- Delete confirmation (Stage 8). Teleported to body. -->
    <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      confirm-label="Delete"
      cancel-label="Cancel"
      destructive
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />

    <!-- Move / Copy slide-over (Stage 8). One component, two modes. -->
    <MoveCopyPanel
      :open="moveCopyOpen"
      :mode="moveCopyMode"
      @cancel="closeMoveCopy"
      @done="closeMoveCopy"
    />

    <!-- Share slide-over (Stage 8). -->
    <SharePanel :open="shareOpen" @cancel="closeShare" />

    <!-- Extract zip slide-over (PR #5746 Phase B). -->
    <ExtractPanel
      :open="extractOpen"
      @cancel="closeExtract"
      @done="closeExtract"
    />
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import { users, files as api } from "@/api";
import { enableExec, unzipEnabled } from "@/utils/constants";
import { filesize } from "@/utils";
import * as upload from "@/utils/upload";
import { throttle } from "lodash-es";
import { Base64 } from "js-base64";
import dayjs from "dayjs";

import HeaderBar from "@/components/header/HeaderBar.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import Action from "@/components/header/Action.vue";
import Search from "@/components/Search.vue";
import Item from "@/components/files/ListingItem.vue";
import InfoPane from "@/components/files/InfoPane.vue";
import InlineNewItem from "@/components/files/InlineNewItem.vue";
import ListingSkeleton from "@/components/files/ListingSkeleton.vue";
import EmptyState from "@/components/EmptyState.vue";
import UndoToast from "@/components/UndoToast.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import MoveCopyPanel from "@/components/files/MoveCopyPanel.vue";
import ExtractPanel from "@/components/files/ExtractPanel.vue";
import SharePanel from "@/components/files/SharePanel.vue";
import { useToast } from "vue-toastification";
import { usePendingDelete } from "@/composables/usePendingDelete";
import ContextMenu from "@/components/ContextMenu.vue";
import { useShortcuts } from "@/composables/useShortcuts";
import { useDropTarget } from "@/composables/useDropTarget";
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter, onBeforeRouteUpdate } from "vue-router";
import url from "@/utils/url";
import { useI18n } from "vue-i18n";
import { storeToRefs } from "pinia";
import { removePrefix } from "@/api/utils";

const showLimit = ref<number>(50);
const dragCounter = ref<number>(0);
const width = ref<number>(window.innerWidth);
const itemWeight = ref<number>(0);
const isContextMenuVisible = ref<boolean>(false);
const contextMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const $showError = inject<IToastError>("$showError")!;

const clipboardStore = useClipboardStore();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

const { req } = storeToRefs(fileStore);

// ── Stage 11g: view-scoped keyboard shortcuts ────────────────────────
// Registered through the global dispatcher so they show up in the
// `?` cheat sheet automatically. They unregister when this component
// unmounts (i.e. when the user leaves the file listing for a viewer or
// the settings page), which means they only fire where they make sense.
const { register: registerShortcut } = useShortcuts();
registerShortcut({
  id: "files:view-list",
  keys: "1",
  label: "List view",
  group: "view",
  handler: () => setView("list"),
});
registerShortcut({
  id: "files:view-grid",
  keys: "2",
  label: "Grid view",
  group: "view",
  handler: () => setView("mosaic"),
});
registerShortcut({
  id: "files:view-gallery",
  keys: "3",
  label: "Gallery view",
  group: "view",
  handler: () => setView("mosaic gallery"),
});
registerShortcut({
  id: "files:new-folder",
  keys: "n",
  label: "New folder",
  group: "files",
  handler: () => {
    if (authStore.user?.perm.create) layoutStore.showHover("newDir");
  },
});
registerShortcut({
  id: "files:upload",
  keys: "u",
  label: "Upload",
  group: "files",
  handler: () => {
    if (authStore.user?.perm.create) layoutStore.showHover("upload");
  },
});
registerShortcut({
  // Auto-appears in the `?` cheat-sheet via the registry. Handler reuses
  // the same `showHover("extract")` intercept the menus + palette use,
  // so any guard regressions only have to be fixed in one place.
  id: "files:extract",
  keys: "e",
  label: "Extract zip",
  group: "files",
  handler: () => {
    if (!unzipEnabled) return;
    if (!authStore.user?.perm.create) return;
    if (fileStore.selectedCount !== 1) return;
    const item = fileStore.req?.items[fileStore.selected[0]];
    if (!item || (item.extension ?? "").toLowerCase() !== ".zip") return;
    layoutStore.showHover("extract");
  },
});
// G3: `r` to refresh the current folder. Same action that the ⋯ menu's
// Refresh entry triggers — handy when an external process (rsync, an
// `arr` app) drops files in but the listing is stale. Dispatcher skips
// when typing in inputs, so `r` in the rename field is safe.
registerShortcut({
  id: "files:refresh",
  keys: "r",
  label: "Refresh folder",
  group: "files",
  handler: () => refresh(),
});

const route = useRoute();
onBeforeRouteUpdate(() => {
  hideContextMenu();
});

const { t } = useI18n();

const listing = ref<HTMLElement | null>(null);

const nameSorted = computed(() =>
  fileStore.req ? fileStore.req.sorting.by === "name" : false
);

const sizeSorted = computed(() =>
  fileStore.req ? fileStore.req.sorting.by === "size" : false
);

const modifiedSorted = computed(() =>
  fileStore.req ? fileStore.req.sorting.by === "modified" : false
);

const ascOrdered = computed(() =>
  fileStore.req ? fileStore.req.sorting.asc : false
);

const folderTitle = computed(() => {
  if (!fileStore.req) return "";
  return fileStore.req.name || t("sidebar.myFiles");
});

// ── Section title as parent-folder drop + spring-load target (F2) ──
// During a drag, the section-title area (the row that shows the
// current folder name + meta) acts as a shortcut to the PARENT folder:
//   • Drop on it           → move/copy the selection up one level
//   • Hover 2 s during drag → navigate up one level (no drop required)
// Both are gated by the existence of a parent — at the storage root
// we suppress the drop target entirely (no parent to navigate to).
const PARENT_SPRING_MS = 2000;
const sectionDropActive = ref<boolean>(false);
let sectionSpringTimer: number | null = null;
let sectionDragDepth = 0;

const { performDrop: performParentDrop } = useDropTarget();

/** Parent folder URL relative to the current route, or null at root. */
const parentFolderUrl = computed<string | null>(() => {
  if (!fileStore.req?.isDir) return null;
  const here = fileStore.req.url; // ends with "/"
  // Strip trailing slash, then drop the last segment.
  const trimmed = here.endsWith("/") ? here.slice(0, -1) : here;
  const parent = url.removeLastDir(trimmed) + "/";
  // If removing the last segment lands us back at the same place, we
  // were already at the root — nothing to navigate to.
  if (parent === here) return null;
  return parent;
});

const cancelSectionSpring = () => {
  if (sectionSpringTimer !== null) {
    window.clearTimeout(sectionSpringTimer);
    sectionSpringTimer = null;
  }
};

const onSectionDragEnter = (event: DragEvent) => {
  if (fileStore.selectedCount === 0) return;
  if (!parentFolderUrl.value) return;
  event.preventDefault();
  sectionDragDepth++;
  if (sectionDragDepth === 1) {
    sectionDropActive.value = true;
    // Spring-load: hover for PARENT_SPRING_MS → navigate up.
    sectionSpringTimer = window.setTimeout(() => {
      sectionSpringTimer = null;
      sectionDropActive.value = false;
      sectionDragDepth = 0;
      if (parentFolderUrl.value) router.push({ path: parentFolderUrl.value });
    }, PARENT_SPRING_MS);
  }
};

const onSectionDragOver = (event: DragEvent) => {
  if (fileStore.selectedCount === 0) return;
  if (!parentFolderUrl.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect =
      event.ctrlKey || event.metaKey ? "copy" : "move";
  }
};

const onSectionDragLeave = () => {
  if (!parentFolderUrl.value) return;
  sectionDragDepth = Math.max(0, sectionDragDepth - 1);
  if (sectionDragDepth === 0) {
    sectionDropActive.value = false;
    cancelSectionSpring();
  }
};

const onSectionDrop = (event: DragEvent) => {
  // Drop wins over spring-load: kill the timer before any conflict
  // prompts so we don't navigate mid-resolve.
  cancelSectionSpring();
  sectionDragDepth = 0;
  sectionDropActive.value = false;
  if (!parentFolderUrl.value) return;
  void performParentDrop(event, parentFolderUrl.value);
};

// ── Rename the currently-viewed folder ─────────────────────────────────
// Surfaced as a "Rename folder" action in the ⋯ menu (header section title
// More dropdown). UX matches the inline row rename in ListingItem: swap
// the h1 for an input, Enter commits, Esc/blur cancels. We can't rename
// at the storage root (no parent to move into), so the action hides via
// `canRenameCurrentFolder` when the folder has no usable parent.
const router = useRouter();
const isRenamingCurrentFolder = ref<boolean>(false);
const folderRenameValue = ref<string>("");
const folderRenameInputEl = ref<HTMLInputElement | null>(null);
let folderRenameSubmitting = false;

const canRenameCurrentFolder = computed<boolean>(() => {
  if (!authStore.user?.perm.rename) return false;
  const req = fileStore.req;
  if (!req || !req.isDir) return false;
  // Don't expose at the storage root — there's no parent to move into.
  // Root URL looks like "/files/" with no folder name.
  if (!req.name) return false;
  return true;
});

const startFolderRename = async () => {
  if (!canRenameCurrentFolder.value || !fileStore.req) return;
  folderRenameValue.value = fileStore.req.name;
  folderRenameSubmitting = false;
  isRenamingCurrentFolder.value = true;
  await nextTick();
  const el = folderRenameInputEl.value;
  if (!el) return;
  el.focus();
  el.select();
};

const cancelFolderRename = () => {
  if (folderRenameSubmitting) return;
  isRenamingCurrentFolder.value = false;
};

const onFolderRenameBlur = () => {
  if (folderRenameSubmitting) return;
  // Small delay so an Enter keydown can commit before the blur cancel
  // fires (input loses focus when the keydown fires too).
  setTimeout(() => {
    if (!folderRenameSubmitting && isRenamingCurrentFolder.value) {
      cancelFolderRename();
    }
  }, 120);
};

const submitFolderRename = async () => {
  if (folderRenameSubmitting || !fileStore.req) return;
  const next = folderRenameValue.value.trim();
  if (next === "" || next === fileStore.req.name) {
    cancelFolderRename();
    return;
  }
  folderRenameSubmitting = true;
  const oldUrl = fileStore.req.url;
  // Strip trailing slash before computing the parent (removeLastDir
  // would otherwise drop the folder name itself, not its parent).
  const trimmed = oldUrl.endsWith("/") ? oldUrl.slice(0, -1) : oldUrl;
  const newUrl = url.removeLastDir(trimmed) + "/" + encodeURIComponent(next);
  try {
    await api.move([{ from: oldUrl, to: newUrl }]);
    // The route URL still points at the old name — navigate to the new
    // path so the listing reloads against the renamed folder.
    router.push({ path: newUrl });
    isRenamingCurrentFolder.value = false;
  } catch (e) {
    if (e instanceof Error) $showError(e);
    folderRenameSubmitting = false;
  }
};

const folderMeta = computed(() => {
  const req = fileStore.req;
  if (!req) return "";
  const parts: string[] = [];
  const totalItems = (req.numDirs ?? 0) + (req.numFiles ?? 0);
  parts.push(`${totalItems} ${totalItems === 1 ? "item" : "items"}`);
  if (req.size) {
    parts.push(filesize(req.size));
  }
  if (req.modified) {
    parts.push(`last updated ${dayjs(req.modified).fromNow()}`);
  }
  return parts.join(" · ");
});

const dirs = computed(() => items.value.dirs.slice(0, showLimit.value));

const items = computed(() => {
  const dirs: any[] = [];
  const files: any[] = [];

  fileStore.req?.items.forEach((item) => {
    // Stage 8: items in the pending-delete window are visually removed from
    // the listing so the undo flow feels real-time. Their actual API
    // removal happens when the undo window expires.
    if (pendingDelete.isPending(item.url)) return;
    if (item.isDir) {
      dirs.push(item);
    } else {
      files.push(item);
    }
  });

  return { dirs, files };
});

const files = computed((): Resource[] => {
  let _showLimit = showLimit.value - items.value.dirs.length;

  if (_showLimit < 0) _showLimit = 0;

  return items.value.files.slice(0, _showLimit);
});

const nameIcon = computed(() => {
  if (nameSorted.value && !ascOrdered.value) {
    return "arrow-up";
  }

  return "arrow-down";
});

const sizeIcon = computed(() => {
  if (sizeSorted.value && ascOrdered.value) {
    return "arrow-down";
  }

  return "arrow-up";
});

const modifiedIcon = computed(() => {
  if (modifiedSorted.value && ascOrdered.value) {
    return "arrow-down";
  }

  return "arrow-up";
});

const headerButtons = computed(() => {
  return {
    upload: authStore.user?.perm.create,
    download: authStore.user?.perm.download,
    shell: authStore.user?.perm.execute && enableExec,
    delete: fileStore.selectedCount > 0 && authStore.user?.perm.delete,
    rename: fileStore.selectedCount === 1 && authStore.user?.perm.rename,
    share:
      fileStore.selectedCount === 1 &&
      authStore.user?.perm.share &&
      authStore.user?.perm.download,
    move: fileStore.selectedCount > 0 && authStore.user?.perm.rename,
    copy: fileStore.selectedCount > 0 && authStore.user?.perm.create,
    // Extract (PR #5746) — single `.zip` selected, user can create
    // (extraction writes new files), and operator hasn't disabled the
    // feature via `--unzipEnabled=false`.
    extract:
      unzipEnabled &&
      authStore.user?.perm.create &&
      fileStore.selectedCount === 1 &&
      fileStore.req != null &&
      fileStore.req.items.length > 0 &&
      (
        fileStore.req.items[fileStore.selected[0]]?.extension ?? ""
      ).toLowerCase() === ".zip",
  };
});

const isMobile = computed(() => {
  return width.value <= 736;
});

watch(req, () => {
  // Reset the show value
  showLimit.value = 50;

  nextTick(() => {
    // Ensures that the listing is displayed
    // How much every listing item affects the window height
    setItemWeight();

    // Scroll to the item opened previously
    if (!revealPreviousItem()) {
      // Fill and fit the window with listing items
      fillWindow(true);
    }
  });
});

onMounted(() => {
  // Check the columns size for the first time.
  columnsResize();

  // How much every listing item affects the window height
  setItemWeight();

  // Scroll to the item opened previously
  if (!revealPreviousItem()) {
    // Fill and fit the window with listing items
    fillWindow(true);
  }

  // Add the needed event listeners to the window and document.
  window.addEventListener("keydown", keyEvent);
  window.addEventListener("scroll", scrollEvent);
  window.addEventListener("resize", windowsResize);

  if (!authStore.user?.perm.create) return;
  document.addEventListener("dragover", preventDefault);
  document.addEventListener("dragenter", dragEnter);
  document.addEventListener("dragleave", dragLeave);
  document.addEventListener("drop", drop);
});

onBeforeUnmount(() => {
  // Remove event listeners before destroying this page.
  window.removeEventListener("keydown", keyEvent);
  window.removeEventListener("scroll", scrollEvent);
  window.removeEventListener("resize", windowsResize);

  if (authStore.user && !authStore.user?.perm.create) return;
  document.removeEventListener("dragover", preventDefault);
  document.removeEventListener("dragenter", dragEnter);
  document.removeEventListener("dragleave", dragLeave);
  document.removeEventListener("drop", drop);
});

const base64 = (name: string) => Base64.encodeURI(name);

const keyEvent = (event: KeyboardEvent) => {
  // No prompts are shown
  if (layoutStore.currentPrompt !== null) {
    return;
  }

  if (event.key === "Escape") {
    // Reset files selection.
    fileStore.selected = [];
  }

  if (event.key === "Delete") {
    if (!authStore.user?.perm.delete || fileStore.selectedCount == 0) return;

    // Show delete prompt.
    layoutStore.showHover("delete");
  }

  if (event.key === "F2") {
    if (!authStore.user?.perm.rename || fileStore.selectedCount !== 1) return;

    // Show rename prompt.
    layoutStore.showHover("rename");
  }

  // Ctrl is pressed
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  // G2 + general hygiene: don't hijack modifier shortcuts when the user
  // is typing in an input / textarea / contenteditable. Cmd+A, Cmd+C,
  // Cmd+X, Cmd+V all have native meanings inside text fields that we
  // shouldn't clobber. The shortcut dispatcher in `useShortcuts` skips
  // typing targets for non-modifier keys; this is the equivalent for
  // the modifier shortcuts handled directly here.
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
    return;
  }

  switch (event.key) {
    case "f":
    case "F":
      if (event.shiftKey) {
        event.preventDefault();
        layoutStore.showHover("search");
      }
      break;
    case "c":
    case "x":
      copyCut(event);
      break;
    case "v":
      paste(event);
      break;
    case "a":
      event.preventDefault();
      for (const file of items.value.files) {
        if (fileStore.selected.indexOf(file.index) === -1) {
          fileStore.selected.push(file.index);
        }
      }
      for (const dir of items.value.dirs) {
        if (fileStore.selected.indexOf(dir.index) === -1) {
          fileStore.selected.push(dir.index);
        }
      }
      break;
    case "s":
      event.preventDefault();
      document.getElementById("download-button")?.click();
      break;
  }
};

const preventDefault = (event: Event) => {
  // Wrapper around prevent default.
  event.preventDefault();
};

const copyCut = (event: Event | KeyboardEvent): void => {
  if ((event.target as HTMLElement).tagName?.toLowerCase() === "input") return;

  if (fileStore.req === null) return;

  const items = [];

  for (const i of fileStore.selected) {
    items.push({
      from: fileStore.req.items[i].url,
      name: fileStore.req.items[i].name,
      size: fileStore.req.items[i].size,
      modified: fileStore.req.items[i].modified,
    });
  }

  if (items.length === 0) {
    return;
  }

  clipboardStore.$patch({
    key: (event as KeyboardEvent).key,
    items,
    path: route.path,
  });
};

const paste = async (event: Event) => {
  if ((event.target as HTMLElement).tagName?.toLowerCase() === "input") return;

  // TODO router location should it be
  const items: any[] = [];

  for (const item of clipboardStore.items) {
    const from = item.from.endsWith("/") ? item.from.slice(0, -1) : item.from;
    const to = route.path + encodeURIComponent(item.name);
    items.push({
      from,
      to,
      name: item.name,
      size: item.size,
      modified: item.modified,
      overwrite: false,
      rename: clipboardStore.path == route.path,
    });
  }

  if (items.length === 0) {
    return;
  }

  const preselect = removePrefix(route.path) + items[0].name;

  let action = (overwrite?: boolean, rename?: boolean) => {
    api
      .copy(items, overwrite, rename)
      .then(() => {
        fileStore.preselect = preselect;
        fileStore.reload = true;
      })
      .catch($showError);
  };

  if (clipboardStore.key === "x") {
    action = (overwrite, rename) => {
      api
        .move(items, overwrite, rename)
        .then(() => {
          clipboardStore.resetClipboard();
          fileStore.preselect = preselect;
          fileStore.reload = true;
        })
        .catch($showError);
    };
  }

  const path = route.path.endsWith("/") ? route.path : route.path + "/";
  const conflict = await upload.checkConflict(items, path);

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
      },
      confirm: (event: Event, result: Array<ConflictingResource>) => {
        event.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const item = result[i];
          if (item.checked.length == 2) {
            items[item.index].rename = true;
          } else if (item.checked.length == 1 && item.checked[0] == "origin") {
            items[item.index].overwrite = true;
          } else {
            items.splice(item.index, 1);
          }
        }
        if (items.length > 0) {
          action();
        }
      },
    });

    return;
  }

  action(false, false);
};

const columnsResize = () => {
  // No-op. CSS Grid now sizes mosaic/gallery tiles via auto-fill minmax in listing.css.
  // (Previous implementation set inline `style.width = calc(33% - 1em)` on every .item,
  //  which forced legacy 3-column flex behavior and overrode the new grid template.)
};

const scrollEvent = throttle(() => {
  const totalItems =
    (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0);

  // All items are displayed
  if (showLimit.value >= totalItems) return;

  const currentPos = window.innerHeight + window.scrollY;

  // Trigger at the 75% of the window height
  const triggerPos = document.body.offsetHeight - window.innerHeight * 0.25;

  if (currentPos > triggerPos) {
    // Quantity of items needed to fill 2x of the window height
    const showQuantity = Math.ceil((window.innerHeight * 2) / itemWeight.value);

    // Increase the number of displayed items
    showLimit.value += showQuantity;
  }
}, 100);

const dragEnter = () => {
  dragCounter.value++;

  // When the user starts dragging an item, put every
  // file on the listing with 50% opacity.
  const items = document.getElementsByClassName("item");

  Array.from(items).forEach((file: Element) => {
    (file as HTMLElement).style.opacity = "0.5";
  });
};

const dragLeave = () => {
  dragCounter.value--;

  if (dragCounter.value == 0) {
    resetOpacity();
  }
};

const drop = async (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value = 0;
  resetOpacity();

  const dt = event.dataTransfer;
  let el: HTMLElement | null = event.target as HTMLElement;

  if (fileStore.req === null || dt === null || dt.files.length <= 0) return;

  for (let i = 0; i < 5; i++) {
    if (el !== null && !el.classList.contains("item")) {
      el = el.parentElement;
    }
  }

  const files: UploadList = (await upload.scanFiles(dt)) as UploadList;
  let path = route.path.endsWith("/") ? route.path : route.path + "/";

  if (
    el !== null &&
    el.classList.contains("item") &&
    el.dataset.dir === "true"
  ) {
    // Get url from ListingItem instance
    // TODO: Don't know what is happening here
    path = el.__vue__.url;

    try {
      (await api.fetch(path)).items;
    } catch (error: any) {
      $showError(error);
      return;
    }
  }

  const conflict = await upload.checkConflict(files, path);

  const preselect = removePrefix(path) + (files[0].fullPath || files[0].name);

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        isUploadAction: true,
      },
      confirm: (event: Event, result: Array<ConflictingResource>) => {
        event.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const item = result[i];
          if (item.checked.length == 2) {
            continue;
          } else if (item.checked.length == 1 && item.checked[0] == "origin") {
            files[item.index].overwrite = true;
          } else {
            files.splice(item.index, 1);
          }
        }
        if (files.length > 0) {
          upload.handleFiles(files, path, true);
          fileStore.preselect = preselect;
        }
      },
    });

    return;
  }

  upload.handleFiles(files, path);
  fileStore.preselect = preselect;
};

const uploadInput = async (event: Event) => {
  const files = (event.currentTarget as HTMLInputElement)?.files;
  if (files === null) return;

  const folder_upload = !!files[0].webkitRelativePath;

  const uploadFiles: UploadList = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = folder_upload ? file.webkitRelativePath : undefined;
    uploadFiles.push({
      file,
      name: file.name,
      size: file.size,
      isDir: false,
      fullPath,
    });
  }

  const path = route.path.endsWith("/") ? route.path : route.path + "/";
  const conflict = await upload.checkConflict(uploadFiles, path);

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        isUploadAction: true,
      },
      confirm: (event: Event, result: Array<ConflictingResource>) => {
        event.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const item = result[i];
          if (item.checked.length == 2) {
            continue;
          } else if (item.checked.length == 1 && item.checked[0] == "origin") {
            uploadFiles[item.index].overwrite = true;
          } else {
            uploadFiles.splice(item.index, 1);
          }
        }
        if (uploadFiles.length > 0) {
          upload.handleFiles(uploadFiles, path, true);
        }
      },
    });

    return;
  }

  upload.handleFiles(uploadFiles, path);
};

const resetOpacity = () => {
  const items = document.getElementsByClassName("item");

  Array.from(items).forEach((file: Element) => {
    (file as HTMLElement).style.opacity = "1";
  });
};

const sort = async (by: string) => {
  let asc = false;

  if (by === "name") {
    if (nameIcon.value === "arrow-up") {
      asc = true;
    }
  } else if (by === "size") {
    if (sizeIcon.value === "arrow-up") {
      asc = true;
    }
  } else if (by === "modified") {
    if (modifiedIcon.value === "arrow-up") {
      asc = true;
    }
  }

  try {
    if (authStore.user?.id) {
      await users.update({ id: authStore.user?.id, sorting: { by, asc } }, [
        "sorting",
      ]);
    }
  } catch (e: any) {
    $showError(e);
  }

  fileStore.reload = true;
};

const windowsResize = throttle(() => {
  columnsResize();
  width.value = window.innerWidth;

  // Listing element is not displayed
  if (listing.value == null) return;

  // How much every listing item affects the window height
  setItemWeight();

  // Fill but not fit the window
  fillWindow();
}, 100);

const download = () => {
  if (fileStore.req === null) return;

  if (
    fileStore.selectedCount === 1 &&
    !fileStore.req.items[fileStore.selected[0]].isDir
  ) {
    api.download(null, fileStore.req.items[fileStore.selected[0]].url);
    return;
  }

  // Nothing selected → confirm before downloading the entire folder
  if (fileStore.selectedCount === 0) {
    const folderName = fileStore.req.name || "this folder";
    const ok = window.confirm(
      `Nothing is selected. This will download the entire contents of "${folderName}" as an archive. Continue?`
    );
    if (!ok) return;
  }

  layoutStore.showHover({
    prompt: "download",
    confirm: (format: any) => {
      layoutStore.closeHovers();

      const files = [];

      if (fileStore.selectedCount > 0 && fileStore.req !== null) {
        for (const i of fileStore.selected) {
          files.push(fileStore.req.items[i].url);
        }
      } else {
        files.push(route.path);
      }

      api.download(format, ...files);
    },
  });
};

const switchView = async () => {
  layoutStore.closeHovers();

  const modes = {
    list: "mosaic",
    mosaic: "mosaic gallery",
    "mosaic gallery": "list",
  };

  const data = {
    id: authStore.user?.id,
    viewMode: (modes[authStore.user?.viewMode ?? "list"] ||
      "list") as ViewModeType,
  };

  users.update(data, ["viewMode"]).catch($showError);

  authStore.updateUser(data);

  setItemWeight();
  fillWindow();
};

const setView = async (mode: string) => {
  if (!authStore.user) return;
  if (authStore.user.viewMode === mode) return;

  layoutStore.closeHovers();

  const data = {
    id: authStore.user.id,
    viewMode: mode as ViewModeType,
  };

  users.update(data, ["viewMode"]).catch($showError);
  authStore.updateUser(data);
  setItemWeight();
  fillWindow();
};

const viewMode = computed(() => authStore.user?.viewMode ?? "list");
void switchView;

const totalItems = computed(
  () => (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0)
);

const allSelected = computed(
  () => totalItems.value > 0 && fileStore.selectedCount === totalItems.value
);

const toggleSelectAll = () => {
  if (allSelected.value) {
    fileStore.selected = [];
  } else {
    const indices = (fileStore.req?.items ?? []).map((it: any) => it.index);
    fileStore.selected = indices;
  }
};

// Bulk-action pill is shown when 2+ items are selected (single selection uses InfoPane instead)
const showBulkPill = computed(() => fileStore.selectedCount >= 2);

// Inline new-item row: when the layout store flags "newDir" or "newFile" as
// the current prompt, render the inline row instead of the legacy modal.
// All existing triggers (sidebar New button, palette command, section More
// menu) call `layoutStore.showHover("newDir" | "newFile")`, so this watch
// is the only wiring needed — no caller changes.
const inlineNewKind = computed<"newDir" | "newFile" | null>(() => {
  const name = layoutStore.currentPromptName;
  return name === "newDir" || name === "newFile" ? name : null;
});

// ── Stage 8: Delete → confirm → optimistic + Undo toast ──────────────
// Delete is destructive enough to warrant a confirmation step. Flow:
//   1. Any "delete" trigger (header button, palette, pill, ctx menu)
//      routes through `layoutStore.showHover("delete")`.
//   2. We intercept here when there's an active listing selection,
//      capture the items, dismiss the prompt, and open a confirm dialog.
//   3. Confirm → items disappear from the listing immediately, an Undo
//      toast appears for 10s, the API delete fires only after the
//      window expires (undo cancels it).
//   4. Cancel → nothing happens.
// The legacy modal is still kept in Prompts.vue for the file-editor
// delete case (where `isListing === false`).
const pendingDelete = usePendingDelete();
const $toast = useToast();
const UNDO_WINDOW_MS = 10000;

const confirmOpen = ref(false);
const confirmTitle = ref("");
const confirmMessage = ref("");
const pendingConfirm = ref<{ url: string; name: string }[]>([]);

const performDelete = async (items: { url: string; name: string }[]) => {
  try {
    await Promise.all(items.map((i) => api.remove(i.url)));
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    fileStore.reload = true;
  }
};

const startUndoDelete = (items: { url: string; name: string }[]) => {
  // Clear the selection so the pill + selection ring disappear with the items
  fileStore.selected = [];
  fileStore.multiple = false;

  const message =
    items.length === 1
      ? `Deleted “${items[0].name}”`
      : `Deleted ${items.length} items`;

  const toastId = $toast(
    {
      component: UndoToast,
      props: { message, onClick: () => pendingDelete.undo() },
    },
    { timeout: UNDO_WINDOW_MS, closeOnClick: false, icon: false }
  );

  pendingDelete.queue(items, UNDO_WINDOW_MS).then((didUndo) => {
    $toast.dismiss(toastId);
    if (!didUndo) void performDelete(items);
  });
};

const onDeleteConfirm = () => {
  const items = pendingConfirm.value;
  confirmOpen.value = false;
  pendingConfirm.value = [];
  if (items.length === 0) return;
  startUndoDelete(items);
};

const onDeleteCancel = () => {
  confirmOpen.value = false;
  pendingConfirm.value = [];
};

// ── Stage 8: Move / Copy / Share slide-overs ──────────────────────────
// Same intercept pattern as delete: when one of these prompts fires from
// the listing context, snapshot what we need, dismiss the prompt, and
// open the slide-over panel. The legacy modals remain registered in
// Prompts.vue only as a safety net for non-listing callers.
const moveCopyOpen = ref(false);
const moveCopyMode = ref<"move" | "copy">("move");
const shareOpen = ref(false);
const extractOpen = ref(false);

const closeMoveCopy = () => {
  moveCopyOpen.value = false;
};
const closeShare = () => {
  shareOpen.value = false;
};
const closeExtract = () => {
  extractOpen.value = false;
};

watch(
  () => layoutStore.currentPromptName,
  (name) => {
    if (name === "move" || name === "copy") {
      if (!fileStore.isListing || fileStore.selectedCount === 0) return;
      moveCopyMode.value = name;
      layoutStore.closeHovers();
      moveCopyOpen.value = true;
      return;
    }
    if (name === "share") {
      // Share targets a single item — either the file being viewed, or the
      // sole selected item in the listing. If the listing has 0 or 2+
      // selected, do nothing (legacy modal would have noop'd too).
      const singleListingSelection =
        fileStore.isListing && fileStore.selectedCount === 1;
      const fileView = !fileStore.isListing;
      if (!singleListingSelection && !fileView) return;
      layoutStore.closeHovers();
      shareOpen.value = true;
      return;
    }
    if (name === "extract") {
      // Extract targets exactly one selected `.zip` in the current
      // listing. Mirror the gate from `headerButtons.extract` so a stray
      // `layoutStore.showHover("extract")` from a stale code path can't
      // open the panel with no source.
      if (!unzipEnabled) return;
      if (!fileStore.isListing || fileStore.selectedCount !== 1) return;
      const item = fileStore.req?.items[fileStore.selected[0]];
      if (!item || (item.extension ?? "").toLowerCase() !== ".zip") return;
      layoutStore.closeHovers();
      extractOpen.value = true;
      return;
    }
  }
);

watch(
  () => layoutStore.currentPromptName,
  (name) => {
    if (name !== "delete") return;
    // Only intercept when we have a listing-level selection; the legacy
    // modal still handles file-editor deletes (a different code path).
    if (!fileStore.isListing || fileStore.selectedCount === 0) return;

    const req = fileStore.req;
    if (!req) return;
    const items = fileStore.selected
      .map((idx) => req.items[idx])
      .filter(Boolean)
      .map((i) => ({ url: i.url, name: i.name }));
    if (items.length === 0) return;

    // Dismiss the prompt so the legacy modal doesn't render alongside ours
    layoutStore.closeHovers();

    pendingConfirm.value = items;
    if (items.length === 1) {
      const it = items[0];
      const labelHint = it.url.endsWith("/") ? "folder" : "file";
      confirmTitle.value = `Delete this ${labelHint}?`;
      confirmMessage.value = `“${it.name}” will be permanently removed. You'll have 10 seconds to undo.`;
    } else {
      confirmTitle.value = `Delete ${items.length} items?`;
      confirmMessage.value = `The selected files and folders will be permanently removed. You'll have 10 seconds to undo.`;
    }
    confirmOpen.value = true;
  }
);

const clearSelection = () => {
  fileStore.selected = [];
  fileStore.multiple = false;
};

// Section title "More" dropdown
const sectionMoreShow = ref<boolean>(false);
const sectionMorePos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const showSectionMore = (event: MouseEvent) => {
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  sectionMoreShow.value = true;
  // Right-align menu's right edge to the button's right edge (menu min-width is 200px)
  sectionMorePos.value = {
    x: rect.right - 200,
    y: rect.bottom + 6 + window.scrollY,
  };
};

const hideSectionMore = () => {
  sectionMoreShow.value = false;
};

const refresh = () => {
  fileStore.reload = true;
};

const sortLabel = computed(() => {
  const by = fileStore.req?.sorting.by ?? "name";
  if (by === "name") return t("files.name");
  if (by === "size") return t("files.size");
  // "Modified" instead of "Last modified" — the longer string overflowed
  // the header sort button at near-md widths once the chevron was removed.
  if (by === "modified") return "Modified";
  return by;
});

const cycleSort = () => {
  const order = ["name", "modified", "size"];
  const currentBy = fileStore.req?.sorting.by ?? "name";
  const next = order[(order.indexOf(currentBy) + 1) % order.length];
  sort(next);
};

const uploadFunc = () => {
  if (
    typeof window.DataTransferItem !== "undefined" &&
    typeof DataTransferItem.prototype.webkitGetAsEntry !== "undefined"
  ) {
    layoutStore.showHover("upload");
  } else {
    document.getElementById("upload-input")?.click();
  }
};

const setItemWeight = () => {
  // Listing element is not displayed
  if (listing.value === null || fileStore.req === null) return;

  let itemQuantity = fileStore.req.numDirs + fileStore.req.numFiles;
  if (itemQuantity > showLimit.value) itemQuantity = showLimit.value;

  // How much every listing item affects the window height
  itemWeight.value = listing.value.offsetHeight / itemQuantity;
};

const fillWindow = (fit = false) => {
  if (fileStore.req === null) return;

  const totalItems = fileStore.req.numDirs + fileStore.req.numFiles;

  // More items are displayed than the total
  if (showLimit.value >= totalItems && !fit) return;

  const windowHeight = window.innerHeight;

  // Quantity of items needed to fill 2x of the window height
  const showQuantity = Math.ceil(
    (windowHeight + windowHeight * 2) / itemWeight.value
  );

  // Less items to display than current
  if (showLimit.value > showQuantity && !fit) return;

  // Set the number of displayed items
  showLimit.value = showQuantity > totalItems ? totalItems : showQuantity;
};

const revealPreviousItem = () => {
  if (!fileStore.req || !fileStore.oldReq) return;

  const index = fileStore.selected[0];
  if (index === undefined) return;

  showLimit.value =
    index + Math.ceil((window.innerHeight * 2) / itemWeight.value);

  nextTick(() => {
    const items = document.querySelectorAll("#listing .item");
    items[index].scrollIntoView({ block: "center" });
  });

  return true;
};

const showContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  isContextMenuVisible.value = true;
  contextMenuPos.value = {
    x: event.clientX + 8,
    y: event.clientY + Math.floor(window.scrollY),
  };
};

const hideContextMenu = () => {
  isContextMenuVisible.value = false;
};

const handleEmptyAreaClick = (e: MouseEvent) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.clearOnClick === "true") {
    fileStore.selected = [];
  }
};
</script>
<style scoped>
#listing {
  min-height: calc(100vh - 8rem);
}

/* ── Mobile selection toolbar (#file-selection) ───────────────────────
   Renders only at `isMobile` widths (the InfoPane sidebar collapses to
   a full-width sheet at < 540 px, so multi-select actions need their
   own surface up top instead of relying on the desktop pill at the
   bottom of the screen). Previously this row had NO CSS at all — the
   "N files selected" text + Share/Rename/Copy/Move/Delete buttons
   inherited browser-default chrome and a stale legacy `.action` class
   that points at undefined tokens, so it rendered as plain text and
   unspaced icon-buttons. Now it's a proper toolbar matching the rest
   of the chrome. */
#file-selection {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-line, #ececec);
  min-height: 44px;
}

#file-selection > span {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-2, #52525b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Override the legacy `.action` chrome inside this toolbar so the
   buttons read as tappable icon-buttons rather than the deprecated
   round-emerald inline-block style. */
#file-selection :deep(.action) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
#file-selection :deep(.action:hover),
#file-selection :deep(.action:focus-visible) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
  outline: none;
}
#file-selection :deep(.action:focus-visible) {
  box-shadow: 0 0 0 2px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}
/* The Action component renders a `<span>{{ label }}</span>` inside;
   in this mobile context we want icon-only tap targets, so hide the
   label. Tooltips + aria-label still describe the button. */
#file-selection :deep(.action span) {
  display: none;
}
/* Delete button — visually distinct hover so destructive actions feel
   different from neutral ones. */
#file-selection :deep(.action[title="Delete"]:hover),
#file-selection :deep(.action[title="Delete"]:focus-visible) {
  background: #fef2f2;
  color: #b91c1c;
}
html.dark #file-selection :deep(.action[title="Delete"]:hover),
html.dark #file-selection :deep(.action[title="Delete"]:focus-visible) {
  background: rgba(127, 29, 29, 0.25);
  color: #fca5a5;
}

.file-selection-margin-bottom {
  margin-bottom: 3.5rem;
}

/* ── Section title as parent-folder drop target (F2) ────────────────
   While a drag is hovering and a parent folder exists, the entire
   section-title row lights up with a subtle accent halo + ring so the
   user sees that releasing here will move to the parent (and hovering
   2 s will navigate up without dropping). Visual treatment mirrors
   the breadcrumb drop-target state for consistency. */
.section-title {
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease;
  border-radius: 8px;
  margin: 0 4px;
}
.section-title--drop {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  box-shadow: inset 0 0 0 2px var(--color-accent, #5e6ad2);
}

/* Primary CTA shown inside the empty-folder state. Same chrome as the
   header Upload button so the action feels familiar. */
.empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--color-accent, #5e6ad2);
  border: 1px solid var(--color-accent, #5e6ad2);
  color: white;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.empty-cta:hover {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
  box-shadow: 0 4px 12px -4px rgba(94, 106, 210, 0.4);
}

.empty-cta:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 2px;
}

/* ── List enter/leave transitions (Stage 11e) ──────────────────────
   Rows added (after upload / move / refresh) or removed (delete) fade
   + slide in. Respects prefers-reduced-motion (the global override in
   styles.css collapses transition-duration to 0.01ms). */
:deep(.listing-section) {
  position: relative;
}

.list-enter-active,
.list-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.list-leave-active {
  /* Absolute-position leaving rows so siblings collapse smoothly. */
  position: absolute;
  left: 0;
  right: 0;
}

/* Smooth shuffling when sort order or contents reorder. */
.list-move {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Folder rename input (D6) ────────────────────────────────────────
   Replaces the section-title h1 while renaming the current folder. We
   mimic the h1's typography exactly so the swap doesn't shift layout —
   only the border + focus ring change, signaling "this is editable". */
.folder-rename-input {
  background: transparent;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  padding: 2px 8px;
  margin: -3px -9px;
  width: calc(100% + 18px);
  outline: none;
  font-family: inherit;
  color: var(--color-ink-1, #18181b);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}
.folder-rename-input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}
</style>
