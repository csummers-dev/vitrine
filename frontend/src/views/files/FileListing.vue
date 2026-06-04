<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Primary column (V2-J): hero + scrolling listing + bottom breadcrumb
           bar, stacked. The details rail (InfoPane) sits beside it as a
           full-height sibling. -->
      <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
        <!-- V2-J unified hero: title (left) + adaptive control cluster (right).
             Replaces the dissolved top header bar; always rendered so the
             controls never flash out during a folder load. The title block is
             also the parent-folder drop / spring-load target (F2). -->
        <div class="fb-hero">
          <!-- Mobile: open the sidebar drawer (no top bar to host it). -->
          <button
            type="button"
            class="fb-hero__menu hidden max-sm:inline-flex"
            aria-label="Open navigation menu"
            title="Open menu"
            @click="mobileNav.open"
          >
            <Icon name="menu" :size="18" />
          </button>

          <div
            v-if="!layoutStore.loading && fileStore.req && fileStore.req.isDir"
            class="section-title fb-hero__title"
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
                class="text-[22px] font-semibold leading-tight truncate max-md:text-[18px]"
                :class="{ 'headline-gradient': !currentFolderAlias }"
              >
                <span :class="{ 'headline-gradient': currentFolderAlias }">{{
                  folderTitle
                }}</span
                ><span
                  v-if="currentFolderAlias"
                  class="folder-alias"
                  :title="`Favorite display name: ${currentFolderAlias}`"
                  >({{ currentFolderAlias }})</span
                >
              </h1>
              <div
                class="mt-1 text-[13px] text-ink-3 tabular max-md:text-[12px]"
              >
                {{ folderMeta }}
              </div>
            </div>
          </div>
          <div v-else class="fb-hero__title"></div>

          <!-- Control cluster — single adaptive row. Share + Download collapse
               into the ⋯ More menu to save space (V2-J). -->
          <div class="fb-hero__cluster">
            <search />
            <div class="w-px h-5 bg-line mx-1 max-md:hidden"></div>
            <div
              class="h-7 p-0.5 rounded-md border border-line bg-surface flex items-center"
            >
              <button
                @click="setView('list')"
                :class="[
                  'h-6 w-7 rounded flex items-center justify-center transition',
                  viewMode === 'list'
                    ? 'bg-elevated text-[var(--c-blue)] shadow-sm'
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
                    ? 'bg-elevated text-[var(--c-blue)] shadow-sm'
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
                    ? 'bg-elevated text-[var(--c-blue)] shadow-sm'
                    : 'text-ink-3 hover:text-ink-1',
                ]"
                title="Gallery"
                aria-label="Gallery view"
              >
                <Icon name="image" :size="14" />
              </button>
            </div>
            <button
              class="h-7 px-2 min-w-[110px] max-md:min-w-0 max-md:w-7 max-md:h-7 max-md:px-0 max-md:justify-center rounded-md border border-line bg-surface hover:bg-elevated inline-flex items-center justify-center gap-1.5 text-[13px] text-ink-2 transition"
              @click.stop="openSortMenu"
              :title="`Sort: ${sortLabel}`"
              :aria-label="`Sort: ${sortLabel}`"
            >
              <Icon
                name="arrow-up-down"
                :size="14"
                class="text-[var(--c-green)]"
              />
              <span class="max-md:hidden">{{ sortLabel }}</span>
            </button>
            <context-menu
              :show="sortMenuShow"
              :pos="sortMenuPos"
              :items="sortMenuItems"
              @hide="sortMenuShow = false"
            />
            <button
              class="h-7 w-7 rounded-md border border-line bg-surface hover:bg-elevated inline-flex items-center justify-center transition"
              @click="toggleSortDirection"
              :title="`Sort direction: ${sortDirLabel}`"
              :aria-label="`Sort direction: ${sortDirLabel}`"
            >
              <Icon
                :name="sortDirIcon"
                :size="14"
                class="text-[var(--c-blue)]"
              />
            </button>
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
            <button
              v-if="headerButtons.upload"
              class="h-7 px-2.5 max-md:w-7 max-md:h-7 max-md:px-0 max-md:justify-center rounded-md btn-accent-gradient text-white text-[13px] font-medium flex items-center gap-1.5 shadow-sm transition"
              @click="uploadFunc"
              :title="t('buttons.upload')"
              :aria-label="t('buttons.upload')"
            >
              <Icon name="upload" :size="14" />
              <span class="max-md:hidden">{{ t("buttons.upload") }}</span>
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
        <section
          ref="scrollSection"
          class="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto ptr-host"
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
            v-if="isMobile && fileStore.selectedCount > 0"
            id="file-selection"
            :class="{
              'file-selection-margin-bottom': fileStore.multiple,
            }"
          >
            <span>
              {{ t("prompts.filesSelected", fileStore.selectedCount) }}
            </span>
            <!-- Opt-in details toggle (mobile). The InfoPane sheet no longer
               pops on its own when an item is selected; the user expands it
               here when they actually want metadata. -->
            <button
              type="button"
              class="action"
              title="Details"
              aria-label="Details"
              @click="layoutStore.mobileDetailsOpen = true"
            >
              <Icon name="info" :size="18" />
            </button>
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
                (fileStore.req?.numDirs ?? 0) +
                  (fileStore.req?.numFiles ?? 0) ==
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
              :class="[
                viewMode,
                {
                  'listing--virtual': isListVirtual,
                  'is-touch': isTouchDevice,
                },
              ]"
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
                  <div
                    class="listing-section listing-section--dirs"
                    data-clear-on-click="true"
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
                  <!-- V3-C #24: colorful action icons on the dark pill (labels
                       stay white). Bright 300/400 hues read well on the inverse
                       surface in both themes. -->
                  <Icon name="download" :size="14" class="text-sky-400" />
                  <span>{{ t("buttons.download") }}</span>
                </button>
                <button
                  v-if="headerButtons.copy"
                  @click="layoutStore.showHover('copy')"
                  :title="t('buttons.copyFiles')"
                >
                  <Icon name="copy" :size="14" class="text-teal-300" />
                  <span>{{ t("buttons.copyFiles") }}</span>
                </button>
                <button
                  v-if="headerButtons.move"
                  @click="layoutStore.showHover('move')"
                  :title="t('buttons.moveFiles')"
                >
                  <Icon name="forward" :size="14" class="text-indigo-300" />
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
                  <Icon name="pencil" :size="14" class="text-amber-400" />
                  <span>Rename</span>
                </button>
                <!-- 1.6.0: batch-edit ID3/Vorbis tags across the audio files in
                   the selection. Only fields changed in the editor are applied
                   to all of them. -->
                <button
                  v-if="canBulkEditTags"
                  @click="layoutStore.showHover('audio-tags')"
                  :title="`Edit tags on ${bulkAudioCount} audio files`"
                >
                  <Icon name="music" :size="14" class="text-fuchsia-300" />
                  <span>Edit tags</span>
                </button>
                <button
                  v-if="headerButtons.delete"
                  @click="layoutStore.showHover('delete')"
                  class="multiple-selection__danger"
                  :title="t('buttons.delete')"
                >
                  <Icon name="trash-2" :size="14" class="text-rose-400" />
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
        <!-- V2-J: directory breadcrumb path — bottom of the primary column,
             left-aligned, border/background hugging the path text only (no
             item count). Listing pages only (absent on preview + settings). -->
        <div class="fb-breadcrumb-bar">
          <div class="fb-breadcrumb-bar__crumbs">
            <breadcrumbs base="/files" />
          </div>
        </div>
      </div>
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
import { useRootLabel } from "@/composables/useRootLabel";
import { usePreferences } from "@/composables/usePreferences";
import { useFolderScrollMemory } from "@/composables/useFolderScrollMemory";
import { useTagPicker } from "@/composables/useTagPicker";
import { useFavoriteTitleDialog } from "@/composables/useFavoriteTitleDialog";
import { useBulkRename } from "@/composables/useBulkRename";
import { useDragSelect } from "@/composables/useDragSelect";
import { useListingGrid } from "@/composables/useListingGrid";
import { useListingNavigation } from "@/composables/useListingNavigation";
import { useTouchDevice } from "@/composables/useTouchDevice";
import { usePullToRefresh } from "@/composables/usePullToRefresh";
import { copy } from "@/utils/clipboard";
import { applySecondarySort } from "@/utils/secondarySort";

