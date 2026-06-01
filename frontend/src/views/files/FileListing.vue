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

        <!-- Sort popover trigger (v1.3 S3-4). Was a cycle button —
             now opens a ContextMenu with primary + secondary criteria
             selection. min-w sized to fit the widest label ("Modified"
             / "Extension") so layout doesn't jump as the user changes
             the active sort. -->
        <button
          class="h-7 px-2 min-w-[110px] max-md:min-w-0 max-md:w-7 max-md:h-7 max-md:px-0 max-md:justify-center rounded-md border border-line bg-surface hover:bg-elevated inline-flex items-center justify-center gap-1.5 text-[13px] text-ink-2 transition"
          @click.stop="openSortMenu"
          :title="`Sort: ${sortLabel}`"
          :aria-label="`Sort: ${sortLabel}`"
        >
          <Icon name="arrow-down-narrow-wide" :size="14" />
          <span class="max-md:hidden">{{ sortLabel }}</span>
        </button>
        <context-menu
          :show="sortMenuShow"
          :pos="sortMenuPos"
          :items="sortMenuItems"
          @hide="sortMenuShow = false"
        />

        <!-- S7-2: camera-roll / photo-library upload. Touch devices only
             (the native file chooser is the win here; desktops already
             have the rich Upload prompt). No `capture` attr, so iOS /
             Android show their full sheet — Photo Library / Take Photo /
             Browse — and the chosen files flow through the SAME upload
             pipeline as everything else (uploadInput). -->
        <button
          v-if="headerButtons.upload && isTouchDevice"
          class="h-7 w-7 rounded-md border border-line bg-surface hover:bg-elevated text-ink-2 inline-flex items-center justify-center transition"
          @click="photoInput?.click()"
          title="Add photos or videos"
          aria-label="Add photos or videos"
        >
          <Icon name="image-plus" :size="14" />
        </button>
        <input
          ref="photoInput"
          style="display: none"
          type="file"
          accept="image/*,video/*"
          multiple
          @change="uploadInput($event)"
        />

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
      <section
        ref="scrollSection"
        class="flex-1 flex flex-col min-w-0 overflow-y-auto ptr-host"
        :class="{ 'scroll-section--virtual': isListVirtual }"
      >
        <!-- S7-1: pull-to-refresh indicator. Only visible during a pull
             or while refreshing; pinned at the visible top (scrollTop is
             held at 0 throughout the gesture, so absolute top:0 = top of
             the viewport). -->
        <div
          v-if="ptrActive"
          class="ptr-indicator"
          :class="{ 'ptr-indicator--pulling': ptrPulling }"
          :style="{
            transform: `translate(-50%, ${ptrOffset}px)`,
            opacity: ptrOpacity,
          }"
          aria-hidden="true"
        >
          <div class="ptr-indicator__pill">
            <Icon
              name="loader-circle"
              :size="18"
              class="ptr-indicator__spin"
              :class="{ 'ptr-indicator__spin--active': ptrRefreshing }"
              :style="
                ptrRefreshing
                  ? undefined
                  : { transform: `rotate(${ptrRotation}deg)` }
              "
            />
          </div>
        </div>

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
              class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-1 flex items-center gap-1.5"
            >
              <span>Folder</span>
              <!-- Parent-folder nav button (H5). Same destination as the
                   F2 spring-load on this section title — explicit click
                   affordance for users who don't think to drag-hover.
                   Hidden at root where parentFolderUrl is null. -->
              <button
                v-if="parentFolderUrl"
                type="button"
                class="parent-up-btn"
                :title="`Go to parent folder${parentFolderName ? ` (${parentFolderName})` : ''}`"
                :aria-label="`Go to parent folder${parentFolderName ? ` (${parentFolderName})` : ''}`"
                @click.stop="goToParentFolder"
              >
                <Icon name="arrow-up" :size="11" :stroke-width="2.2" />
              </button>
              <!-- Favorite star for the current folder (v1.3 S3-2).
                   Pairs visually with the parent-up button. Always
                   visible (filled when favorited, outline when not)
                   — discoverable affordance for the canonical
                   "pin this folder" action. -->
              <button
                v-if="fileStore.req?.isDir && currentFolderPath"
                type="button"
                class="current-fav-btn"
                :class="{ 'current-fav-btn--active': currentFolderFavorited }"
                :title="
                  currentFolderFavorited
                    ? 'Remove from Favorites'
                    : 'Add to Favorites'
                "
                :aria-label="
                  currentFolderFavorited
                    ? 'Remove from Favorites'
                    : 'Add to Favorites'
                "
                :aria-pressed="currentFolderFavorited"
                @click.stop="onCurrentFolderFavToggle"
              >
                <Icon
                  name="star"
                  :size="11"
                  :stroke-width="currentFolderFavorited ? 0 : 2"
                  :fill="currentFolderFavorited ? 'currentColor' : 'none'"
                />
              </button>
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

        <!-- Section title "More" dropdown.
             Migrated to the items-based ContextMenu API (v1.3.0 S1-3) —
             keyboard nav, type-ahead, separators all come along for
             free. The action array below is built in the script. -->
        <context-menu
          :show="sectionMoreShow"
          :pos="sectionMorePos"
          :items="sectionMoreItems"
          @hide="hideSectionMore"
        />

        <!-- Loading: skeleton rows matching the current view mode. Mirrors
         the real ListingItem layout so the page doesn't reflow on load. -->
        <ListingSkeleton
          v-if="layoutStore.loading"
          :mode="viewMode === 'list' ? 'list' : 'mosaic'"
          :count="viewMode === 'list' ? 10 : 12"
        />
        <template v-else>
          <!-- Empty state vs. listing chrome. Critical detail (H6):
               when the user is mid-creation (`inlineNewKind` is set)
               we MUST render the listing branch even on an empty
               folder — otherwise the InlineNewItem (which only lives
               inside #listing) has nowhere to mount and clicking
               "New Folder" silently no-ops. The listing's header +
               inline input form a clean "creating in empty folder"
               surface; EmptyState comes back when the prompt closes. -->
          <div
            v-if="
              (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0) ==
                0 && !inlineNewKind
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
            :data-drop-url="currentFolderUrl || undefined"
            :class="[viewMode, { 'listing--virtual': isListVirtual }]"
            @click="handleEmptyAreaClick"
            @contextmenu="onListingContextMenu"
            @mousedown="dragSelect.onMouseDown"
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

            <!-- v1.3 S6-1: the LIST view is virtualized with
                 RecycleScroller (fixed 44px rows) so a 10k-file folder
                 only ever mounts the visible window + a small buffer.
                 dirs → divider → files are flattened into `listRows`;
                 selection/drag/rename all stay index-based so they keep
                 working through recycling. Grid + gallery keep the
                 incremental `showLimit` windowing in the v-else branch —
                 their tiles wrap to variable heights, so list-first per
                 the locked Stage 6 plan. -->
            <RecycleScroller
              v-if="isListVirtual"
              ref="listScroller"
              class="listing-virtual"
              :items="listRows"
              :item-size="44"
              key-field="id"
              :buffer="320"
              data-clear-on-click="true"
              v-slot="{ item: row }"
            >
              <div
                v-if="row.divider"
                class="folder-file-divider"
                data-clear-on-click="true"
              ></div>
              <item
                v-else-if="row.item"
                v-bind:index="row.item.index"
                v-bind:name="row.item.name"
                v-bind:isDir="row.item.isDir"
                v-bind:url="row.item.url"
                v-bind:modified="row.item.modified"
                v-bind:type="row.item.type"
                v-bind:size="row.item.size"
                v-bind:path="row.item.path"
                @rowIntoZone="onRowIntoZone"
                @dropAlongside="onItemDropAlongside"
                @rowPointerDown="onItemPointerDown"
              >
              </item>
            </RecycleScroller>

            <template v-else>
              <!-- CH-1: the folders + files grids are windowed — only the
                   tiles near the viewport mount. The top/bottom spacer
                   blocks stand in for the rows scrolled out of view so the
                   scroll height + position stay exact. Spacers are block
                   siblings of the grid (not grid cells), so there's no gap
                   math to get wrong, and each section's total height stays
                   constant as you scroll. -->
              <div
                v-if="(fileStore.req?.numDirs ?? 0) > 0"
                ref="dirsSectionRef"
                class="listing-section-pad"
                data-clear-on-click="true"
              >
                <div
                  class="grid-pad"
                  data-clear-on-click="true"
                  :style="{ height: dirsWin.topPad + 'px' }"
                ></div>
                <div class="listing-section" data-clear-on-click="true">
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
                    @rowIntoZone="onRowIntoZone"
                    @dropAlongside="onItemDropAlongside"
                    @rowPointerDown="onItemPointerDown"
                  >
                  </item>
                </div>
                <div
                  class="grid-pad"
                  data-clear-on-click="true"
                  :style="{ height: dirsWin.botPad + 'px' }"
                ></div>
              </div>

              <div
                v-if="
                  (fileStore.req?.numDirs ?? 0) > 0 &&
                  (fileStore.req?.numFiles ?? 0) > 0
                "
                class="folder-file-divider"
                data-clear-on-click="true"
              ></div>

              <div
                v-if="(fileStore.req?.numFiles ?? 0) > 0"
                ref="filesSectionRef"
                class="listing-section-pad"
                data-clear-on-click="true"
              >
                <div
                  class="grid-pad"
                  data-clear-on-click="true"
                  :style="{ height: filesWin.topPad + 'px' }"
                ></div>
                <div class="listing-section" data-clear-on-click="true">
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
                    @rowIntoZone="onRowIntoZone"
                    @dropAlongside="onItemDropAlongside"
                    @rowPointerDown="onItemPointerDown"
                  >
                  </item>
                </div>
                <div
                  class="grid-pad"
                  data-clear-on-click="true"
                  :style="{ height: filesWin.botPad + 'px' }"
                ></div>
              </div>
            </template>

            <!-- v1.3 H11: "Drop into current folder" target.
                 Renders only during an internal drag whose items don't
                 already live in this folder. Sits beneath the last row
                 with generous vertical reach so folder-heavy listings
                 still give the user a tolerant safe area to drop INTO
                 the current directory — without having to land in the
                 gaps between rows or aim at a non-folder. -->
            <div
              v-if="currentFolderDropZoneVisible"
              class="current-folder-dropzone"
              :class="{
                'current-folder-dropzone--active': listingDropActive,
              }"
              @dragenter="onListingDropEnter"
              @dragover="onListingDropOver"
              @dragleave="onListingDropLeave"
              @drop="onListingDrop"
            >
              <div class="current-folder-dropzone__inner">
                <Icon name="folder-open" :size="16" :stroke-width="1.8" />
                <span>
                  Drop to move into
                  <strong>{{ folderTitle || "this folder" }}</strong>
                </span>
              </div>
            </div>

            <!-- S4-1: items-based context menu. The same `<context-menu>`
                 instance serves both right-click on a row (rowMenuItems)
                 and right-click on empty listing space (background-
                 MenuItems) — `onListingContextMenu` decides which to
                 hand it based on event.target. ContextMenu handles
                 keyboard nav, type-ahead, smart positioning. -->
            <context-menu
              :show="isContextMenuVisible"
              :pos="contextMenuPos"
              :items="contextMenuItems"
              @hide="hideContextMenu"
            />

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
                :title="t('buttons.copyFiles')"
              >
                <Icon name="copy" :size="14" />
                <span>{{ t("buttons.copyFiles") }}</span>
              </button>
              <button
                v-if="headerButtons.move"
                @click="layoutStore.showHover('move')"
                :title="t('buttons.moveFiles')"
              >
                <Icon name="forward" :size="14" />
                <span>{{ t("buttons.moveFiles") }}</span>
              </button>
              <!-- v1.3 S4-2: Bulk rename pill button. Only renders for
                   multi-select (single-select uses inline rename in
                   ListingItem). Gated on perm.rename. -->
              <button
                v-if="
                  fileStore.selectedCount > 1 && authStore.user?.perm.rename
                "
                @click="bulkRename.open"
                title="Bulk rename"
              >
                <Icon name="pencil" :size="14" />
                <span>Rename</span>
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

    <!-- Bulk rename slide-over (v1.3 S4-2). Pattern / find-replace
         modes with live preview + conflict highlighting; client-loops
         api.move with continue-on-error semantics. Open-state lives in
         the useBulkRename singleton so the command palette can trigger
         it without prop-drilling through FileListing. -->
    <BulkRenamePanel
      :open="bulkRename.isOpen.value"
      @cancel="bulkRename.close"
      @done="bulkRename.close"
    />

    <!-- Share slide-over (Stage 8). -->
    <SharePanel :open="shareOpen" @cancel="closeShare" />

    <!-- Extract zip slide-over (PR #5746 Phase B). -->
    <ExtractPanel
      :open="extractOpen"
      @cancel="closeExtract"
      @done="closeExtract"
    />

    <!-- Drag-select lasso rectangle (v1.3 S4-3). Teleported to body so
         fixed-position viewport coords aren't clipped by the listing's
         overflow. Only present while a marquee is active in grid /
         gallery. -->
    <Teleport to="body">
      <div
        v-if="dragSelect.lasso.value"
        class="drag-lasso"
        :style="{
          left: dragSelect.lasso.value.x + 'px',
          top: dragSelect.lasso.value.y + 'px',
          width: dragSelect.lasso.value.w + 'px',
          height: dragSelect.lasso.value.h + 'px',
        }"
      ></div>
    </Teleport>

    <!-- Image hover-preview overlay (v1.3 S5-9). Single instance driven
         by the useImageHoverPreview singleton; rows schedule/cancel it.
         Self-teleports to body + size-caps the image. -->
    <ImageHoverPreview />
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { useTagsStore } from "@/stores/tags";
import { useFavorites } from "@/composables/useFavorites";
import { useFolderViewMode } from "@/composables/useFolderViewMode";
import { usePreferences } from "@/composables/usePreferences";
import { useTagPicker } from "@/composables/useTagPicker";
import { useBulkRename } from "@/composables/useBulkRename";
import { useDragSelect } from "@/composables/useDragSelect";
import { useListingGrid } from "@/composables/useListingGrid";
import { useTouchDevice } from "@/composables/useTouchDevice";
import { usePullToRefresh } from "@/composables/usePullToRefresh";
import { copy } from "@/utils/clipboard";
import { applySecondarySort } from "@/utils/secondarySort";