import { users, files as api } from "@/api";
import { enableExec, unzipEnabled } from "@/utils/constants";
import { isExtractable } from "@/utils/archive";
import { isAudioTaggable } from "@/utils/audio";
import { TypeaheadSession } from "@/utils/typeahead";
import { moveDragBadge, endDragBadge } from "@/utils/dragCopyMoveBadge";
import * as upload from "@/utils/upload";
import { throttle } from "lodash-es";
import { Base64 } from "js-base64";
import dayjs from "dayjs";
// v1.3 S6-1: fixed-size list virtualization for huge folders.
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

import { useMobileNav } from "@/composables/useMobileNav";
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
import { startTransfer } from "@/utils/transfers";

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
// V2-J: the mobile hamburger lives in the hero now (no top header bar).
const mobileNav = useMobileNav();
// S4-1: shared open-state for the TagPickerSheet so the row context
// menu can open it from outside InfoPane.
const tagPicker = useTagPicker();
// Shared open-state for the favorites display-title editor, opened from the
// row context menu + the section ⋯ menu (both gated on the folder being pinned).
const favTitleDialog = useFavoriteTitleDialog();
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

// WS10: the bare-key view/action shortcuts (1 / 2 / 3 / n / u / e / r) were
// removed. Those actions now live in the command palette (⌘K) and the ⋯ menu.
// The listing keeps only the Finder-style navigation keys, handled directly in
// `keyEvent` below (arrows, Home/End, type-ahead, Enter, ⌘A, Esc).

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