import { users, files as api } from "@/api";
import { enableExec, unzipEnabled } from "@/utils/constants";
import { isExtractable } from "@/utils/archive";
import { filesize } from "@/utils";
import * as upload from "@/utils/upload";
import { throttle } from "lodash-es";
import { Base64 } from "js-base64";
import dayjs from "dayjs";
// v1.3 S6-1: fixed-size list virtualization for huge folders.
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

import HeaderBar from "@/components/header/HeaderBar.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import Action from "@/components/header/Action.vue";
import Search from "@/components/Search.vue";
import Item from "@/components/files/ListingItem.vue";
import InfoPane from "@/components/files/InfoPane.vue";
import ImageHoverPreview from "@/components/files/ImageHoverPreview.vue";
import InlineNewItem from "@/components/files/InlineNewItem.vue";
import ListingSkeleton from "@/components/files/ListingSkeleton.vue";
import EmptyState from "@/components/EmptyState.vue";
import UndoToast from "@/components/UndoToast.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import MoveCopyPanel from "@/components/files/MoveCopyPanel.vue";
import BulkRenamePanel from "@/components/files/BulkRenamePanel.vue";
import ExtractPanel from "@/components/files/ExtractPanel.vue";
import SharePanel from "@/components/files/SharePanel.vue";
import { useToast } from "vue-toastification";
import { usePendingDelete } from "@/composables/usePendingDelete";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import { useShortcuts } from "@/composables/useShortcuts";
import { useDropTarget } from "@/composables/useDropTarget";
import { useTouchDrag } from "@/composables/useTouchDrag";
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

const dragCounter = ref<number>(0);
const width = ref<number>(window.innerWidth);
const isContextMenuVisible = ref<boolean>(false);
const contextMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const clipboardStore = useClipboardStore();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();
const tagsStore = useTagsStore();
const prefs = usePreferences();
// S4-1: shared open-state for the TagPickerSheet so the row context
// menu can open it from outside InfoPane.
const tagPicker = useTagPicker();
// S4-2: shared open-state for the BulkRenamePanel so the row context
// menu, the bulk-pill button, and the command palette all trigger
// through the same flag.
const bulkRename = useBulkRename();

// ── Inline tag chip plumbing (v1.3 S2-5) ────────────────────────────
// After each listing fetch, do ONE batched call to /api/tags/batch so
// every row can render its chips without N+1 lookups. Triggered by a
// watch on fileStore.req — fires on initial load AND every reload
// (rename, paste, upload, etc.). Failure is silent: chips just don't
// render. The store also pre-loads the user's full tag list so the
// info-pane picker has its autocomplete ready.
watch(
  () => fileStore.req,
  (req) => {
    if (!req?.isDir || !Array.isArray(req.items)) return;
    void tagsStore.ensureLoaded();
    const paths = req.items.map((i) => i.url).filter(Boolean);
    void tagsStore.loadForPaths(paths);
  },
  { immediate: true }
);

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
    if (!item || !isExtractable(item.name)) return;
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
const scrollSection = ref<HTMLElement | null>(null);

// S7-2: touch-only camera-roll / photo-library upload. `isTouchDevice`
// gates the header affordance; `photoInput` is the hidden <input> it
// triggers (change → existing uploadInput pipeline).
const isTouchDevice = useTouchDevice();
const photoInput = ref<HTMLInputElement | null>(null);
// v1.3 S6-1: RecycleScroller instance for the virtualized list view.
// Held so we can scroll a previously-opened item back into view when the
// user navigates back from a preview (the recycler's analog of the
// non-virtual `revealPreviousItem` querySelector + scrollIntoView).
const listScroller = ref<{ scrollToItem: (index: number) => void } | null>(
  null
);