// Retract the mobile details sheet whenever the selection empties — covers
// deselect-all AND navigation (the route watcher clears `selected`), so a
// stale sheet never lingers over the next folder.
watch(
  () => fileStore.selectedCount,
  (n) => {
    if (n === 0) layoutStore.mobileDetailsOpen = false;
  }
);
// v1.3 S6-1: RecycleScroller instance for the virtualized list view.
// Held so we can scroll a previously-opened item back into view when the
// user navigates back from a preview (the recycler's analog of the
// non-virtual `revealPreviousItem` querySelector + scrollIntoView).
const listScroller = ref<{ scrollToItem: (index: number) => void } | null>(
  null
);

// ── Remember scroll position across navigations (per-user pref) ─────────
// The scrolling element differs by view: the list view uses RecycleScroller's
// own scroller; grid/gallery scroll `scrollSection`. Capture/restore both —
// writing scrollTop to the non-scrolling one is a harmless no-op.
const scrollEls = (): HTMLElement[] => {
  const els: HTMLElement[] = [];
  if (scrollSection.value) els.push(scrollSection.value);
  const rec = (listScroller.value as { $el?: HTMLElement } | null)?.$el;
  if (rec && rec !== scrollSection.value) els.push(rec);
  return els;
};

// Per-user "remember position when navigating back" preference (default on).
// When enabled, returning to a folder you were recently in — even across a
// sideways jump to an unrelated directory — restores its scroll position, and a
// same-folder reload (e.g. after an upload finishes) keeps your place instead
// of snapping to the top. A per-folder memory (not a single slot) so either
// side of an A → B → A round trip restores. We record the leaving folder's
// position pre-render (rows still mounted) and restore it on arrival (the `req`
// watcher below).
const rememberParentScroll = computed<boolean>(() =>
  prefs.get<boolean>("nav.rememberParentScroll", true)
);
const folderScroll = useFolderScrollMemory(() => rememberParentScroll.value);