// ── Grid/gallery virtualization (CH-1) ──────────────────────────────
// Window the folders + files grids so a huge folder only mounts the tiles
// near the viewport (+ a buffer) instead of the old ever-growing
// `showLimit` slice. `dirsSectionRef`/`filesSectionRef` point at the two
// section WRAPPERS (`.listing-section-pad`) — not the inner grid — so their
// top edge is the section's stable row-0 origin (the wrapper spans the top
// spacer + grid + bottom spacer, total height held constant). The composable
// measures column count + tile height from the grid inside, computes the
// window, and the spacer pads keep the scroll height/position stable. Using
// the wrapper (not the grid, whose top shifts with the top pad) is essential:
// it keeps the window math + lasso hit-test anchored to a fixed origin.
const dirsSectionRef = ref<HTMLElement | null>(null);
const filesSectionRef = ref<HTMLElement | null>(null);
const listingGrid = useListingGrid({
  enabled: () => viewMode.value !== "list",
  gallery: () => viewMode.value === "mosaic gallery",
  scrollEl: () => scrollSection.value,
  dirsSectionEl: () => dirsSectionRef.value,
  filesSectionEl: () => filesSectionRef.value,
  dirsCount: () => items.value.dirs.length,
  filesCount: () => items.value.files.length,
});
const { dirsWin, filesWin } = listingGrid;
const scheduleGridUpdate = throttle(() => listingGrid.update(), 60);

// ── S4-3 drag-select lasso (grid + gallery only) ───────────────────
// Rubber-band selection bound to #listing's @mousedown. `enabled`
// gates on viewMode (declared later — the closure only reads it at
// mouse-down time, well after init). Writes straight to
// fileStore.selected so the marquee live-updates the listing.
// `hitTest` (CH-1) computes intersections by geometry so tiles that have
// been windowed out of the DOM are still selectable across a long drag.
const dragSelect = useDragSelect({
  enabled: () => viewMode.value !== "list",
  getScrollContainer: () => scrollSection.value,
  getSelection: () => [...fileStore.selected],
  setSelection: (indices) => {
    fileStore.selected = indices;
  },
  hitTest: (rect) =>
    listingGrid.hitTest(
      rect,
      items.value.dirs.map((d) => d.index),
      items.value.files.map((f) => f.index)
    ),
});
onBeforeUnmount(() => dragSelect.cleanup());

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

/** Human-readable name of the parent folder, used as the tooltip on
 *  the inline ↑ button. "/" → "root"; "/Documents/Letters/" → "Documents".
 *  Decoded so `%20` shows up as space. */
const parentFolderName = computed<string>(() => {
  const parent = parentFolderUrl.value;
  if (!parent) return "";
  // Trim trailing slash + extract the last segment. URL-decode so
  // multibyte / spaced names render correctly in the title attribute.
  const trimmed = parent.endsWith("/") ? parent.slice(0, -1) : parent;
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) return "root";
  try {
    return decodeURIComponent(segments[segments.length - 1]);
  } catch {
    return segments[segments.length - 1];
  }
});

/** Click handler for the inline ↑ button. Same destination as the
 *  spring-load drag behavior so users get one mental model regardless
 *  of which input modality they're using. */
const goToParentFolder = () => {
  if (parentFolderUrl.value) router.push({ path: parentFolderUrl.value });
};

// ── Current-folder favorites (v1.3 S3-2) ────────────────────────────
// Star toggle in the section-title eyebrow. Pinning the current
// folder adds it to the sidebar's Favorites list for one-click
// return. Folders only — file pinning belongs in Recents.
const favoritesComposable = useFavorites();
/** The path the favorites composable persists. Uses the listing's
 *  url field (the /files/...-prefixed form) since that's the same
 *  string the ListingItem star uses for child folders. */
const currentFolderPath = computed<string>(() => fileStore.req?.url ?? "");
const currentFolderFavorited = computed<boolean>(() =>
  currentFolderPath.value
    ? favoritesComposable.isFavorited(currentFolderPath.value)
    : false
);
const onCurrentFolderFavToggle = () => {
  if (!currentFolderPath.value) return;
  favoritesComposable.toggle(currentFolderPath.value);
};

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

// ── Drop-into-current-folder zone (v1.3 H11) ────────────────────────
// Folder-heavy listings used to trap internal drops: every visible row
// was a folder, so anywhere the user released became "move INTO that
// child folder" — there was no tolerant "drop here = current dir"
// target. This zone sits below the rows during an active internal
// drag and provides one. The `performParentDrop` from `useDropTarget`
// is target-agnostic (it just takes a destination URL), so we reuse it.
const listingDropActive = ref<boolean>(false);
let listingDragDepth = 0;

/** URL the dropzone resolves to: the current folder. Mirrors the
 *  `url` shape ListingItem rows use (ends with "/") so the conflict
 *  prompt's `to` field matches what the user sees in the breadcrumb. */
const currentFolderUrl = computed<string>(() => fileStore.req?.url ?? "");

/** True when every dragged item's parent directory equals the current
 *  folder — i.e. dragging from here to here. We hide the dropzone in
 *  that case because the move is a no-op (the composable short-circuits
 *  on identical from/to) and showing it would just confuse. */
const draggedFromCurrentFolder = computed<boolean>(() => {
  const here = currentFolderUrl.value;
  const dragged = fileStore.draggedItems;
  if (!here || dragged.length === 0) return false;
  return dragged.every((it) => {
    // Item url shape: "/files/Docs/foo.txt" → parent "/files/Docs/".
    // Strip the trailing basename (with optional trailing slash for
    // folder items) — that's the item's parent dir.
    const parent = it.url.replace(/[^/]+\/?$/, "");
    return parent === here;
  });
});

/** Visibility gate: an internal drag is in flight AND the items
 *  aren't already in this folder AND we have a current folder URL. */
const currentFolderDropZoneVisible = computed<boolean>(
  () =>
    fileStore.draggedItems.length > 0 &&
    !!currentFolderUrl.value &&
    !draggedFromCurrentFolder.value
);

const onListingDropEnter = (event: DragEvent) => {
  event.preventDefault();
  listingDragDepth++;
  if (listingDragDepth === 1) listingDropActive.value = true;
};

const onListingDropOver = (event: DragEvent) => {
  event.preventDefault();
  if (event.dataTransfer) {
    // Mirror ListingItem's modifier handling so the cursor matches
    // the action (move by default, copy with ctrl/cmd).
    event.dataTransfer.dropEffect =
      event.ctrlKey || event.metaKey ? "copy" : "move";
  }
};

const onListingDropLeave = () => {
  listingDragDepth = Math.max(0, listingDragDepth - 1);
  if (listingDragDepth === 0) listingDropActive.value = false;
};

const onListingDrop = (event: DragEvent) => {
  listingDragDepth = 0;
  listingDropActive.value = false;
  if (!currentFolderUrl.value) return;
  void performParentDrop(event, currentFolderUrl.value);
};

// v1.3 H12: rows broadcast which zone the cursor is in so the bottom
// dropzone visual always tells the truth about where a release will
// land. When `active=true`, the cursor is inside a folder's into-zone
// — the row owns the drop, bottom zone goes neutral. When `active=false`,
// the cursor is on a row's alongside area (or any file row) — the
// destination is the CURRENT folder, so the bottom zone lights up
// to advertise that.
const onRowIntoZone = (active: boolean) => {
  listingDropActive.value = !active;
};

// v1.3 H12: alongside drop on any row — route to current folder via
// the same `useDropTarget.performDrop` that powers the bottom zone +
// parent-folder shortcut. No-op if we somehow have no current folder.
const onItemDropAlongside = (event: DragEvent) => {
  if (!currentFolderUrl.value) return;
  listingDropActive.value = false;
  void performParentDrop(event, currentFolderUrl.value);
};

// ── Touch drag-and-drop (lifted from ListingItem, CH-2) ─────────────
// HTML5 DnD never fires on touch, so a single pointer-based gesture
// drives the SAME move pipeline (`useDropTarget.performDrop`) — conflict
// prompt, self-drop guard, transfer indicator. This used to be one
// useTouchDrag instance PER row; hoisting it here means the listing owns
// exactly one regardless of how many rows are mounted. Rows forward their
// pointerdown via the `rowPointerDown` event (mouse pointers are ignored
// inside the composable, so desktop is untouched). Drop targets are any
// element carrying `data-drop-url` — folder rows, breadcrumb segments,
// and the current-folder area.
let touchHighlightEl: HTMLElement | null = null;
let touchSpringUrl: string | null = null;
let touchSpringTimer: number | null = null;

const clearTouchHighlight = () => {
  if (touchHighlightEl) {
    touchHighlightEl.style.outline = "";
    touchHighlightEl.style.outlineOffset = "";
    touchHighlightEl = null;
  }
};
const cancelTouchSpring = () => {
  if (touchSpringTimer !== null) {
    window.clearTimeout(touchSpringTimer);
    touchSpringTimer = null;
  }
  touchSpringUrl = null;
};
const resolveDropEl = (el: Element | null): HTMLElement | null =>
  (el?.closest?.("[data-drop-url]") as HTMLElement | null) ?? null;