watch(
  () => layoutStore.loading,
  (loading) => {
    // A listing fetch is starting → snapshot the folder we're leaving while its
    // rows are still mounted (so scrollTop is valid). This also captures the
    // position before a same-folder reload. Restoration happens on arrival.
    if (!loading) return;
    const top = Math.max(0, ...scrollEls().map((e) => e.scrollTop));
    folderScroll.record(fileStore.req?.path ?? null, top);
  }
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

// ── Finder-style keyboard navigation (arrows / type-ahead / Enter). Wired into
//    `keyEvent` below. WS10 removed Quick Look (Space) entirely. ───────────────

// Full visual order (folders then files). Mirrors what the user sees; each item
// carries its `req.items` index, which is what `selected`/`activeIndex` store.
const orderedItems = computed<ResourceItem[]>(() => [
  ...items.value.dirs,
  ...items.value.files,
]);

// Scroll the row/tile with the given req-index into view across all three
// virtualized views (list recycler / windowed grid + gallery).
const scrollActiveIntoView = (reqIndex: number) => {
  void nextTick(() => {
    const sc = scrollSection.value;
    if (!sc) return;
    const sel = `[data-index="${reqIndex}"]`;
    const found = sc.querySelector(sel) as HTMLElement | null;
    if (found) {
      found.scrollIntoView({ block: "nearest" });
      return;
    }
    if (viewMode.value === "list") {
      const pos = listRows.value.findIndex((r) => r.item?.index === reqIndex);
      if (pos >= 0) listScroller.value?.scrollToItem(pos);
      return;
    }
    // Grid/gallery target windowed-out of the DOM: jump proportionally, then
    // settle precisely once the freshly-rendered tile exists.
    const order = orderedItems.value;
    const vpos = order.findIndex((it) => it.index === reqIndex);
    if (vpos < 0) return;
    const frac = order.length > 1 ? vpos / (order.length - 1) : 0;
    sc.scrollTop = frac * Math.max(0, sc.scrollHeight - sc.clientHeight);
    requestAnimationFrame(() => {
      (sc.querySelector(sel) as HTMLElement | null)?.scrollIntoView({
        block: "nearest",
      });
    });
  });
};

const listingNav = useListingNavigation({
  ordered: () => orderedItems.value,
  columnsFor: (it) =>
    it.isDir ? listingGrid.dirsCols.value : listingGrid.filesCols.value,
  grid: () => viewMode.value !== "list",
  reveal: scrollActiveIntoView,
});

// Enter → open the focused item (folder navigates in, file opens its preview).
// Falls back to the first selected item so Enter works after a plain click too.
const openActiveItem = () => {
  let idx = fileStore.activeIndex;
  if (idx < 0 && fileStore.selected.length > 0) idx = fileStore.selected[0];
  const it = idx >= 0 ? fileStore.req?.items[idx] : null;
  if (it) void router.push({ path: it.url });
};

// Type-ahead select: printable keys jump the selection to a matching name.
// Tapping one letter repeatedly cycles through same-prefixed siblings; mixing
// letters builds a prefix that refines in place; the session resets after a
// short idle. All the matching/cycle logic lives in (and is unit-tested via)
// utils/typeahead — a timestamp-guarded session, so a missed timer can never
// silently reset the prefix mid-typing.
const typeahead = new TypeaheadSession();
const typeaheadPush = (ch: string) => {
  const matchIndex = typeahead.push(
    ch,
    orderedItems.value,
    fileStore.activeIndex
  );
  if (matchIndex < 0) return;
  fileStore.selected = [matchIndex];
  fileStore.activeIndex = matchIndex;
  fileStore.anchorIndex = matchIndex;
  scrollActiveIntoView(matchIndex);
};

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

// Custom label for the files root ("My files"), set via the sidebar's
// right-click rename. Falls back to the default at the root.
const { rootLabel } = useRootLabel();

const folderTitle = computed(() => {
  if (!fileStore.req) return "";
  return fileStore.req.name || rootLabel.value || t("sidebar.myFiles");
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

// The current folder's custom favorite display name (alias), if any — shown
// alongside the real folder name in the header so a renamed favorite is
// recognizable here too. Empty unless the folder is a favorite with a title,
// and suppressed when the alias would just echo the real name.
const currentFolderAlias = computed<string>(() => {
  const p = currentFolderPath.value;
  if (!p) return "";
  const alias = favoritesComposable.titleFor(p).trim();
  return alias && alias !== folderTitle.value ? alias : "";
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
    // Keep Favorites pointing at this folder (or descendants) pinned —
    // follow the rename so the sidebar link doesn't break.
    favoritesComposable.renamePath(oldUrl, newUrl);
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
  // Deliberately NOT showing a folder size: the filesystem only gives us the
  // directory's own inode size (a handful of bytes), not the recursive total
  // of its contents — which was misleading. Computing the real total means a
  // du-style walk of the whole subtree on every open, which isn't worth the
  // latency. Per-file sizes still show on the rows.
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

// 1.6.0 batch audio-tag editing — how many of the selected items are taggable
// audio files (MP3 / FLAC). Drives the bulk "Edit tags" entry points (pill +
// context menu). Non-audio items in a mixed selection are simply ignored; the
// editor operates on the audio subset and states the count it'll affect.
const bulkAudioCount = computed(() => {
  const req = fileStore.req;
  if (!req) return 0;
  let n = 0;
  for (const idx of fileStore.selected) {
    const item = req.items[idx];
    if (item && isAudioTaggable(item.name)) n++;
  }
  return n;
});
// Show the bulk action only for a genuine multi-file batch (≥2 audio files);
// a single selected audio file already gets the inline "Edit tags…" path.
const canBulkEditTags = computed(
  () =>
    fileStore.selectedCount > 1 &&
    bulkAudioCount.value >= 2 &&
    !!authStore.user?.perm.modify
);

const isMobile = computed(() => {
  return width.value <= 736;
});

watch(req, () => {
  // New folder data → abandon any in-progress type-ahead prefix.
  typeahead.reset();
  nextTick(() => {
    // "Remember position" (pref): if we have a remembered scroll position for
    // the folder we just arrived at (a return visit, or a same-folder reload),
    // restore it — this supersedes the centering reveal below. Null otherwise.
    const restoreTop = folderScroll.recall(fileStore.req?.path ?? null);
    if (restoreTop !== null) {
      // Grid/gallery: measure first so tile heights (and thus the pixel
      // offset) are valid before we set scrollTop.
      if (!isListVirtual.value) {
        listingGrid.measure();
        listingGrid.update();
      }
      requestAnimationFrame(() => {
        for (const el of scrollEls()) el.scrollTop = restoreTop;
        if (!isListVirtual.value) listingGrid.update();
      });
      return;
    }

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
  document.addEventListener("dragover", onDragScrollOver);
  document.addEventListener("dragenter", dragEnter);
  document.addEventListener("dragleave", dragLeave);
  document.addEventListener("drop", drop);
  document.addEventListener("drop", stopDragScroll);
  document.addEventListener("dragend", stopDragScroll);
  // Safety net for the Copy/Move badge: the source row's dragend normally
  // tears it down, but spring-load navigation can unmount that row mid-drag,
  // so end it at the document level too (idempotent).
  document.addEventListener("drop", endDragBadge);
  document.addEventListener("dragend", endDragBadge);
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
  document.removeEventListener("dragover", onDragScrollOver);
  document.removeEventListener("dragenter", dragEnter);
  document.removeEventListener("dragleave", dragLeave);
  document.removeEventListener("drop", drop);
  document.removeEventListener("drop", stopDragScroll);
  document.removeEventListener("dragend", stopDragScroll);
  document.removeEventListener("drop", endDragBadge);
  document.removeEventListener("dragend", endDragBadge);
  stopDragScroll();
  endDragBadge();
});

const base64 = (name: string) => Base64.encodeURI(name);

const keyEvent = (event: KeyboardEvent) => {
  // No prompts are shown
  if (layoutStore.currentPrompt !== null) {
    return;
  }

  if (event.key === "Escape") {
    // Reset files selection + keyboard cursor.
    fileStore.selected = [];
    fileStore.activeIndex = -1;
    fileStore.anchorIndex = -1;
    typeahead.reset();
  }

  // ── Finder-style keyboard navigation (arrows / Home / End / Enter /
  //    type-ahead). WS10 removed the bare-key Delete/F2/Space actions + the
  //    global dispatcher shortcuts; these navigation keys are the only ones the
  //    listing still owns. Non-modifier keys, handled BEFORE the ctrl/meta
  //    guard below, and skipped while typing in a field. ────────────────────
  {
    const navTarget = event.target as HTMLElement | null;
    const navTag = navTarget?.tagName?.toLowerCase();
    const typing =
      navTag === "input" ||
      navTag === "textarea" ||
      navTarget?.isContentEditable === true;
    const noChord = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!typing && noChord) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          listingNav.move("down", event.shiftKey);
          return;
        case "ArrowUp":
          event.preventDefault();
          listingNav.move("up", event.shiftKey);
          return;
        case "ArrowRight":
          event.preventDefault();
          listingNav.move("right", event.shiftKey);
          return;
        case "ArrowLeft":
          event.preventDefault();
          listingNav.move("left", event.shiftKey);
          return;
        case "Home":
          event.preventDefault();
          listingNav.move("home", event.shiftKey);
          return;
        case "End":
          event.preventDefault();
          listingNav.move("end", event.shiftKey);
          return;
        case "Enter":
          event.preventDefault();
          openActiveItem();
          return;
        case "/":
          // V2 #3: "/" reloads the current folder (was the "R" shortcut). Sits
          // before the type-ahead default so it isn't swallowed as a search key.
          event.preventDefault();
          fileStore.reload = true;
          return;
        default:
          // Type-ahead — printable single chars only, and not when the global
          // shortcut dispatcher already claimed the key (it ran first and
          // called preventDefault()).
          //
          // V3-C #25: a space joins the prefix ONLY mid-session (a name like
          // "My Doc" needs it), never as the first key — a leading space
          // matches nothing and Space owns no other bare-key action here
          // (WS10 removed Quick Look). `/\S/` still admits every printable
          // non-space char as a session starter.
          if (
            !event.defaultPrevented &&
            event.key.length === 1 &&
            (/\S/.test(event.key) ||
              (event.key === " " && typeahead.isActive()))
          ) {
            event.preventDefault();
            typeaheadPush(event.key);
            return;
          }
      }
    }
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
  // Trail the live Copy/Move badge with the cursor during a listing drag
  // (the badge element itself is created by the source row's dragstart). The
  // drop's copy/move decision reads the same ctrl/meta, so they stay in sync.
  if (fileStore.draggedItems.length > 0) {
    const e = event as DragEvent;
    moveDragBadge(e.ctrlKey || e.metaKey, e.clientX, e.clientY);
  }
};

// HTML5 (mouse) drag edge auto-scroll. Touch drag already auto-scrolls via
// useTouchDrag; this brings the same behavior to mouse dragging so that
// dragging a row (or OS files) toward the top/bottom edge gently scrolls the
// listing — making deep drops reachable without letting go. Targets the real
// scroll container (the recycler in list view, the <section> in grid/gallery)
// via ptrScrollEl, matching the touch path. Speed is intentionally gentler
// than touch ("not too quickly").
const DRAG_EDGE = 56; // px from an edge where auto-scroll engages
const DRAG_EDGE_SPEED = 8; // max px/frame (vs touch's 12)
let dragScrollY = 0; // latest pointer Y during a drag
let dragScrollDir = 0; // -1 = up, +1 = down, 0 = idle
let dragScrollRaf: number | null = null;

const dragScrollTick = () => {
  dragScrollRaf = null;
  const el = ptrScrollEl.value;
  if (!el || dragScrollDir === 0) return;
  const rect = el.getBoundingClientRect();
  // How far the pointer is *into* the edge band → proportional speed ramp,
  // so it eases in near the boundary and tops out at DRAG_EDGE_SPEED.
  // Clamp the "into the band" depth to DRAG_EDGE so the speed never exceeds
  // DRAG_EDGE_SPEED — the pointer can sit *past* the edge (over the header
  // above the list / a bar below it), which would otherwise ramp dy beyond the
  // cap and scroll faster than the intended gentle pace.
  let dy = 0;
  if (dragScrollDir < 0) {
    const into = Math.min(DRAG_EDGE, DRAG_EDGE - (dragScrollY - rect.top));
    if (into > 0) dy = -Math.ceil((into / DRAG_EDGE) * DRAG_EDGE_SPEED);
  } else {
    const into = Math.min(DRAG_EDGE, DRAG_EDGE - (rect.bottom - dragScrollY));
    if (into > 0) dy = Math.ceil((into / DRAG_EDGE) * DRAG_EDGE_SPEED);
  }
  if (dy !== 0) {
    el.scrollTop += dy;
    dragScrollRaf = requestAnimationFrame(dragScrollTick);
  } else {
    dragScrollDir = 0;
  }
};

const onDragScrollOver = (event: DragEvent) => {
  const el = ptrScrollEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  dragScrollY = event.clientY;
  // Only engage when the pointer is horizontally over the scroll area, so a
  // drag across the sidebar/info-pane doesn't scroll the listing.
  const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
  let dir = 0;
  if (insideX) {
    if (dragScrollY < rect.top + DRAG_EDGE) dir = -1;
    else if (dragScrollY > rect.bottom - DRAG_EDGE) dir = 1;
  }
  dragScrollDir = dir;
  if (dir !== 0 && dragScrollRaf === null) {
    dragScrollRaf = requestAnimationFrame(dragScrollTick);
  }
};

const stopDragScroll = () => {
  dragScrollDir = 0;
  if (dragScrollRaf !== null) {
    cancelAnimationFrame(dragScrollRaf);
    dragScrollRaf = null;
  }
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

  const isMove = clipboardStore.key === "x";
  const kind: "move" | "copy" = isMove ? "move" : "copy";

  // Run the paste through the SHARED background transfer — the same path the
  // move/copy tool and drag-drop use. The floating transfer dock then (a) shows
  // the progress notification the user expects and (b) refreshes the listing
  // when the job settles, so the pasted file becomes visible without a manual
  // reload. (Previously paste called api.move/api.copy directly: no dock, and
  // the refresh hung on a one-off `fileStore.reload` flag.) Per-item overwrite /
  // rename flags set during conflict resolution are carried through by
  // `startTransfer` → `toTransferItems`.
  const run = () => {
    if (items.length === 0) return;
    // Re-select EVERY pasted item in the destination (names are already
    // decoded) so the selection survives the post-transfer refresh.
    const destPathPrefix = removePrefix(route.path);
    fileStore.setPreselect(items.map((it) => destPathPrefix + it.name));
    void startTransfer(kind, items)
      .then(() => {
        // A cut+paste consumes the clipboard; a copy+paste keeps it so the
        // user can paste again somewhere else.
        if (isMove) clipboardStore.resetClipboard();
      })
      .catch($showError);
  };

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
      confirm: (ev: Event, result: Array<ConflictingResource>) => {
        ev.preventDefault();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const item = result[i];
          if (item.checked.length == 2) {
            items[item.index].rename = true;
          } else if (item.checked.length == 1 && item.checked[0] == "origin") {
            items[item.index].overwrite = true;
          } else {
            // Skipped (this is what "Skip all conflicting files" produces for
            // every row) — drop it from the batch.
            items.splice(item.index, 1);
          }
        }
        if (items.length > 0) {
          run();
        } else {
          // Every conflicting item was skipped, so there's nothing left to
          // transfer. Without this the dialog just closed silently and the
          // user had no idea whether anything happened (the reported bug).
          $showSuccess(
            `All conflicting items were skipped — nothing was ${
              isMove ? "moved" : "copied"
            }.`
          );
        }
      },
    });

    return;
  }

  run();
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
    // V3-B #4: never re-dim the active drop target. dragenter fires on every
    // child element the cursor crosses, so this runs repeatedly during a drag.
    // ListingItem.enterIntoZone set the hovered folder to opacity:1 and its
    // `inIntoZone` guard won't re-assert — so re-dimming it here is exactly
    // what made the highlighted folder flicker bright→dim. Skipping rows that
    // carry `item--drop-into` lets the highlight and the spring-load ring
    // coexist, while rows virtualized in mid-drag still get dimmed.
    if (file.classList.contains("item--drop-into")) return;
    (file as HTMLElement).style.opacity = "0.5";
  });
};