const listingTouchDrag = useTouchDrag<{ index: number }>({
  // The ghost is created before onStart runs (so draggedItems isn't
  // populated yet for this gesture); read the pressed row's name straight
  // off the listing for the single-item label, matching the old per-row
  // behavior. Multi-select uses the snapshot count once it exists.
  ghostLabel: (p) => {
    const c = fileStore.draggedItems.length;
    if (c > 1) return `${c} items`;
    return fileStore.req?.items[p.index]?.name ?? "";
  },
  // Edge auto-scroll during a touch drag targets the ACTUAL scroll
  // container (the recycler in list view, the <section> in grid/gallery) —
  // resolved by ptrScrollEl — rather than #listing, which isn't the scroller.
  scrollEl: () => ptrScrollEl.value,
  onStart: (p) => fileStore.snapshotDragSelection(p.index),
  onMove: (_p, _x, _y, el) => {
    const target = resolveDropEl(el);
    if (target !== touchHighlightEl) {
      clearTouchHighlight();
      if (target) {
        target.style.outline = "2px solid var(--color-accent, #5e6ad2)";
        target.style.outlineOffset = "-2px";
        touchHighlightEl = target;
      }
    }
    // Spring-load: hovering a *folder row* (not the current-folder area)
    // for 2s drills into it so nested drops are possible (F6 parity).
    const url = target?.dataset.dropUrl ?? null;
    const isFolderRow =
      !!target &&
      target.classList.contains("item") &&
      target.getAttribute("data-dir") === "true";
    if (isFolderRow && url && url !== fileStore.req?.url) {
      if (touchSpringUrl !== url) {
        cancelTouchSpring();
        touchSpringUrl = url;
        touchSpringTimer = window.setTimeout(() => {
          touchSpringTimer = null;
          void router.push({ path: url });
        }, 2000);
      }
    } else {
      cancelTouchSpring();
    }
  },
  onDrop: (_p, _x, _y, el) => {
    cancelTouchSpring();
    clearTouchHighlight();
    const url = resolveDropEl(el)?.dataset.dropUrl;
    if (!url) return;
    // Touch has no Ctrl/Cmd → always a move. performParentDrop reads the
    // snapshot from fileStore.draggedItems and applies all the usual guards.
    const synthetic = {
      preventDefault: () => {},
      ctrlKey: false,
      metaKey: false,
    } as unknown as DragEvent;
    void performParentDrop(synthetic, url);
  },
  onEnd: () => {
    cancelTouchSpring();
    clearTouchHighlight();
    fileStore.draggedItems = [];
    // Swallow the synthetic click the browser fires on the drop row.
    fileStore.suppressClicksUntil = Date.now() + 350;
  },
});

// Forwarded from each row's pointerdown (after the row's own read-only +
// interactive-child guard). Mouse pointers are ignored inside the gesture.
const onItemPointerDown = (event: PointerEvent, index: number) => {
  listingTouchDrag.onPointerDown(event, { index });
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

// CH-1: render only the windowed slice of each grid section. Before the
// first measure (window still {0,0}) fall back to a small bootstrap slice
// so there ARE tiles to measure + fill the first paint.
const BOOTSTRAP_TILES = 60;
const dirs = computed(() => {
  const all = items.value.dirs;
  if (dirsWin.end <= dirsWin.start) {
    return all.slice(0, Math.min(all.length, BOOTSTRAP_TILES));
  }
  return all.slice(dirsWin.start, dirsWin.end);
});

const items = computed(() => {
  const dirs: ResourceItem[] = [];
  const files: ResourceItem[] = [];

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

  // v1.3 S3-4: apply secondary sort as a tiebreaker within tied
  // primary-key groups. dirs/files sorted independently so the
  // existing dirs-first / files-first grouping isn't disturbed.
  const primaryBy = (fileStore.req?.sorting.by ?? "name") as SortKey;
  const sec = secondarySort.value;
  return {
    dirs: applySecondarySort(dirs, primaryBy, sec),
    files: applySecondarySort(files, primaryBy, sec),
  };
});

const files = computed((): ResourceItem[] => {
  const all = items.value.files;
  if (filesWin.end <= filesWin.start) {
    return all.slice(0, Math.min(all.length, BOOTSTRAP_TILES));
  }
  return all.slice(filesWin.start, filesWin.end);
});

// ── List virtualization (v1.3 S6-1) ─────────────────────────────────
// Only the LIST view virtualizes (uniform 40px rows). Grid + gallery
// tiles wrap to variable heights, so they stay on the incremental
// `showLimit` windowing above — list-first per the locked Stage 6 plan.
const isListVirtual = computed<boolean>(() => viewMode.value === "list");

// Flat row model the RecycleScroller consumes: every dir, an optional
// folder/file divider sentinel, then every file. Crucially this is the
// FULL list (no `showLimit` slice) — the recycler only mounts the
// on-screen window, so a 10k-entry array costs almost nothing. Reuses
// `items` (already secondary-sorted + pending-delete-filtered), so sort
// and the delete-undo flow stay correct through virtualization.
// Flat shape uses a nullable `item` (rather than a discriminated union)
// so the template can narrow with a plain `v-else-if="row.item"` — Vue's
// template type-checker narrows truthiness reliably but not always a
// `kind` discriminant across v-else.
interface ListRow {
  /** Stable key for the recycler. */
  id: string;
  /** True for the single folder/file divider sentinel. */
  divider: boolean;
  /** The file/folder for a normal row; null on the divider. */
  item: ResourceItem | null;
}

const listRows = computed<ListRow[]>(() => {
  const { dirs, files } = items.value;
  const rows: ListRow[] = [];
  for (const d of dirs) {
    rows.push({ id: "d:" + base64(d.name), divider: false, item: d });
  }
  if (dirs.length > 0 && files.length > 0) {
    rows.push({ id: "__divider__", divider: true, item: null });
  }
  for (const f of files) {
    rows.push({ id: "f:" + base64(f.name), divider: false, item: f });
  }
  return rows;
});

/** Virtualized analog of `revealPreviousItem`: when the user returns to
 *  a folder with a previously-opened item selected, scroll the recycler
 *  so that row is in view (the off-screen DOM node doesn't exist, so we
 *  can't use scrollIntoView). */
const revealInVirtualList = (): boolean => {
  if (!fileStore.req || !fileStore.oldReq) return false;
  const index = fileStore.selected[0];
  if (index === undefined) return false;
  nextTick(() => {
    const rowIdx = listRows.value.findIndex(
      (r) => r.item !== null && r.item.index === index
    );
    if (rowIdx >= 0) listScroller.value?.scrollToItem(rowIdx);
  });
  return true;
};

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
      isExtractable(fileStore.req.items[fileStore.selected[0]]?.name ?? ""),
  };
});

const isMobile = computed(() => {
  return width.value <= 736;
});

watch(req, () => {
  nextTick(() => {
    // S6-1: the list view virtualizes, so there's no window to fill —
    // just scroll a previously-opened item back into view if any.
    if (isListVirtual.value) {
      revealInVirtualList();
      return;
    }

    // CH-1: grid/gallery — measure + compute the initial window, then
    // reveal a previously-opened tile if we're returning from a preview.
    listingGrid.measure();
    listingGrid.update();
    revealPreviousItem();
  });
});

// CH-1: observes the grid/gallery scroll container so InfoPane open/close
// and window resizes re-measure the column count + window. Created on
// mount, disconnected on unmount.
let gridResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  // Measure the grid columns/tile-height for the first time.
  columnsResize();

  // S6-1: virtualized list skips the window-fill math entirely.
  if (isListVirtual.value) {
    revealInVirtualList();
  } else {
    listingGrid.measure();
    listingGrid.update();
    revealPreviousItem();
  }

  // Add the needed event listeners to the window and document.
  window.addEventListener("keydown", keyEvent);
  window.addEventListener("scroll", scrollEvent);
  window.addEventListener("resize", windowsResize);

  // CH-1: the grid/gallery scroll the <section>, so window-scroll doesn't
  // fire — listen on the section directly to drive the virtualization
  // window, and observe its size so column count tracks width changes
  // (e.g. the InfoPane opening). The list view manages its own recycler.
  const sc = scrollSection.value;
  if (sc) {
    sc.addEventListener("scroll", scheduleGridUpdate, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      gridResizeObserver = new ResizeObserver(() => listingGrid.update());
      gridResizeObserver.observe(sc);
    }
  }

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

  scrollSection.value?.removeEventListener("scroll", scheduleGridUpdate);
  scheduleGridUpdate.cancel();
  gridResizeObserver?.disconnect();
  gridResizeObserver = null;

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

  // v1.3 S4-5: Delete / Backspace remove the current selection.
  //   • Backspace is the macOS Finder convention; aliased to Delete.
  //   • bare Delete / Backspace  → ConfirmDialog (the default safe path)
  //   • Shift + Delete/Backspace → skip the dialog, straight to the
  //     optimistic delete + 10s undo toast (power-user escape hatch).
  //   • Cmd/Ctrl + Delete        → same as bare Delete (confirm); this
  //     branch sits above the modifier guard below so it still fires.
  // Guarded against text-entry targets: Backspace is heavily used while
  // typing (search box, inline rename, bulk-rename inputs), and without
  // this check it would silently delete the selected files instead.
  if (event.key === "Delete" || event.key === "Backspace") {
    const t = event.target as HTMLElement | null;
    const tg = t?.tagName?.toLowerCase();
    if (tg === "input" || tg === "textarea" || t?.isContentEditable) {
      return;
    }
    if (!authStore.user?.perm.delete || fileStore.selectedCount === 0) return;
    event.preventDefault();
    if (event.shiftKey) {
      triggerImmediateDelete();
    } else {
      layoutStore.showHover("delete");
    }
    return;
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

  // Re-select EVERY pasted item in the destination, not just items[0]
  // (the previous single-string behavior dropped N-1 selections on a
  // multi-item paste). items[].name is already decoded.
  const destPathPrefix = removePrefix(route.path);
  const preselectPaths = items.map((it) => destPathPrefix + it.name);

  let action = (overwrite?: boolean, rename?: boolean) => {
    api
      .copy(items, overwrite, rename)
      .then(() => {
        fileStore.setPreselect(preselectPaths);
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
          fileStore.setPreselect(preselectPaths);
          fileStore.reload = true;
        })
        .catch($showError);
    };
  }

  const path = route.path.endsWith("/") ? route.path : route.path + "/";
  const conflict = await upload.checkMoveConflict(items, path);

  if (conflict.length > 0) {
    // Paste path: source is the clipboard's origin folder, target is
    // the current route. clipboardStore.path is the directory the cut
    // / copied items came from.
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        from: clipboardStore.path,
        to: path,
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
  // CH-1: recompute grid columns + tile height + the visible window from
  // the live container width. CSS Grid still sizes the tiles (auto-fill
  // minmax in listing.css); this only refreshes the virtualization window.
  listingGrid.measure();
  listingGrid.update();
};