const dragLeave = () => {
  dragCounter.value--;

  if (dragCounter.value == 0) {
    resetOpacity();
    // The drag fully left the document. An OS-file drag that exits the window
    // without dropping fires neither `drop` nor `dragend` on us, so this is the
    // only signal to halt the edge auto-scroll rAF (otherwise it busy-loops).
    stopDragScroll();
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
    // Clear any lingering drop-into highlight (covers Esc-cancel while the
    // cursor was still inside a folder's into-zone).
    file.classList.remove("item--drop-into");
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
// View mode (list / grid / gallery) is a single PER-USER account preference,
// persisted server-side via `users.update` and mirrored locally through
// `authStore.updateUser`. It deliberately retains across folders — the chosen
// layout is the user's, not the folder's, so navigating around never resets it.
// (This replaces the old per-folder localStorage override.)
const persistViewMode = async (mode: ViewModeType) => {
  if (!authStore.user) return;
  const data = { id: authStore.user.id, viewMode: mode };
  try {
    await users.update(data, ["viewMode"]);
  } catch {
    // Failing to persist shouldn't block the visible switch — the optimistic
    // ref update below already applied it for this session.
  }
  authStore.updateUser(data);
};

const setView = async (mode: string) => {
  if (!authStore.user) return;
  if (viewMode.value === mode) return;
  layoutStore.closeHovers();
  viewMode.value = mode as ViewModeType; // optimistic — show immediately
  setItemWeight();
  fillWindow();
  void persistViewMode(mode as ViewModeType);
};

// Source of truth for the active layout. Seeded from the account default and
// kept in sync if that default changes elsewhere (command palette, Profile, or
// another tab via the auth store).
const viewMode = ref<ViewModeType>(authStore.user?.viewMode ?? "list");

watch(
  () => authStore.user?.viewMode,
  (mode) => {
    if (mode && mode !== viewMode.value) viewMode.value = mode;
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
    // Edit the sidebar Favorites alias for the CURRENT folder — only when it's
    // pinned (the title is meaningless otherwise). Sidebar-only; the real
    // folder is untouched.
    currentFolderFavorited.value
      ? {
          label: "Favorites display title…",
          icon: "star",
          action: () => favTitleDialog.open(currentFolderPath.value),
        }
      : null,
    // V2-J: Share + Download moved off the hero cluster into ⋯ to declutter.
    headerButtons.value.share
      ? {
          label: t("buttons.share"),
          icon: "share",
          action: () => layoutStore.showHover("share"),
        }
      : null,
    headerButtons.value.download
      ? {
          label: t("buttons.download"),
          icon: "download",
          action: download,
        }
      : null,
    { label: "Refresh", icon: "rotate-ccw", action: refresh, kbd: "/" },
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

// Sort direction is its own first-class toggle (rather than "re-click the
// active field to flip it," which read as a confusing swap). It persists
// per-user via user.sorting.asc — server-side, so it sticks across folders
// until the user changes it.
const sortDirIcon = computed(() =>
  ascOrdered.value ? "arrow-up-narrow-wide" : "arrow-down-wide-narrow"
);
const sortDirLabel = computed(() =>
  ascOrdered.value ? "Ascending" : "Descending"
);
const toggleSortDirection = () => {
  const by = (fileStore.req?.sorting.by ?? "name") as SortKey;
  void sortRaw(by, !ascOrdered.value);
};

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
  // V3-C #7: clicking the trigger again closes an open menu (toggle) instead of
  // forcing a click outside. `.stop` on the trigger hides this click from
  // ContextMenu's outside-click listener, so we have to toggle explicitly.
  if (sortMenuShow.value) {
    sortMenuShow.value = false;
    return;
  }
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
      // A check marks the active field; direction is owned by the dedicated
      // asc/desc toggle in the toolbar, so the menu no longer flips it.
      icon: primaryBy === opt.key ? "check" : undefined,
      action: () => {
        // Picking a field keeps the current direction; re-picking the active
        // field is a no-op (use the toolbar toggle to change direction).
        setPrimarySort(opt.key, primaryAsc);
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
    // Gallery folders use a narrower (smaller-tile) grid than files, so pull
    // the metrics for whichever section this item lives in.
    const isDirSec = sectionEl === dirsSectionRef.value;
    const cols =
      (isDirSec ? listingGrid.dirsCols.value : listingGrid.filesCols.value) ||
      1;
    const stride =
      (isDirSec ? listingGrid.dirsTileH.value : listingGrid.filesTileH.value) +
      12;
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
  // macOS synthesizes a `contextmenu` event from ctrl+left-click. Treat that
  // as a (multi-)select modifier, NOT a right-click: suppress both the custom
  // and the native menu so ctrl+drag can lasso and ctrl+click just toggles
  // selection (matching cmd+click) instead of popping a menu on first click.
  if (event.ctrlKey) {
    event.preventDefault();
    return;
  }
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
  // Favorites display title — only for a folder that's currently pinned, since
  // the title only shows in the sidebar Favorites section. Sets a sidebar-only
  // alias; never renames the real folder.
  if (
    singleItem &&
    singleItem.isDir &&
    favoritesComposable.isFavorited(singleItem.url)
  ) {
    const favPath = singleItem.url;
    items.push({
      label: "Favorites display title…",
      icon: "star",
      action: () => {
        hideContextMenu();
        favTitleDialog.open(favPath);
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
  // Edit audio tags (1.6.0) — single MP3 / FLAC file, requires modify perm.
  if (
    singleItem &&
    isAudioTaggable(singleItem.name) &&
    authStore.user?.perm.modify
  ) {
    items.push({
      label: "Edit tags…",
      icon: "music",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("audio-tags");
      },
    });
  } else if (canBulkEditTags.value) {
    // Batch variant — multiple audio files in the selection. The editor opens
    // blank and applies only the fields the user changes to all of them.
    items.push({
      label: `Edit tags on ${bulkAudioCount.value} files…`,
      icon: "music",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("audio-tags");
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
      // Folder-aware single-item label so a folder reads "Move folder", not
      // "Move file". Multi-select uses the neutral "N items" wording.
      label:
        sel === 1
          ? singleItem?.isDir
            ? "Move folder"
            : t("buttons.moveFile")
          : `Move ${sel} items…`,
      icon: "forward",
      action: () => {
        hideContextMenu();
        layoutStore.showHover("move");
      },
    });
  }
  if (hb.copy) {
    items.push({
      label:
        sel === 1
          ? singleItem?.isDir
            ? "Copy folder"
            : t("buttons.copyFile")
          : `Copy ${sel} items…`,
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
  /* 2.1 #1: fill the scroll section (now min-h-0-bounded) as a flex child,
     instead of a wrong `100vh - 8rem` constant. That constant predated the
     bottom breadcrumb bar and oversized the listing so its last rows ran under
     the bar; flex-fill leaves only the intended ~5px gap above the bar and lets
     the section's overflow scroll engage. Grid/gallery grow with content and
     the section scrolls; list view's RecycleScroller (.listing--virtual) keeps
     its own identical flex sizing below. */
  flex: 1 1 auto;
  min-height: 0;
}

/* Colorful download button in the folder header toolbar — blue-tinted so the
   "save this out" action reads as a real action next to the neutral Share /
   More buttons rather than flat grey chrome. */
.listing-download {
  color: var(--c-blue);
  border-color: color-mix(in srgb, var(--c-blue) 30%, var(--color-line));
  background: color-mix(in srgb, var(--c-blue) 10%, var(--color-surface));
}
.listing-download:hover {
  background: color-mix(in srgb, var(--c-blue) 18%, var(--color-surface));
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
  /* The global `#listing { padding: 0 1rem 1rem }` adds a 1rem bottom pad that
     suits grid/gallery (a margin under the last tile). But here #listing is a
     flex COLUMN whose RecycleScroller child flex-fills — so that bottom pad
     lands BELOW the scroller, shrinking its viewport and lifting the clip point
     ~16px off the breadcrumb (a persistent dead strip above the bar). Zero it
     so the scroller reaches the section's bottom edge; the breadcrumb bar's own
     5px top padding supplies the intended slim gap. Side padding is untouched
     (rows keep their 1rem inset). */
  padding-bottom: 0;
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
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
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
  border-radius: 8px;
  margin: 0 4px;
}
.section-title--drop {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  box-shadow: inset 0 0 0 2px var(--color-accent, #5e6ad2);
}

/* ── V2-J unified hero (title + control cluster) ─────────────────────────
   Replaces the dissolved top header bar. No border/box — it flows straight
   off the top of the primary column so the sidebar → primary → details rail
   read as one continuous surface. */
.fb-hero {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
  /* Positioning context for the active search overlay (#search.active in
     header.css), so when the search expands it floats over this header row
     instead of pushing the title + toolbar. */
  position: relative;
}
@media (max-width: 768px) {
  .fb-hero {
    padding: 12px 16px 10px;
    flex-wrap: wrap;
  }
}
.fb-hero__menu {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-2, #52525b);
  flex-shrink: 0;
  margin-left: -4px;
  transition: background-color var(--dur-base) ease;
}
.fb-hero__menu:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}
/* `.section-title` already supplies the drop-target radius/transition; the
   hero title just needs to flex + truncate. */
.fb-hero__title {
  flex: 1 1 auto;
  min-width: 0;
}
.fb-hero__cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ── V2-J bottom breadcrumb bar (listing pages only) ─────────────────────
   The chrome (border + tint) hugs the path text only; the rest of the strip
   stays transparent so it doesn't read as a boxed footer. */
.fb-breadcrumb-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  /* V3-C #8 (revised): keep the original ~10px distance from the bottom of the
     screen, and make the gap ABOVE the bar — between the end of the listing
     area and the crumbs pill — a slim ~5px. */
  padding: 5px 16px 10px;
  min-width: 0;
}
.fb-breadcrumb-bar__crumbs {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
}

/* Favorite display-name shown beside the real folder name in the header,
   e.g. "Documents (Work)". Deliberately smaller + muted so it reads as a
   secondary alias, not part of the folder name. */
.folder-alias {
  margin-left: 8px;
  font-size: 0.62em;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--color-ink-3, #a1a1aa);
  vertical-align: baseline;
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
    background-color var(--dur-base) ease,
    border-color var(--dur-base) ease,
    color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
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
  /* Colorful-UI: a blue navigation tint (matches the breadcrumb home glyph)
     so the parent-up affordance reads as a nav control, not muted chrome. */
  color: var(--c-blue, #3b82f6);
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.parent-up-btn:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--c-blue, #3b82f6);
  filter: brightness(0.94);
}

.parent-up-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
  color: var(--c-blue, #3b82f6);
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
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.folder-rename-input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}
</style>