// Window-level scroll fallback. Grid/gallery scroll the <section> (we bind
// a listener to it directly in onMounted), but keep this so any ancestor
// scroll still refreshes the window. The list view manages its own.
const scrollEvent = throttle(() => {
  if (isListVirtual.value) return;
  listingGrid.update();
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

  // Build a preselect list of every uploaded file's destination path.
  // For folder-uploads, `fullPath` carries the relative path inside
  // the dropped folder (already decoded from webkitRelativePath); for
  // plain file drops, `name` is the bare filename (also decoded).
  const buildPreselect = (sourceFiles: typeof files) =>
    sourceFiles.map((f) => removePrefix(path) + (f.fullPath || f.name));

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        isUploadAction: true,
        to: path,
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
          // Re-select against the post-conflict-resolution survivors
          // so skipped files don't end up "selected but missing".
          fileStore.setPreselect(buildPreselect(files));
        }
      },
    });

    return;
  }

  upload.handleFiles(files, path);
  fileStore.setPreselect(buildPreselect(files));
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

  // Mirror dropUpload's preselect behavior so users see their freshly-
  // uploaded files highlighted in the destination — consistent UX
  // regardless of which upload entry point they used.
  const buildPreselect = (sourceFiles: typeof uploadFiles) =>
    sourceFiles.map((f) => removePrefix(path) + (f.fullPath || f.name));

  if (conflict.length > 0) {
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        isUploadAction: true,
        to: path,
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
          fileStore.setPreselect(buildPreselect(uploadFiles));
        }
      },
    });

    return;
  }

  upload.handleFiles(uploadFiles, path);
  fileStore.setPreselect(buildPreselect(uploadFiles));
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
  } else if (by === "extension") {
    // v1.3 S3-5: default to ascending alphabetical extension order
    // when first selected; subsequent clicks toggle direction. No
    // column-header for extension yet (S3-4 popover will add proper
    // direction toggling for it), so the cycle-button entry point
    // just commits ascending the first time.
    asc = true;
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

// ── Per-folder view-mode memory (v1.3 S3-3) ─────────────────────────
// localStorage map keyed by folder URL. Per-folder overrides win over
// the user's global default. Locked decision: per-device, not
// cross-device — view mode is fundamentally shaped by viewport.
const folderViewMode = useFolderViewMode();

const switchView = async () => {
  layoutStore.closeHovers();

  const modes: Record<ViewModeType, ViewModeType> = {
    list: "mosaic",
    mosaic: "mosaic gallery",
    "mosaic gallery": "list",
  };
  const current = viewMode.value;
  const next = modes[current] ?? "list";

  // Per-folder save (S3-3) instead of touching the user record. The
  // global default is now changed only via Profile settings (or
  // explicit "set as default" UI, future). This keeps "set list view
  // for /Photos" from secretly changing the default everywhere.
  const folderPath = fileStore.req?.url;
  if (folderPath) {
    folderViewMode.setModeForPath(folderPath, next);
  }
  // Update the reactive ref directly so the change shows immediately.
  // We deliberately do NOT touch authStore.user.viewMode — the per-folder
  // override is local-only and must not silently change the account
  // default (that's only set via Profile / the command palette).
  viewMode.value = next;

  setItemWeight();
  fillWindow();
};

const setView = async (mode: string) => {
  if (!authStore.user) return;
  if (viewMode.value === mode) return;

  layoutStore.closeHovers();

  // Per-folder save instead of touching the user record (S3-3).
  const folderPath = fileStore.req?.url;
  if (folderPath) {
    folderViewMode.setModeForPath(folderPath, mode as ViewModeType);
  }
  // Drive the reactive ref directly (RC-2). We don't mutate
  // authStore.user.viewMode here — the per-folder override is local-only
  // and shouldn't move the account default.
  viewMode.value = mode as ViewModeType;
  setItemWeight();
  fillWindow();
};

/** Effective view mode for the current folder: per-folder override if
 *  set, else the user's account-wide default.
 *
 *  Backed by a `ref` rather than a plain computed: the per-folder
 *  override lives in `localStorage`, which is NOT reactive. A computed
 *  over `getModeForPath()` only tracks `req.url`, so toggling the view
 *  in the *same* folder changed localStorage but never re-ran the
 *  computed — the buttons looked dead until you navigated away or
 *  refreshed (RC-2). This ref is the source of truth: re-seeded on
 *  folder navigation and account-default changes, and set synchronously
 *  by setView/switchView. */
const resolveViewMode = (): ViewModeType => {
  const folderPath = fileStore.req?.url;
  if (folderPath) {
    return folderViewMode.getModeForPath(folderPath);
  }
  return authStore.user?.viewMode ?? "list";
};

const viewMode = ref<ViewModeType>(resolveViewMode());

watch(
  () => [fileStore.req?.url, authStore.user?.viewMode] as const,
  () => {
    viewMode.value = resolveViewMode();
  }
);

// CH-1: a view-mode switch (list ↔ grid ↔ gallery) changes the tile
// dimensions + column count. Re-measure + re-window AFTER the DOM has
// re-rendered with the new mode's classes (so the grid metrics are read
// from the correct layout, not the outgoing one).
watch(viewMode, () => {
  nextTick(() => {
    listingGrid.measure();
    listingGrid.update();
  });
});
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

// Bulk-action pill is shown when 2+ items are selected (single selection
// uses InfoPane instead) AND no slide-over panel is open — otherwise the
// fixed bottom pill overlaps the right-hand panel (RC fix).
const showBulkPill = computed(
  () => fileStore.selectedCount >= 2 && !anyPanelOpen.value
);

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

// After an optimistic delete, move the selection to the nearest remaining
// item so a follow-up Shift+Delete (RC-10) has a target instead of
// no-opping on an empty selection. Mirrors the image-preview delete flow,
// which already advances to a neighbor. Runs BEFORE the deleted items are
// hidden by the pending filter, so the pre-delete visual order is intact.
const selectNeighborAfterDelete = (deletedUrls: Set<string>) => {
  // dirs-then-files matches the listing's render order.
  const visible = [...items.value.dirs, ...items.value.files];
  const firstDeletedPos = visible.findIndex((it) => deletedUrls.has(it.url));
  const remaining = visible.filter((it) => !deletedUrls.has(it.url));
  fileStore.multiple = false;
  if (remaining.length === 0) {
    // Deleted the whole folder's worth of items — nothing left to select.
    fileStore.selected = [];
    return;
  }
  // The item that slides up into the first deleted slot (or the last
  // remaining item if the deletion was at the end of the list).
  const pos = firstDeletedPos === -1 ? 0 : firstDeletedPos;
  const neighbor = remaining[Math.min(pos, remaining.length - 1)];
  // Immediate re-selection — `index` is the same key space the rows bind
  // to, so the selection ring + a follow-up keyboard delete both work now.
  fileStore.selected = [neighbor.index];
  // Survive the eventual reload: performDelete sets reload=true, and
  // Files.vue re-resolves queued preselect paths into the selection.
  if (neighbor.path) fileStore.setPreselect(neighbor.path);
};

const startUndoDelete = (items: { url: string; name: string }[]) => {
  // Advance the selection to a neighbor before the items vanish (RC-10).
  selectNeighborAfterDelete(new Set(items.map((i) => i.url)));

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

// Build the {url, name}[] list for the current listing selection.
// Shared by the confirm-dialog intercept watcher and the S4-5
// skip-confirm shortcut path so both agree on what "the selection" is.
const collectSelectedDeleteItems = (): { url: string; name: string }[] => {
  const req = fileStore.req;
  if (!req) return [];
  return fileStore.selected
    .map((idx) => req.items[idx])
    .filter(Boolean)
    .map((i) => ({ url: i.url, name: i.name }));
};

// v1.3 S4-5: Shift+Delete / Shift+Backspace bypass the ConfirmDialog
// and go straight to the optimistic delete + 10s undo flow. The undo
// toast IS the safety net here — confirmation is the cost a power user
// opts out of. Still listing-scoped + selection-gated.
const triggerImmediateDelete = () => {
  if (!fileStore.isListing) return;
  const items = collectSelectedDeleteItems();
  if (items.length === 0) return;
  startUndoDelete(items);
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
// v1.3 S4-2: BulkRenamePanel state lives on `bulkRename` (composable
// declared up top with the other singleton composables) so the
// command palette can flip it without prop drilling. Local helpers
// are just thin wrappers that match the SlideOver's cancel/done
// emit shape.

const closeMoveCopy = () => {
  moveCopyOpen.value = false;
};
const closeShare = () => {
  shareOpen.value = false;
};
const closeExtract = () => {
  extractOpen.value = false;
};

// True when ANY of the slide-over panels is open. Drives the pill-hide
// (so the bottom pill doesn't overlap a panel) and the one-at-a-time
// enforcement below.
const anyPanelOpen = computed(
  () =>
    moveCopyOpen.value ||
    shareOpen.value ||
    extractOpen.value ||
    bulkRename.isOpen.value
);

// Only one slide-over may be open at a time. Each open-path calls this
// first so opening (say) Rename dismisses an already-open Copy panel
// instead of stacking them.
const closeAllPanels = () => {
  moveCopyOpen.value = false;
  shareOpen.value = false;
  extractOpen.value = false;
  bulkRename.close();
};

// BulkRename is opened from outside FileListing (pill button, command
// palette, row context menu) via the composable singleton — so close the
// sibling panels reactively whenever it opens.
watch(
  () => bulkRename.isOpen.value,
  (open) => {
    if (open) {
      moveCopyOpen.value = false;
      shareOpen.value = false;
      extractOpen.value = false;
    }
  }
);

watch(
  () => layoutStore.currentPromptName,
  (name) => {
    if (name === "move" || name === "copy") {
      if (!fileStore.isListing || fileStore.selectedCount === 0) return;
      moveCopyMode.value = name;
      layoutStore.closeHovers();
      closeAllPanels();
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
      closeAllPanels();
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
      if (!item || !isExtractable(item.name)) return;
      layoutStore.closeHovers();
      closeAllPanels();
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
    const items = collectSelectedDeleteItems();
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

// Items array for the items-based ContextMenu (v1.3.0 S1-3). Built as
// a computed so per-render permission checks (e.g., canRenameCurrentFolder
// reactive on route) flow through naturally. `.filter(Boolean)` drops
// items gated off by permissions — TS narrows the result back to the
// non-null MenuItem[] via the explicit return type.
const sectionMoreItems = computed<MenuItem[]>(() => {
  const canCreate = !!authStore.user?.perm.create;
  const items: (MenuItem | null)[] = [
    canCreate
      ? {
          label: t("sidebar.newFolder"),
          icon: "folder-plus",
          action: () => layoutStore.showHover("newDir"),
        }
      : null,
    canCreate
      ? {
          label: t("sidebar.newFile"),
          icon: "file-plus",
          action: () => layoutStore.showHover("newFile"),
        }
      : null,
    // Rename the CURRENTLY VIEWED folder (not selected items).
    // Hidden at the storage root since you can't rename "/".
    canRenameCurrentFolder.value
      ? {
          label: "Rename folder",
          icon: "pencil",
          action: startFolderRename,
        }
      : null,
    { label: "Refresh", icon: "rotate-ccw", action: refresh, kbd: "R" },
    {
      label: t("buttons.info"),
      icon: "info",
      action: () => layoutStore.showHover("info"),
    },
  ];
  return items.filter((i): i is MenuItem => i !== null);
});

const refresh = () => {
  fileStore.reload = true;
};

// ── S7-1: pull-to-refresh (touch only) ──────────────────────────────
// The scroll container differs by view (S6-1): list view scrolls inside
// the RecycleScroller, grid/gallery scroll the <section>. Resolve the
// active one reactively; the composable re-binds its listeners when this
// swaps on a view-mode change.
const ptrScrollEl = computed<HTMLElement | null>(() => {
  if (isListVirtual.value) {
    const inst = listScroller.value as unknown as { $el?: HTMLElement } | null;
    return inst?.$el ?? null;
  }
  return scrollSection.value;
});

// Reload the folder and hold the spinner until the fetch settles. A
// reload flips layoutStore.loading true→false (Files.vue fetchData), so
// we resolve on that transition — with a small floor so the spinner
// doesn't flash, and a safety timeout in case loading never toggles.
const onPullRefresh = () =>
  new Promise<void>((resolve) => {
    const startedAt = Date.now();
    let sawLoading = false;
    const settle = () => {
      stop();
      clearTimeout(safety);
      setTimeout(resolve, Math.max(0, 450 - (Date.now() - startedAt)));
    };
    const stop = watch(
      () => layoutStore.loading,
      (loading) => {
        if (loading) sawLoading = true;
        else if (sawLoading) settle();
      }
    );
    // Safety net: resolve anyway if a reload never toggles `loading`.
    const safety = setTimeout(() => {
      stop();
      resolve();
    }, 5000);
    refresh();
  });

const {
  active: ptrActive,
  offset: ptrOffset,
  opacity: ptrOpacity,
  rotation: ptrRotation,
  refreshing: ptrRefreshing,
  pulling: ptrPulling,
} = usePullToRefresh({
  el: ptrScrollEl,
  threshold: 64,
  onRefresh: onPullRefresh,
  // Suppressed unless we're on a touch device with nothing else going on:
  // not already loading, no open prompt, no active selection / drag /
  // lasso (those own the gesture surface).
  enabled: () =>
    isTouchDevice.value &&
    !layoutStore.loading &&
    layoutStore.currentPrompt === null &&
    fileStore.selectedCount === 0 &&
    fileStore.draggedItems.length === 0 &&
    dragSelect.lasso.value === null,
});

const sortLabel = computed(() => {
  const by = fileStore.req?.sorting.by ?? "name";
  if (by === "name") return t("files.name");
  if (by === "size") return t("files.size");
  // "Modified" instead of "Last modified" — the longer string overflowed
  // the header sort button at near-md widths once the chevron was removed.
  if (by === "modified") return "Modified";
  // v1.3 S3-5: extension sort label. "Type" is shorter than
  // "Extension" and reads naturally in the cycle button at narrow
  // widths without needing min-width adjustment.
  if (by === "extension") return "Type";
  return by;
});

// ── Multi-column sort popover (v1.3 S3-4) ───────────────────────────
// Replaces the legacy cycle button (and the brief S3-5-extension
// cycle extension). Click → ContextMenu with primary + secondary
// criterion selection. Primary persists server-side via the existing
// users.update flow; secondary persists client-side via
// usePreferences and applies as an in-memory tiebreaker after fetch.

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: t("files.name") },
  { key: "size", label: t("files.size") },
  { key: "modified", label: "Modified" },
  { key: "extension", label: "Type" },
];

const sortMenuShow = ref(false);
const sortMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const openSortMenu = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  // Anchor the popover to the bottom-left corner of the button so it
  // reads as "belongs to the button." ContextMenu's positioner clamps
  // to viewport, so right-edge overflow is auto-handled.
  sortMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
  sortMenuShow.value = true;
};

/** Read the saved secondary criterion (if any). Stored in prefs as a
 *  SortCriterion or null. */
const secondarySort = computed<SortCriterion | null>(() =>
  prefs.get<SortCriterion | null>("sort.secondary", null)
);

/** Apply the user's choice to the PRIMARY axis. Same flow as before:
 *  PUT to user.sorting + trigger a reload. */
const setPrimarySort = (by: SortKey, asc: boolean) => {
  sortMenuShow.value = false;
  void sortRaw(by, asc);
};

/** Update the SECONDARY axis. Stored in prefs; no server round-trip;
 *  no reload — the items computed re-applies the tiebreaker reactively. */
const setSecondarySort = (criterion: SortCriterion | null) => {
  sortMenuShow.value = false;
  void prefs.set("sort.secondary", criterion);
};

/** Build the ContextMenu items array. Layout:
 *
 *    PRIMARY                ← header
 *    Name           [arrow] ← active criterion shows direction arrow
 *    Size
 *    Modified
 *    Type
 *    ────────────           ← separator
 *    THEN BY                ← header
 *    None
 *    Name           [arrow]
 *    Size
 *    Modified
 *    Type
 *
 * Clicking the active primary toggles its direction. Clicking an
 * inactive primary sets it to ascending. Same for secondary. "None"
 * clears the secondary. */
const sortMenuItems = computed<MenuItem[]>(() => {
  const primaryBy = (fileStore.req?.sorting.by ?? "name") as SortKey;
  const primaryAsc = fileStore.req?.sorting.asc ?? false;
  const sec = secondarySort.value;

  const items: MenuItem[] = [
    { type: "header", label: "Primary" },
    ...SORT_OPTIONS.map((opt) => ({
      label: opt.label,
      icon:
        primaryBy === opt.key
          ? primaryAsc
            ? "arrow-up"
            : "arrow-down"
          : undefined,
      action: () => {
        // Re-clicking the active primary toggles direction; clicking
        // a different criterion picks it ascending by default.
        const nextAsc = primaryBy === opt.key ? !primaryAsc : true;
        setPrimarySort(opt.key, nextAsc);
      },
    })),
    { type: "separator" },
    { type: "header", label: "Then by" },
    {
      label: "None",
      icon: sec === null ? "check" : undefined,
      action: () => setSecondarySort(null),
    },
    ...SORT_OPTIONS.map((opt) => ({
      // Disable picking the same key for primary + secondary — that
      // would be a no-op tiebreaker (every primary tie also ties on
      // the same key). Greyed out so the rule is visible.
      label: opt.label,
      disabled: opt.key === primaryBy,
      icon:
        sec?.by === opt.key ? (sec.asc ? "arrow-up" : "arrow-down") : undefined,
      action: () => {
        const nextAsc = sec?.by === opt.key ? !sec.asc : true;
        setSecondarySort({ by: opt.key, asc: nextAsc });
      },
    })),
  ];
  return items;
});

/** Pure sort dispatcher — used by the popover. The legacy `sort()`
 *  function still exists below (called by column-header clicks) and
 *  reuses this codepath internally so the persistence story is
 *  centralized. */
const sortRaw = async (by: SortKey, asc: boolean) => {
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
  // CH-1: legacy hook from the old showLimit windowing. Now it just
  // re-measures the grid (columns + tile height). Kept (rather than ripped
  // out of every caller) so the call sites stay readable.
  if (isListVirtual.value) return;
  listingGrid.measure();
};

const fillWindow = () => {
  // CH-1: legacy hook — recompute the grid/gallery visible window. The
  // virtualized list view manages its own window inside the recycler.
  if (isListVirtual.value) return;
  listingGrid.update();
};

const revealPreviousItem = () => {
  if (!fileStore.req || !fileStore.oldReq) return;

  const index = fileStore.selected[0];
  if (index === undefined) return;

  // CH-1: the target tile may be windowed out of the DOM, so scroll the
  // section to its computed row first, then let the scroll handler mount
  // it. Locate the item's position within its section (folders or files),
  // compute the content-space Y, and center it in the viewport.
  const sc = scrollSection.value;
  if (!sc) return;
  const { dirs: dItems, files: fItems } = items.value;
  let ordinal = dItems.findIndex((it) => it.index === index);
  let sectionEl = dirsSectionRef.value;
  if (ordinal < 0) {
    ordinal = fItems.findIndex((it) => it.index === index);
    sectionEl = filesSectionRef.value;
  }
  if (ordinal < 0) return;

  nextTick(() => {
    const cols = listingGrid.cols.value || 1;
    const stride = listingGrid.tileH.value + 12;
    const row = Math.floor(ordinal / cols);
    const secTop = sectionEl
      ? sectionEl.getBoundingClientRect().top -
        sc.getBoundingClientRect().top +
        sc.scrollTop
      : 0;
    const target = secTop + row * stride - sc.clientHeight / 2;
    sc.scrollTop = Math.max(0, target);
    listingGrid.update();
  });

  return true;
};

// ── S4-1 context menu dispatch ──────────────────────────────────────
// Single entry point invoked by `#listing`'s @contextmenu. We decide
// which menu (row vs background) based on whether the event target sits
// inside an `.item` element. Both menus reuse the same `<context-menu>`
// instance — we just hand it a different `:items` array.
//
// Row context: each ListingItem's own @contextmenu has already fired
// FIRST (events bubble inside-out) and adopted/replaced the selection
// per the locked spec (right-click on unselected = select that row;
// right-click on already-selected = preserve multi). All we do here
// is open the menu with the current selection-derived items.
//
// Background context: emit a different items array (New folder, etc.).
const contextMenuMode = ref<"row" | "background">("row");

const onListingContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  const target = event.target as HTMLElement | null;
  // Treat `.item.header` (the column-header row) as background — it
  // shares the `.item` class for layout grid reasons but isn't a
  // selectable file row. Without this, right-clicking the header
  // would put us in "row" mode with an empty selection and the menu
  // would open with no items.
  const itemEl = target?.closest?.(".item") as HTMLElement | null;
  const insideRealItem = itemEl != null && !itemEl.classList.contains("header");
  contextMenuMode.value = insideRealItem ? "row" : "background";
  isContextMenuVisible.value = true;
  contextMenuPos.value = {
    x: event.clientX + 8,
    y: event.clientY + Math.floor(window.scrollY),
  };
};

const hideContextMenu = () => {
  isContextMenuVisible.value = false;
};

// ── S4-1 row context menu items ─────────────────────────────────────
// Computed `MenuItem[]` for right-clicks landing on a row. Reuses
// `headerButtons` for the permission/selection-size/file-type gating
// the bulk pill already does, then adds the S4-1 additions (Open,
// Tag, Copy path). Items that don't pass their gate aren't emitted at
// all — the ContextMenu primitive handles separators between groups
// even when leading items disappear.
//
// `Open` is single-selection only (multi-open opens N tabs which we
// don't want — would also race the route guard). `Rename` is single
// too (bulk rename is S4-2). `Move` / `Copy` / `Delete` / `Download`
// work on the full selection. `Extract` is single .zip only (gated
// inside headerButtons.extract). `Share` is single-only too.
const rowMenuItems = computed<MenuItem[]>(() => {
  const sel = fileStore.selectedCount;
  if (sel === 0) return []; // shouldn't open the menu with no selection
  const items: MenuItem[] = [];
  const hb = headerButtons.value;
  const singleItem =
    sel === 1 ? (fileStore.req?.items[fileStore.selected[0]] ?? null) : null;

  // ── Open / Tag / Copy path (single-selection actions) ────────────
  if (singleItem) {
    items.push({
      label: singleItem.isDir ? "Open folder" : "Open",
      icon: "external-link",
      action: () => {
        hideContextMenu();
        if (singleItem) void router.push({ path: singleItem.url });
      },
    });
  }
  if (singleItem) {
    items.push({
      label: "Tag…",
      icon: "tag",
      action: () => {
        hideContextMenu();
        tagPicker.open();
      },
    });
  }

  // ── Share / Extract (single-only, gated by perms + file type) ────
  if (hb.share) {
    items.push({
      label: t("buttons.share"),
      icon: "share",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("share");
      },
    });
  }
  if (hb.extract) {
    items.push({
      label: t("buttons.unzip"),
      icon: "package-open",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("extract");
      },
    });
  }

  // ── Rename / Move / Copy / Copy path / Download (varies) ─────────
  if (items.length > 0) items.push({ type: "separator" });
  // Single-selection rename → existing inline rename flow.
  // Multi-selection rename → S4-2 BulkRenamePanel (different code path,
  // entirely different UX). Permission gate is the same (perm.rename).
  if (hb.rename) {
    items.push({
      label: t("buttons.rename"),
      icon: "pencil",
      kbd: "F2",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("rename");
      },
    });
  } else if (authStore.user?.perm.rename && sel > 1) {
    items.push({
      label: `Bulk rename ${sel} items…`,
      icon: "pencil",
      action: () => {
        hideContextMenu();
        bulkRename.open();
      },
    });
  }
  if (hb.move) {
    items.push({
      label: sel === 1 ? t("buttons.moveFile") : `Move ${sel} items…`,
      icon: "forward",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("move");
      },
    });
  }
  if (hb.copy) {
    items.push({
      label: sel === 1 ? t("buttons.copyFile") : `Copy ${sel} items…`,
      icon: "copy",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("copy");
      },
    });
  }
  if (singleItem) {
    items.push({
      label: "Copy path",
      icon: "link",
      action: () => {
        hideContextMenu();
        void copyItemPath(singleItem);
      },
    });
  }
  if (hb.download) {
    items.push({
      label:
        sel === 1
          ? t("buttons.download")
          : `${t("buttons.download")} ${sel} items`,
      icon: "download",
      action: () => {
        hideContextMenu();
        download();
      },
    });
  }

  // ── Delete (destructive — visual separation + red tint) ──────────
  if (hb.delete) {
    items.push({ type: "separator" });
    items.push({
      label: sel === 1 ? t("buttons.delete") : `Delete ${sel} items`,
      icon: "trash-2",
      destructive: true,
      kbd: "⌫",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("delete");
      },
    });
  }

  return items;
});

// ── S4-1 background context menu items ──────────────────────────────
// Shown when right-click lands on empty listing space (gaps between
// rows, the area below the last row, the area beneath the
// folder-file divider). Distinct intent from the row menu — these are
// "act on the current folder" not "act on a selection."
const backgroundMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];
  const canCreate = !!authStore.user?.perm.create;

  if (canCreate) {
    items.push({
      label: "New folder",
      icon: "folder-plus",
      kbd: "N",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("newDir");
      },
    });
    items.push({
      label: "New file",
      icon: "file-plus",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("newFile");
      },
    });
    items.push({
      label: t("buttons.upload"),
      icon: "upload",
      kbd: "U",
      action: () => {
        hideContextMenu();
        uploadFunc();
      },
    });
  }

  // Paste only when the clipboard store has cut/copy contents. Items
  // were placed by the legacy "X" (cut) / "C" (copy) keyboard handlers
  // — Paste is the corresponding "V" intake. The `paste(event)` helper
  // already handles conflict resolution + clipboard reset for cut.
  if (clipboardStore.items.length > 0) {
    items.push({
      label: "Paste",
      icon: "clipboard",
      kbd: "⌘V",
      action: () => {
        hideContextMenu();
        // paste expects an event so we don't accidentally trigger from
        // an input; synthesize a non-input target.
        void paste(new Event("paste"));
      },
    });
  }

  if (items.length > 0) items.push({ type: "separator" });

  // "Sort by…" hops to the existing sort popover. The submenu support
  // ContextMenu doesn't currently have means we re-anchor the sort
  // menu where the context menu opened (close-enough), so the user
  // sees a continuous popover flow rather than a sudden teleport.
  items.push({
    label: "Sort by…",
    icon: "arrow-down-narrow-wide",
    action: () => {
      const { x, y } = contextMenuPos.value;
      hideContextMenu();
      sortMenuPos.value = { x, y };
      sortMenuShow.value = true;
    },
  });

  items.push({
    label: "Refresh",
    icon: "rotate-ccw",
    kbd: "R",
    action: () => {
      hideContextMenu();
      fileStore.reload = true;
    },
  });

  return items;
});

/** Active items array passed to the shared `<context-menu>` instance.
 *  Switches on `contextMenuMode`, set by `onListingContextMenu`. */
const contextMenuItems = computed<MenuItem[]>(() =>
  contextMenuMode.value === "row"
    ? rowMenuItems.value
    : backgroundMenuItems.value
);

/** Copy the given item's path to the system clipboard. Mirrors the
 *  InfoPane copy-path behavior (toast on success, silent on total
 *  failure) but uses the shared `copy({ text })` util from
 *  `@/utils/clipboard` which already handles secure-context fallback. */
const copyItemPath = async (item: ResourceItem) => {
  const path = item.path || item.url;
  if (!path) return;
  try {
    await copy({ text: path });
    $showSuccess(`Path copied: ${path}`);
  } catch {
    /* swallow — copy() already tried both APIs; nothing more to do */
  }
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

/* ── List virtualization layout (v1.3 S6-1) ──────────────────────────
   In list view the rows live inside a RecycleScroller that owns the
   scroll. The surrounding <section> must NOT also scroll (that would
   double-scroll), and #listing becomes a flex column so the recycler can
   flex to fill the height beneath the now-pinned column header. All of
   this is gated behind the virtual-mode flag classes, so grid + gallery
   keep their native section scroll + showLimit windowing untouched. */
.scroll-section--virtual {
  overflow: hidden;
}

#listing.listing--virtual {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  /* Override the tall default min-height (id-specificity) so the column
     can actually shrink to its flex track and hand the recycler a
     bounded height to virtualize against. */
  min-height: 0;
}

.listing-virtual {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  /* Keep row width steady as the scrollbar appears; on macOS overlay
     scrollbars this reserves 0px so the header + rows stay pixel-aligned. */
  scrollbar-gutter: stable;
}

/* The recycler wraps each row in an absolutely-positioned item-view (its
   own BFC). Drop the row's 2px margins there and let the fixed 44px
   item-size supply the rhythm: a 40px row sits atop a 4px gap — visually
   identical to the non-virtual list, but deterministic regardless of
   margin-collapse quirks. */
#listing.list :deep(.vue-recycle-scroller__item-view > .item) {
  margin: 0;
}

/* ── Pull-to-refresh (v1.3 S7-1) ─────────────────────────────────────
   The <section> hosts the indicator; it's only ever shown mid-gesture,
   when scrollTop is pinned at 0, so absolute top:0 sits at the visible
   top. Tracks the finger 1:1 while pulling (no transition); animates the
   snap-back / hold once released. */
.ptr-host {
  position: relative;
}

.ptr-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 30;
  pointer-events: none;
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}
.ptr-indicator--pulling {
  transition: none;
}

.ptr-indicator__pill {
  margin-top: 8px;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full, 9999px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface, #fff);
  color: var(--color-accent, #5e6ad2);
  border: 1px solid var(--color-line, #ececec);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
}

.ptr-indicator__spin--active {
  animation: ptr-spin 0.8s linear infinite;
}

@keyframes ptr-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ptr-indicator {
    transition: none;
  }
  .ptr-indicator__spin--active {
    animation: none;
  }
}

/* ── Drag-select lasso (v1.3 S4-3) ────────────────────────────────────
   Teleported to <body>, so the rule is :global — scoped hashing would
   never match a body-level node. Fixed-position rectangle with an
   accent fill + ring. pointer-events:none so it never intercepts the
   mousemove/up that drive the marquee. */
:global(.drag-lasso) {
  position: fixed;
  z-index: 900;
  pointer-events: none;
  border: 1px solid var(--color-accent, #5e6ad2);
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  border-radius: 2px;
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

/* ── Current-folder drop zone (v1.3 H11) ──────────────────────────────
   Appears beneath the rows during an active internal drag whose source
   isn't this folder. Gives the user a generous, unmissable safe area
   to drop INTO the current directory — especially valuable in
   folder-heavy listings where every row above resolves to a SUBfolder.

   • Default state: subtle dashed outline, muted text — visible but
     quiet so it reads as a guide, not a CTA.
   • Hover (--active): accent-tinted fill + solid ring + bold copy.
   • min-height is sized so it dominates the viewport's lower half even
     on short listings; users don't have to aim precisely. */
.current-folder-dropzone {
  margin: 12px 12px 24px;
  min-height: 220px;
  border-radius: 12px;
  border: 1.5px dashed var(--color-line-strong, #d4d4d8);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
  text-align: center;
  padding: 16px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    box-shadow 120ms ease;
  /* Defensive: ensure dragenter/leave fire only on this wrapper, not
     on its decorative children — prevents flicker as the cursor moves
     between the icon and the label. */
}
.current-folder-dropzone__inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.current-folder-dropzone__inner strong {
  color: var(--color-ink-2, #52525b);
  font-weight: 600;
}
.current-folder-dropzone--active {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  border-color: var(--color-accent, #5e6ad2);
  border-style: solid;
  color: var(--color-accent, #5e6ad2);
  box-shadow: inset 0 0 0 1px var(--color-accent, #5e6ad2);
}
.current-folder-dropzone--active .current-folder-dropzone__inner strong {
  color: var(--color-accent, #5e6ad2);
}
html.dark .current-folder-dropzone {
  border-color: var(--color-line-strong, #3f3f46);
}

/* Parent-folder ↑ button (H5). Inline with the FOLDER eyebrow label so
   the visual weight matches the eyebrow's quiet caps treatment — small,
   muted by default, accent-tinted on hover. Same destination as the
   F2 spring-load on this section title; this is the click affordance
   for users who don't drag-hover. */
.parent-up-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.parent-up-btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-accent, #5e6ad2);
}

.parent-up-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
  color: var(--color-accent, #5e6ad2);
}

/* Current-folder favorites star (v1.3 S3-2). Sits next to the
   parent-up button; matches its visual weight. Amber tint when
   active so pinned folders read distinctly. */
.current-fav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.current-fav-btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--tag-color-amber-fg, #b45309);
}

.current-fav-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.current-fav-btn--active {
  /* Warm favorite gold — matches the sidebar favorite stars (was the amber
     tag token, a dark brown in light mode). */
  color: #f59e0b;
}

.current-fav-btn--active:hover {
  background: rgba(245, 158, 11, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .parent-up-btn,
  .current-fav-btn {
    transition: none;
  }
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
  background: var(--accent-gradient);
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
  background: var(--accent-gradient-strong);
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
