<template>
  <div
    class="item"
    :class="{ 'item--spring-loaded': springProgress > 0, 'item--cut': isCut }"
    role="button"
    tabindex="0"
    :draggable="isDraggable && !isRenaming"
    @dragstart="dragStart($event)"
    @dragend="dragEnd"
    @dragenter="onDragEnter"
    @dragover="dragOver"
    @dragleave="onDragLeave"
    @drop="drop"
    @pointerdown="onRowPointerDown"
    :data-drop-url="isDir && !readOnly ? url : undefined"
    @click="itemClick"
    @mousedown="handleMouseDown"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :data-dir="isDir"
    :data-type="type"
    :data-index="index"
    :aria-label="name"
    :aria-selected="isSelected"
    :data-ext="getExtension(name).toLowerCase()"
    @contextmenu="contextMenu"
  >
    <!-- Selection checkbox. On its own click handler (stop-propagation) so it
         toggles selection WITHOUT triggering the row's open — the only way to
         multi-select on touch, where a plain row tap now opens the item. -->
    <div class="item__select" @click.stop="onSelectClick">
      <div v-if="isSelected" class="item__checkbox item__checkbox--checked">
        <Icon
          name="check"
          :size="11"
          :stroke-width="3.5"
          style="color: white"
        />
      </div>
      <div v-else class="item__checkbox"></div>
    </div>

    <!-- Name cell: icon squircle + name (inline) -->
    <div class="item__name">
      <div class="item__icon" :class="iconColorClass">
        <!-- Native lazy load (not v-lazy): vue-lazyload swaps the failing URL
             for its own error placeholder and never re-dispatches the native
             `error` event, so a 501 (e.g. audio with no embedded cover) left an
             empty tile instead of falling back to the icon. A plain <img> with
             `loading="lazy"` fires the real error event → onThumbError. Rows are
             already virtualized, so the <img> only mounts when near-visible. -->
        <img
          v-if="showThumbnail"
          :src="thumbnailUrl"
          loading="lazy"
          decoding="async"
          class="item__thumb"
          @error="onThumbError"
        />
        <!-- Inner wrapper: display:contents in list/grid (layout-transparent),
             becomes a visible squircle in gallery for non-folder/non-image files -->
        <div v-else class="item__icon-inner">
          <Icon :name="iconName" :size="16" :stroke-width="1.6" />
        </div>
        <!-- Spring-load progress ring (F6): renders only while a drag is
             hovering this folder, fills clockwise over 3s, then we
             navigate into the folder. V2: ONLY the filling arc is drawn —
             the full scrim disc + track circle are gone (they read as a dark
             ring sitting over the folder icon). -->
        <svg
          v-if="springProgress > 0"
          class="item__spring-ring"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <circle
            class="item__spring-ring-fill"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="100.53"
            :stroke-dashoffset="100.53 * (1 - springProgress)"
            transform="rotate(-90 18 18)"
          />
        </svg>
      </div>
      <div class="item__name-stack">
        <!-- Inline rename (Stage 8): when this row is the rename target,
             the name renders as an editable input in place. -->
        <input
          v-if="isRenaming"
          ref="renameInputEl"
          v-model.trim="renameValue"
          class="item__name-text item__rename-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          @click.stop
          @mousedown="onRenameMouseDown"
          @keydown.enter.prevent.stop="submitRename"
          @keydown.esc.prevent.stop="cancelRename"
          @blur="onRenameBlur"
        />
        <span
          v-else
          class="item__name-text name"
          :class="{ 'is-moving': isMoving }"
          ><span class="item__name-glyph">{{ displayedName }}</span></span
        >
        <div class="item__name-compact-meta">
          <time :datetime="modified">{{ humanTime() }}</time>
          <span v-if="!isDir"> · {{ humanSize() }}</span>
        </div>
      </div>
      <!-- V2 #23: tags render as colour dots (not inline chips), right-aligned
           against the Modified column, ordered alphabetically by name; hovering
           a dot shows the tag name. Tags come from the pre-batched listing
           fetch in FileListing.vue, so this is a pure prop read. Hidden when the
           user opts out via the "Show tags on rows" Profile toggle. -->
      <div
        v-if="sortedTags.length > 0 && showTagsOnRows"
        class="item__tag-dots"
        aria-label="Tags"
      >
        <span
          v-for="t in sortedTags"
          :key="t.id"
          class="item__tag-dot"
          :style="{ background: `var(--tag-color-${t.color}-fg)` }"
          :title="t.name"
        ></span>
      </div>
    </div>

    <!-- Meta wrapper: display:contents in list mode (so children become grid items),
         flex row in mosaic mode (so size · modified appear inline; CSS order swaps them) -->
    <div class="item__meta">
      <!-- Modified -->
      <div class="item__modified modified">
        <time :datetime="modified">{{ humanTime() }}</time>
      </div>

      <!-- Size -->
      <div v-if="isDir" class="item__size size" data-order="-1">
        <template v-if="dirSizeLabel">{{ dirSizeLabel }}</template>
        <template v-else>&mdash;</template>
      </div>
      <div v-else class="item__size size" :data-order="humanSize()">
        {{ humanSize() }}
      </div>
    </div>

    <!-- Actions menu trigger -->
    <div class="item__actions">
      <!-- Favorite star (v1.3 S3-2). Folders only. Hover-visible
           when not favorited; permanently visible (filled) when
           favorited so the user can find their pins at a glance. -->
      <button
        v-if="isDir"
        class="item__fav-btn"
        :class="{ 'item__fav-btn--active': isFavorited }"
        :title="isFavorited ? 'Remove from Favorites' : 'Add to Favorites'"
        :aria-label="isFavorited ? 'Remove from Favorites' : 'Add to Favorites'"
        :aria-pressed="isFavorited"
        @click.stop="onFavoriteToggle"
      >
        <Icon
          :name="isFavorited ? 'star' : 'star'"
          :size="13"
          :stroke-width="isFavorited ? 0 : 1.8"
          :fill="isFavorited ? 'currentColor' : 'none'"
        />
      </button>
      <!-- v2.7 quick actions: Share + Download on FILE tiles, hover-revealed
           in grid + gallery only (the list view keeps calm rows — its context
           menu already covers both). Same corner-chip styling as the star. -->
      <button
        v-if="!isDir && canShare"
        class="item__actions-btn item__quick-btn"
        title="Share"
        :aria-label="`Share ${name}`"
        @click.stop="onQuickShare"
      >
        <Icon name="share-2" :size="13" :stroke-width="1.8" />
      </button>
      <button
        v-if="!isDir && canDownload"
        class="item__actions-btn item__quick-btn"
        title="Download"
        :aria-label="`Download ${name}`"
        @click.stop="onQuickDownload"
      >
        <Icon name="download" :size="13" :stroke-width="1.8" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import UndoToast from "@/components/UndoToast.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { usePanesStore } from "@/stores/panes";
import { usePaneContext } from "@/composables/usePaneContext";
import { useLayoutStore } from "@/stores/layout";
import { useTagsStore } from "@/stores/tags";
import { usePreferences } from "@/composables/usePreferences";
import { useFavorites } from "@/composables/useFavorites";
import { useImageHoverPreview } from "@/composables/useImageHoverPreview";
import { startTransfer, isPathInMove } from "@/utils/transfers";
import { useTransfers } from "@/composables/useTransfers";
import { useTouchDevice } from "@/composables/useTouchDevice";

import {
  enableThumbs,
  enableVideoThumbs,
  enablePdfThumbs,
} from "@/utils/constants";
import { filesize } from "@/utils";
import { displayName, splitExtension } from "@/utils/filename";
import { isSelfOrDescendantTarget } from "@/utils/dragdrop";
import { resolveRowDropMode } from "@/utils/dropZone";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { setDragGhost } from "@/utils/dragGhost";
import { startDragBadge, endDragBadge } from "@/utils/dragCopyMoveBadge";
import dayjs from "dayjs";
import { files as api } from "@/api";
import { removePrefix } from "@/api/utils";
import { useFolderSizes } from "@/composables/useFolderSizes";
import urlUtil from "@/utils/url";
import * as upload from "@/utils/upload";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
const touches = ref<number>(0);

const $showError = inject<IToastError>("$showError")!;
const $toast = useToast();

// ── Quick actions on file tiles (v2.7) ───────────────────────────────
// Share opens the existing SharePanel with a row-scoped `override` (the same
// mechanism pane B uses), so it never reads the pane's selection. Download
// navigates to the raw URL directly — no dialog needed for a single file.
const canShare = computed(() => authStore.user?.perm.share === true);
const canDownload = computed(() => authStore.user?.perm.download === true);

const onQuickShare = () => {
  layoutStore.showHover({
    prompt: "share",
    props: {
      override: { url: props.url, name: props.name, path: props.path },
    },
  });
};

const onQuickDownload = () => {
  api.download(null, props.url);
};

const props = defineProps<{
  name: string;
  isDir: boolean;
  url: string;
  type: string;
  size: number;
  modified: string;
  index: number;
  readOnly?: boolean;
  path?: string;
}>();

// v1.3 H12: row drag-drop notifications so FileListing can route drops.
//   • dropAlongside(e)   — drop happened in the alongside area (outside a
//                          folder's tight into-zone, or on a file row); ask
//                          FileListing to route it to the current folder.
const emit = defineEmits<{
  dropAlongside: [event: DragEvent];
  // Touch drag-and-drop is owned by a single useTouchDrag instance in
  // FileListing (lifted out of every row). Rows just forward their
  // pointerdown + index up; the parent decides whether to start a drag.
  rowPointerDown: [event: PointerEvent, index: number];
}>();

const authStore = useAuthStore();
const fileStore = useFileStore();
// Dual-pane: this row's selection + keyboard-cursor state resolve through the
// pane context (pane A = fileStore by default, pane B = its own store). The
// drag snapshot (`draggedItems`), touch-click guard (`suppressClicksUntil`) and
// `reload` stay on `fileStore` — they're global to the one drag session.
const { listing, navigate: paneNavigate, paneId } = usePaneContext();
const panes = usePanesStore();
const layoutStore = useLayoutStore();
const folderSizes = useFolderSizes();
const tagsStore = useTagsStore();
const prefs = usePreferences();
const favorites = useFavorites();
const { movingPaths } = useTransfers();

// True while this item is part of an in-flight MOVE (the floating transfer dock
// tracks the same jobs). Drives the animated "being moved" shimmer on the name
// text — a cue for drag-and-drop moves, which don't always surface the dock.
// Matches on the decoded scope-relative path (item.path), the same key the move
// job reports as `fromPaths`: an EXACT match flags a moved file or the moved
// folder's own row, and a descendant match (isPathInMove) lights up everything
// inside a moved folder, so browsing INTO a folder mid-move shows its whole
// subtree shimmering.
const isMoving = computed<boolean>(
  () => !!props.path && isPathInMove(props.path, movingPaths.value)
);

// 2.4.0 Stage 1: dim this row while it's sitting on the clipboard as a CUT —
// the Finder-style "armed for move" affordance. Cleared when the cut is pasted
// (paste resets the clipboard) or disarmed with Esc. Keyed on the item url,
// which is exactly what clipboardCapture stored as `from`.
const clipboardStore = useClipboardStore();
const isCut = computed<boolean>(
  () =>
    clipboardStore.key === "cut" &&
    clipboardStore.items.some((it: ClipItem) => it.from === props.url)
);

// WS8: show/hide file extensions (per-user, default on). Reactive via the
// preferences store so toggling in Settings updates the listing live.
const showExtensions = computed<boolean>(() =>
  prefs.get<boolean>("nav.showExtensions", true)
);
// The name shown on the row: folders + dotfiles unchanged; with extensions
// hidden, files show only their base.
const displayedName = computed(() =>
  displayName(props.name, props.isDir, showExtensions.value)
);
// True when this row should hide its extension (a file, pref off, and it
// actually has a splittable extension). Drives the rename base/ext handling.
const hideExtension = computed(
  () =>
    !props.isDir &&
    !showExtensions.value &&
    splitExtension(props.name).ext !== ""
);

// ── Favorites star (v1.3 S3-2) ──────────────────────────────────────
// Folder-only affordance: pin frequently-visited folders to the
// sidebar for one-click navigation. The button only renders when
// `isDir` is true (template guard). Star tracks favorited-ness; click
// toggles. Optimistic via usePreferences — sidebar list updates
// immediately, server PUT debounced.
const isFavorited = computed<boolean>(() =>
  props.isDir ? favorites.isFavorited(props.url) : false
);
const onFavoriteToggle = () => {
  if (!props.isDir) return;
  favorites.toggle(props.url);
};

// ── Inline tag dots (v1.3 S2-5; V2 #23) ─────────────────────────────
// Tags come from the pre-batched listing fetch (FileListing fires a
// single tagsApi.batchForFiles call after each directory load). This
// computed is a pure store read — no per-row HTTP. Rendered as colour
// dots ordered alphabetically by name (V2 #23); can be hidden entirely
// via the "Show tags on file rows" Profile toggle.
const showTagsOnRows = computed<boolean>(() =>
  prefs.get<boolean>("tags.showOnRows", true)
);
const sortedTags = computed<Tag[]>(() =>
  [...tagsStore.forPath(props.url)].sort((a, b) => a.name.localeCompare(b.name))
);

const isTouchDevice = useTouchDevice();

// A plain row tap OPENS the item when the user prefers single-click OR — on
// touch — when the item is a FOLDER. On touch, opening a folder on a single
// tap is the expected file-manager gesture, but opening a FILE on a single tap
// yanked the user out of the directory into a full-screen preview, which they
// found jarring. So on touch a file tap now just SELECTS it (the mobile
// selection bar then offers Details / actions, and a double-tap still opens the
// preview for users who want it). Desktop's single-click preference is
// unchanged and still applies to both files and folders.
const openOnSingleClick = computed(
  () =>
    !props.readOnly &&
    (authStore.user?.singleClick || (isTouchDevice.value && props.isDir))
);

const singleClick = computed(
  () => !props.readOnly && authStore.user?.singleClick
);
const isSelected = computed(() => listing.selected.indexOf(props.index) !== -1);
const isDraggable = computed(
  () => !props.readOnly && authStore.user?.perm.rename
);

const canDrop = computed(() => {
  if (!props.isDir || props.readOnly) return false;

  // A folder can't receive a folder that IS it or CONTAINS it — that would
  // move a folder into its own subtree. Check against the dragstart snapshot
  // (covers the self row AND, after spring-loading into the dragged folder,
  // any of its descendant rows).
  const dragged = fileStore.draggedItems;
  if (dragged.length > 0) {
    for (const it of dragged) {
      if (isSelfOrDescendantTarget(it.url, it.isDir, props.url)) return false;
    }
  }

  // An empty snapshot means this is an OS-file UPLOAD drag (Finder → window),
  // not an internal move. A SELECTED folder is still a perfectly valid upload
  // target, so do NOT suppress it here — the previous `selected` check wrongly
  // killed the highlight + spring-load countdown when hovering an upload over a
  // selected folder row.
  return true;
});

// v1.3 H12: even non-droppable rows (files, or folders that are the
// drag source) participate in drag-drop as alongside-forwarders. The
// row geometry still lets the user release "alongside" to mean "drop
// into the current folder" — so the whole listing surface routes
// drops correctly without dead zones. Only readOnly rows opt out
// entirely.
const canForwardDrop = computed(() => !props.readOnly);

// v1.3 H12 geometry helper → whether the cursor is over this folder's "drop
// INTO this folder" zone (icon + rendered name + a small grab margin). The
// hit-test lives in `@/utils/dropZone` so the desktop drag path (here) and the
// touch drag path (FileListing) share ONE definition — see isPointInRowIntoZone.
// Non-folder rows and Alt-held drags always read as "alongside" (drop into the
// current directory), so a folder full of folders stays easy to drop into.
const isInIntoZone = (event: DragEvent, rowEl: HTMLElement): boolean => {
  // Hold Alt/Option to force EVERY drop "alongside": no folder highlights or
  // spring-loads while it's down, so you can drop into a folder full of folders
  // without ever landing inside one. Otherwise defer to the shared resolver
  // (it returns "alongside" for non-folder rows via `data-dir`, so the old
  // explicit `!props.isDir` short-circuit is folded in).
  if (event.altKey) return false;
  return resolveRowDropMode(rowEl, event.clientX, event.clientY) === "into";
};

// Track in-zone state with a plain let — nothing in the template
// observes it, so reactivity overhead is wasted. State machine: enter
// the into-zone → highlight row + start spring-load + emit(true);
// leave the into-zone → dim row + cancel spring + emit(false). All
// transitions go through enterIntoZone/leaveIntoZone so we never
// double-fire emits or leak a spring-load timer.
let inIntoZone = false;

const enterIntoZone = (rowEl: HTMLElement) => {
  if (inIntoZone) return;
  inIntoZone = true;
  rowEl.style.opacity = "1";
  // Strong accent ring + tint so "this folder will receive the drop" reads at
  // a glance (the old opacity-only cue was too subtle). Cleared in
  // leaveIntoZone / drop, and swept by FileListing.resetOpacity on drag end.
  rowEl.classList.add("item--drop-into");
  startSpringLoad();
};

const leaveIntoZone = (rowEl: HTMLElement) => {
  if (!inIntoZone) return;
  inIntoZone = false;
  // Restore the global drag-active fade. The document-level dragEnter
  // sets all .item to 0.5 opacity; we just undo our override so it
  // re-asserts naturally if a drag is still in flight.
  rowEl.style.opacity = "0.5";
  rowEl.classList.remove("item--drop-into");
  cancelSpringLoad();
};

const thumbnailUrl = computed(() => {
  const file = {
    path: props.path,
    modified: props.modified,
  };

  return api.getPreviewURL(file as Resource, "thumb");
});

// Cover-art thumbnails. The same /api/preview/thumb endpoint serves every
// kind — image resize, ffmpeg video frame, embedded audio art, epub OPF
// cover, or pdftoppm-rendered PDF first page. Audio + EPUB need no server
// binary (ride enableThumbs); video + PDF are gated on a server capability
// flag (ffmpeg / poppler present). A file with no extractable cover returns
// 501 → `thumbError` flips us back to the colored icon (see onThumbError).
const thumbError = ref(false);
// Reset the error flag when the row is reused for a different file (the
// RecycleScroller swaps props in place rather than remounting).
watch(
  () => props.url,
  () => {
    thumbError.value = false;
  }
);
const onThumbError = () => {
  thumbError.value = true;
};

// Lazy folder size (DP v2 R1): fetch THIS folder's recursive size when the row
// mounts or is recycled onto a new folder. The RecycleScroller only mounts rows
// near the viewport, so sizes fill in for what's actually on screen instead of
// the parent prefetching every subfolder up front — which, with the split open,
// fired that recursive walk for every subfolder of BOTH panes at once. `ensure`
// dedupes by (url, mod) and is a no-op when already cached/in-flight.
watch(
  () => [props.url, props.isDir, props.modified] as const,
  () => {
    if (props.isDir && props.url) {
      void folderSizes.ensure(props.url, String(props.modified ?? ""));
    }
  },
  { immediate: true }
);

const showThumbnail = computed(() => {
  if (props.readOnly || !props.path || thumbError.value) return false;
  const ext = getExtension(props.name).toLowerCase();
  if (props.type === "image") return enableThumbs;
  if (props.type === "video") return enableThumbs && enableVideoThumbs;
  if (props.type === "audio") return enableThumbs;
  if (props.type === "pdf") return enableThumbs && enablePdfThumbs;
  if (ext === ".epub") return enableThumbs;
  // Comics get a server-extracted cover (first page). V2 #6 shipped .cbr
  // only; .cbz joined in v2.7 (exclusion reversed on request).
  if (ext === ".cbr" || ext === ".cbz") return enableThumbs;
  return false;
});

const iconName = computed(() =>
  fileIcon({ isDir: props.isDir, type: props.type, name: props.name })
);

const iconColorClass = computed(() =>
  fileIconColor({ isDir: props.isDir, type: props.type, name: props.name })
);

// ── Inline rename (Stage 8) ─────────────────────────────────────────────
// This row enters edit mode when the rename prompt is active and it's the
// only selected item. Auto-focus the input on entry; ↵ commits, Esc cancels.
//
// Blur handling is subtle: when the user mousedown-drags a text selection
// that escapes the input bounds and releases outside, the browser fires
// `blur` even though the user clearly wanted to keep editing. The
// `mouseDownInsideInput` flag distinguishes legitimate drag-selection-
// escape (refocus) from a genuine click-away (cancel).
const renameValue = ref<string>("");
const renameInputEl = ref<HTMLInputElement | null>(null);
let renameSubmitting = false;
// Set true on input mousedown; cleared on document mouseup after blur
// has had a chance to inspect it. While true, a blur is interpreted as
// drag-select-escape (the mouse was held down inside the input) rather
// than a click-away.
let mouseDownInsideInput = false;
// Document-level mouseup handler; held in a ref so we can install on
// rename start and tear down on rename end without leaking listeners.
let docMouseUpHandler: ((e: MouseEvent) => void) | null = null;

const isRenaming = computed(() => {
  return (
    layoutStore.currentPromptName === "rename" &&
    // Dual-pane (#15): the "rename" prompt is global, but each pane's rows watch
    // it independently. Without this guard, if BOTH panes have a single item
    // selected, opening rename in one pane also opens an inline input in the
    // other — the two inputs blur-fight and the rename "immediately closes."
    // The prompt targets the ACTIVE pane, so only that pane's row may edit.
    // (Single-pane: paneId is "a" and activePane stays "a", so this is a no-op.)
    panes.activePane === paneId &&
    listing.selectedCount === 1 &&
    listing.selected[0] === props.index
  );
});

watch(isRenaming, async (active) => {
  if (!active) {
    // Tear down the document listener so it doesn't keep firing for
    // every mouseup across the page after the rename ends.
    if (docMouseUpHandler) {
      document.removeEventListener("mouseup", docMouseUpHandler);
      docMouseUpHandler = null;
    }
    mouseDownInsideInput = false;
    return;
  }
  // WS8: with extensions hidden, edit the BASE name only — the original
  // extension is re-appended on submit. Otherwise edit the full name.
  renameValue.value = hideExtension.value
    ? splitExtension(props.name).base
    : props.name;
  renameSubmitting = false;
  await nextTick();
  const el = renameInputEl.value;
  if (!el) return;
  el.focus();
  // With the extension hidden the field is already just the base, so select it
  // all; otherwise select the filename stem (everything before the last ".").
  if (hideExtension.value) {
    el.setSelectionRange(0, renameValue.value.length);
  } else {
    const dot = !props.isDir ? props.name.lastIndexOf(".") : -1;
    el.setSelectionRange(0, dot > 0 ? dot : props.name.length);
  }

  // Install a document-level mouseup so we can clear the flag after
  // any drag-release, no matter where it lands. setTimeout(0) gives the
  // blur handler one tick to inspect the flag before we reset it.
  docMouseUpHandler = () => {
    setTimeout(() => {
      mouseDownInsideInput = false;
    }, 0);
  };
  document.addEventListener("mouseup", docMouseUpHandler);
});

const onRenameMouseDown = () => {
  mouseDownInsideInput = true;
};

// Slow-double-click-to-rename: "click to select, pause, click the name" opens
// an inline rename (the Finder/Explorer gesture). Desktop + double-click-open
// mode only; deferred by one double-click window so a genuine double-click
// opens instead — the open() path cancels the pending timer. Wired in click().
const RENAME_GESTURE_MS = 350;
let renameGestureTimer = 0;

const cancelRenameGesture = () => {
  if (renameGestureTimer) {
    clearTimeout(renameGestureTimer);
    renameGestureTimer = 0;
  }
};

const nameRenameEligible = (event: Event | KeyboardEvent): boolean => {
  const me = event as MouseEvent;
  const target = event.target as HTMLElement | null;
  return (
    !props.readOnly &&
    !!authStore.user?.perm.rename &&
    !isTouchDevice.value &&
    !openOnSingleClick.value &&
    !me.ctrlKey &&
    !me.metaKey &&
    !me.shiftKey &&
    listing.selectedCount === 1 &&
    !!target?.closest?.(".item__name-text")
  );
};

const startRename = () => {
  // Mirrors FileListing's F2 handler: the gesture guarantees this row is the
  // sole selection, so showing the rename prompt targets it.
  if (!authStore.user?.perm.rename || listing.selectedCount !== 1) return;
  layoutStore.showHover("rename");
};

// Safety net: tear down the document listener if the row unmounts
// mid-rename (e.g. user navigates away during edit). The watch handles
// the normal close path; this catches the edge case.
onBeforeUnmount(() => {
  cancelRenameGesture();
  if (docMouseUpHandler) {
    document.removeEventListener("mouseup", docMouseUpHandler);
    docMouseUpHandler = null;
  }
  // S5-9: if this row unmounts while its hover preview is pending /
  // showing (e.g. reload or route change mid-hover), dismiss it so the
  // overlay doesn't linger.
  hoverPreview.cancel();
});

const cancelRename = () => {
  if (renameSubmitting) return;
  layoutStore.closeHovers();
};

const onRenameBlur = () => {
  if (renameSubmitting) return;
  // If a mousedown started inside the input, this blur was almost
  // certainly caused by the user dragging a text selection beyond the
  // input bounds and releasing — they didn't intend to leave the input.
  // Refocus on the next tick instead of cancelling.
  if (mouseDownInsideInput) {
    // Capture the text selection the drag built up BEFORE refocusing — a bare
    // focus() drops the highlight, which used to force the user to re-select
    // their text every time they released the mouse away from the row. The
    // range is still intact at blur time; re-applying it after focus lets the
    // user let go of the mouse ANYWHERE without losing the selection.
    const el = renameInputEl.value;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    const dir = el?.selectionDirection ?? undefined;
    nextTick(() => {
      const input = renameInputEl.value;
      if (!input || !isRenaming.value) return;
      input.focus();
      if (start !== null && end !== null) {
        input.setSelectionRange(start, end, dir);
      }
    });
    return;
  }
  // Genuine click-away / Tab-out — cancel after a small delay so a
  // sibling click handler (e.g. on a future Save button) can register
  // before we tear down. Guard on the PROMPT being open rather than
  // `isRenaming.value`: a click-away that clears or moves the selection
  // (empty space, or another row) drops `isRenaming` to false while the
  // prompt is still open, which previously left it orphaned — so the
  // rename "stuck." `currentPromptName === "rename"` stays true until we
  // actually close it, and won't pop an unrelated prompt opened since.
  setTimeout(() => {
    if (!renameSubmitting && layoutStore.currentPromptName === "rename") {
      cancelRename();
    }
  }, 120);
};

// Reload the pane this row lives in, and — when the split shows the SAME
// folder in both panes — the other pane too, so a rename refreshes both at
// once (#5). Pane-aware so it stays correct once pane B renames inline.
// Shared by submitRename and its undo (which can run after this row has been
// recycled — it only touches store singletons, never props).
const refreshPanesAfterRename = () => {
  const norm = (p?: string | null) => (p ? p.replace(/\/+$/, "") : "");
  const sameFolderBothPanes =
    panes.split && norm(fileStore.req?.url) === norm(panes.secondaryPath);
  if (paneId === "b") {
    panes.refreshB();
    if (sameFolderBothPanes) fileStore.reload = true;
  } else {
    fileStore.reload = true;
    if (sameFolderBothPanes) panes.refreshB();
  }
};

// Undo = rename back. A real API round-trip like the delete-undo, so it works
// even after navigating away or after this row instance is gone. Everything it
// needs is passed as primitives captured at rename time — `props` must NOT be
// read here (the virtual scroller recycles row instances, so by the time the
// toast is clicked `props` may describe a different file).
const undoRename = async (
  fromLink: string,
  toLink: string,
  wasDir: boolean
) => {
  try {
    await api.move([{ from: fromLink, to: toLink }]);
    if (wasDir) favorites.renamePath(fromLink, toLink);
    listing.setPreselect(decodeURIComponent(removePrefix(toLink)));
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    refreshPanesAfterRename();
  }
};

const RENAME_UNDO_WINDOW_MS = 5000;
const offerRenameUndo = (
  oldLink: string,
  newLink: string,
  oldName: string,
  wasDir: boolean
) => {
  const toastId = $toast(
    {
      component: UndoToast,
      props: {
        message: `Renamed “${oldName}”`,
        icon: "pencil",
        onClick: () => {
          $toast.dismiss(toastId);
          void undoRename(newLink, oldLink, wasDir);
        },
      },
    },
    {
      timeout: RENAME_UNDO_WINDOW_MS,
      closeOnClick: false,
      icon: false,
      toastClassName: "toast--undo",
    }
  );
};

const submitRename = async () => {
  if (renameSubmitting) return;
  const typed = renameValue.value.trim();
  // WS8: the field holds only the base name when extensions are hidden — stitch
  // the original extension back on so the file keeps its type. An empty base is
  // treated as a no-op (you can't rename a file to just its extension).
  const next =
    hideExtension.value && typed !== ""
      ? typed + splitExtension(props.name).ext
      : typed;
  if (next === "" || next === props.name) {
    cancelRename();
    return;
  }
  renameSubmitting = true;
  const oldLink = props.url;
  const oldName = props.name;
  const wasDir = props.isDir;
  const newLink =
    urlUtil.removeLastDir(oldLink) + "/" + encodeURIComponent(next);
  try {
    await api.move([{ from: oldLink, to: newLink }]);
    // Keep any Favorites pointing at this folder (or its descendants)
    // pinned — follow the rename instead of letting the link break.
    if (wasDir) favorites.renamePath(oldLink, newLink);
    // Decode the path before queueing it — removePrefix(newLink) is
    // URL-encoded (we built newLink with encodeURIComponent), but
    // item.path in the next listing is decoded. Without this decode
    // applyPreSelection would silently fail to find the renamed item
    // and the row would lose its selection — the exact "feels broken"
    // UX the user reported.
    listing.setPreselect(decodeURIComponent(removePrefix(newLink)));
    refreshPanesAfterRename();
    offerRenameUndo(oldLink, newLink, oldName, wasDir);
  } catch (e) {
    if (e instanceof Error) $showError(e);
    renameSubmitting = false;
    return;
  }
  layoutStore.closeHovers();
};

const humanSize = () => {
  return props.type == "invalid_link" ? "invalid link" : filesize(props.size);
};

// 2.4.0: show a folder's recursive size in the Size column. The row only READS
// the cache (reactively) — FileListing prefetches every folder's size centrally
// on load (concurrency-limited), so the column fills in without per-row fetches
// hammering the server. A not-yet-resolved size shows the em-dash placeholder.
const dirSizeLabel = computed(() => {
  if (!props.isDir) return "";
  const s = folderSizes.cached(props.url, String(props.modified ?? ""));
  return s === undefined ? "" : filesize(s);
});

const humanTime = () => {
  const m = dayjs(props.modified);
  const now = dayjs();

  // Same calendar day → "Nh ago" (rounded to nearest hour, min 1)
  if (m.isSame(now, "day")) {
    const hours = Math.max(
      1,
      Math.round((now.valueOf() - m.valueOf()) / 3600000)
    );
    return `${hours}h ago`;
  }

  // Same year → "MMM D"   (e.g. "May 24")
  if (m.isSame(now, "year")) {
    return m.format("MMM D");
  }

  // Older → "MMM D, YYYY" (e.g. "May 24, 2025")
  return m.format("MMM D, YYYY");
};

const dragStart = (event: DragEvent) => {
  // Promote + snapshot the drag selection (shared with the lifted touch
  // path) — see listing.snapshotDragSelection. Snapshotting up front
  // means spring-load navigation can't drop the selection mid-drag.
  listing.snapshotDragSelection(props.index);

  // v1.3 S4-4: replace the browser's ugly translucent row snapshot with
  // a compact ghost — the grabbed row's icon + filename (single) or a
  // count badge (multi). Uses the row element under the cursor as the
  // icon source, so the ghost shows what the user actually grabbed.
  const count = fileStore.draggedItems.length;
  setDragGhost(event, {
    rowEl: event.currentTarget as HTMLElement,
    name: props.name,
    count,
  });

  // Live "Copy"/"Move" pill that trails the cursor (FileListing's dragover
  // repositions it; ⌘/Ctrl flips it). The static drag image above can't show
  // this because setDragImage() is a one-shot bitmap.
  startDragBadge(event.ctrlKey || event.metaKey, event.clientX, event.clientY);
};

// ── Touch drag-and-drop ─────────────────────────────────────────────────
// HTML5 DnD never fires on touch. A SINGLE useTouchDrag instance now lives
// in FileListing (lifted out of every row so we don't pay one composable +
// ghost-closure per mounted tile). Each row just forwards its pointerdown +
// index up via `rowPointerDown`; the parent decides whether the gesture
// elevates into a drag. Interactive children + read-only rows opt out here
// so the parent never needs to know a row's internals.
const onRowPointerDown = (event: PointerEvent) => {
  if (props.readOnly) return;
  const t = event.target as HTMLElement | null;
  if (t?.closest("button, a, input")) return;
  emit("rowPointerDown", event, props.index);
};

const dragEnd = () => {
  // Browsers fire dragend on the source after drop/cancel — always.
  // Use it as the canonical "drag is over" signal to clear the snapshot.
  fileStore.draggedItems = [];
  endDragBadge();
};

const dragOver = (event: DragEvent) => {
  // v1.3 H12: dragover now also fires on file rows + self-drop folders
  // (anything not read-only) so the whole listing is a coherent
  // drop surface — file rows route alongside-drops to the current
  // folder via FileListing. We preventDefault on every forward so the
  // cursor advertises a valid drop target everywhere along the row.
  if (!canForwardDrop.value) return;
  event.preventDefault();

  const rowEl = event.currentTarget as HTMLElement;
  if (canDrop.value && isInIntoZone(event, rowEl)) {
    // 2.1 #8: re-assert the un-dim on EVERY dragover frame, not just the
    // guarded enter transition. The document-wide drag dim fires on `dragenter`
    // while the brighten fired once on `dragover`, so depending on which row
    // edge / child you crossed first (i.e. your approach direction) the dim
    // could land last and stick. dragover fires continuously while hovering, so
    // setting opacity here keeps the highlight from any direction.
    rowEl.style.opacity = "1";
    enterIntoZone(rowEl);
  } else {
    leaveIntoZone(rowEl);
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect =
      event.ctrlKey || event.metaKey ? "copy" : "move";
  }
};

// ── Spring-loaded folders (F6) ──────────────────────────────────────
// While a drag is held over this row AND it's a droppable folder, start
// a 2 s timer. On completion we navigate into the folder so the user
// can chain drops into nested directories without dropping + reopening.
// A progress ring renders around the folder icon to telegraph the
// behavior. Drag enter/leave fires for every child element, so we
// count enters to know when the drag has truly left the row.
const SPRING_LOAD_MS = 2000;
const springProgress = ref<number>(0);
let springTimer: number | null = null;
let springRaf: number | null = null;
let springStart = 0;
let dragDepth = 0;

const cancelSpringLoad = () => {
  if (springTimer !== null) {
    window.clearTimeout(springTimer);
    springTimer = null;
  }
  if (springRaf !== null) {
    cancelAnimationFrame(springRaf);
    springRaf = null;
  }
  springProgress.value = 0;
};

const startSpringLoad = () => {
  if (springTimer !== null) return; // already running
  springStart = performance.now();
  const tick = (now: number) => {
    const elapsed = now - springStart;
    springProgress.value = Math.min(1, elapsed / SPRING_LOAD_MS);
    if (springProgress.value < 1) {
      springRaf = requestAnimationFrame(tick);
    }
  };
  springRaf = requestAnimationFrame(tick);
  springTimer = window.setTimeout(() => {
    springTimer = null;
    cancelSpringLoad();
    // Navigate into this folder — drag state survives the route change
    // (browsers keep the active drag session across SPA navigations).
    paneNavigate(props.url, props.isDir);
  }, SPRING_LOAD_MS);
};

const onDragEnter = (event: DragEvent) => {
  // v1.3 H12: spring-load no longer auto-starts on row enter — dragOver
  // decides based on whether the cursor is in the into-zone. This way
  // entering a row's right-side / actions area doesn't prematurely
  // start the navigate-into timer.
  if (!canForwardDrop.value) return;
  event.preventDefault();
  dragDepth++;
};

const onDragLeave = (event: DragEvent) => {
  if (!canForwardDrop.value) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    // Leaving the row entirely — clear into-zone state (spring-load is
    // cancelled inside leaveIntoZone).
    const rowEl = event.currentTarget as HTMLElement;
    leaveIntoZone(rowEl);
  }
};

const drop = async (event: DragEvent) => {
  // A real drop wins over the pending spring-load — kill the timer
  // before any conflict prompts so we don't navigate mid-resolve.
  dragDepth = 0;
  cancelSpringLoad();

  if (!canForwardDrop.value) return;
  event.preventDefault();

  // Decide from the LIVE geometry at the drop point — the SAME hit-test that
  // drives the highlight + spring-load countdown — so a drop goes INTO the folder
  // ONLY where the cursor is over the icon + name (exactly where the highlight
  // shows). Everywhere else forwards to FileListing, which routes the move to the
  // CURRENT folder ("alongside").
  //
  // This used to reuse the cached `inIntoZone` flag, because the old hit-test
  // measured the name with a Range and `Range.getBoundingClientRect()` is
  // unreliable during the terminating `drop` event. The hit-test now reads an
  // ELEMENT rect (the inner `.item__name-glyph` box), which STAYS correct at drop
  // — so recomputing is both safe and necessary: the cached flag could be left
  // stale (e.g. by spring-load navigation), dropping INTO the folder in the
  // "alongside" area where no highlight was showing.
  const rowEl = event.currentTarget as HTMLElement;
  const intoZone = canDrop.value && isInIntoZone(event, rowEl);

  // Clear any lingering hover state on drop (flag, highlight tint, dim).
  inIntoZone = false;
  rowEl.style.opacity = "0.5";
  rowEl.classList.remove("item--drop-into");

  if (!intoZone) {
    emit("dropAlongside", event);
    return;
  }

  // Pull dragged items from the snapshot taken at dragstart, NOT from
  // `selected`. Spring-load navigation may have wiped `selected` between
  // dragstart and now; the snapshot is the source of truth.
  const allDragged = fileStore.draggedItems;
  if (allDragged.length === 0) {
    // Empty snapshot = the drop was already handled (a single native drop
    // bubbles through multiple drop handlers; `dragend` may have cleared
    // the snapshot by the time a later one runs). Not a user-facing error
    // — silently no-op instead of toasting (RC-12).
    return;
  }

  // Reject moving a folder into itself or its own subtree (`canDrop`
  // already suppresses the cursor/highlight for those, but guard the drop
  // too in case it slips through). Skip the illegal items; if that empties
  // the set, there's nothing valid to drop.
  const dragged = allDragged.filter(
    (it) => !isSelfOrDescendantTarget(it.url, it.isDir, props.url)
  );
  if (dragged.length === 0) return;

  const items: any[] = dragged.map((it) => ({
    from: it.url,
    to: props.url + encodeURIComponent(it.name),
    name: it.name,
    size: it.size,
    modified: it.modified,
    overwrite: false,
    rename: false,
  }));

  // Destination for the conflict check = THIS folder row's url (the `to` paths
  // above are built from it). No DOM walk / Vue-internals lookup needed.
  const path = props.url;

  // DragEvent inherits ctrlKey/metaKey from MouseEvent — no cast needed.
  const isCopy = event.ctrlKey || event.metaKey;
  const action = () => {
    // Start a background job — progress + result are shown by the floating
    // transfer dock, which refreshes the listing when the move/copy settles.
    // Items already carry their per-item overwrite/rename flags (default false,
    // or set during conflict resolution below).
    void startTransfer(isCopy ? "copy" : "move", items);
  };

  const conflict = await upload.checkMoveConflict(items, path);

  if (conflict.length > 0) {
    // Source folder = parent of the first dragged item; target = the
    // folder we just dropped onto (path resolved from the row element).
    const firstFrom = dragged[0]?.url ?? "";
    const sourceUrl = firstFrom.replace(/[^/]+\/?$/, "");
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: {
        conflict: conflict,
        from: sourceUrl,
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

  action();
};

const itemClick = (event: Event | KeyboardEvent) => {
  // Ignore the synthetic click that trails a touch drag-and-drop. The
  // suppress window is set by the listing-level touch-drag onEnd (shared
  // via the file store) so every recycled row honors it.
  if (Date.now() < fileStore.suppressClicksUntil) return;

  // Bug fix: while THIS row is the active inline-rename target, swallow stray
  // row clicks. Dragging a text selection inside the rename input and releasing
  // over the row (outside the input) synthesizes a click on the row element;
  // without this it fell through to click() → deselected the item → which
  // dropped `isRenaming` to false and tore the rename down mid-edit.
  if (isRenaming.value) return;

  // Clicking a DIFFERENT row while an inline rename is open cancels it.
  // The rename prompt targets the single selected item, so without this the
  // click's selection change would silently *re-target* the rename onto the
  // newly-clicked row instead of dismissing it (the reported bug). Closing
  // the prompt first leaves the click to select/open the row as normal.
  if (
    layoutStore.currentPromptName === "rename" &&
    listing.selected[0] !== props.index
  ) {
    layoutStore.closeHovers();
  }
  if (
    openOnSingleClick.value &&
    !(event as KeyboardEvent).ctrlKey &&
    !(event as KeyboardEvent).metaKey &&
    !(event as KeyboardEvent).shiftKey &&
    !listing.multiple
  )
    open();
  else click(event);
};

// Checkbox-cell click: pure additive selection toggle (never opens). This is
// how touch users build a multi-selection now that a row tap opens the item.
const onSelectClick = () => {
  const i = listing.selected.indexOf(props.index);
  if (i !== -1) {
    listing.removeSelected(props.index);
  } else {
    listing.selected.push(props.index);
  }
};

const contextMenu = (event: MouseEvent) => {
  event.preventDefault();
  if (
    listing.selected.length === 0 ||
    event.ctrlKey ||
    listing.selected.indexOf(props.index) === -1
  ) {
    click(event);
  }
};

const click = (event: Event | KeyboardEvent) => {
  if (!singleClick.value && listing.selectedCount !== 0) event.preventDefault();

  setTimeout(() => {
    touches.value = 0;
  }, 300);

  touches.value++;
  if (touches.value > 1) {
    // A fast double-click opens — and cancels any pending slow-click rename
    // armed by the first click (see the re-click branch below).
    cancelRenameGesture();
    open();
  }

  if (listing.selected.indexOf(props.index) !== -1) {
    // Re-clicking an already-selected item. A SLOW second click on the NAME
    // text (not the fast second half of a double-click → open, handled above)
    // arms an inline rename — the familiar "click, pause, click the name"
    // gesture. It's deferred by one double-click window so a genuine
    // double-click opens instead (open() above cancels the timer). Anything
    // else still toggles the selection off.
    if (touches.value === 1 && nameRenameEligible(event)) {
      cancelRenameGesture();
      renameGestureTimer = window.setTimeout(() => {
        renameGestureTimer = 0;
        startRename();
      }, RENAME_GESTURE_MS);
      return;
    }
    listing.removeSelected(props.index);
    return;
  }

  if ((event as KeyboardEvent).shiftKey && listing.selected.length > 0) {
    let fi = 0;
    let la = 0;

    if (props.index > listing.selected[0]) {
      fi = listing.selected[0] + 1;
      la = props.index;
    } else {
      fi = props.index;
      la = listing.selected[0] - 1;
    }

    for (; fi <= la; fi++) {
      if (listing.selected.indexOf(fi) == -1) {
        listing.selected.push(fi);
      }
    }

    return;
  }

  if (
    !(event as KeyboardEvent).ctrlKey &&
    !(event as KeyboardEvent).metaKey &&
    !listing.multiple
  ) {
    listing.selected = [];
  }
  listing.selected.push(props.index);
};

const open = () => {
  paneNavigate(props.url, props.isDir);
};

const getExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return fileName;
  }
  return fileName.substring(lastDotIndex);
};

// ── Image hover preview (v1.3 S5-9) ────────────────────────────────
// Hovering an image row for 500 ms pops a size-capped preview near the
// cursor. Gated to image rows (and to thumbnail-enabled, non-readonly
// contexts so the preview URL is valid). The composable owns the timer
// + cursor tracking + scroll-dismiss; we just schedule / cancel.
const hoverPreview = useImageHoverPreview();
const canHoverPreview = computed(
  () =>
    props.type === "image" && !props.readOnly && enableThumbs && !!props.path
);

const handleMouseEnter = (event: MouseEvent) => {
  if (!canHoverPreview.value) return;
  hoverPreview.schedule(
    { path: props.path!, modified: props.modified, name: props.name },
    event
  );
};

// Event handlers
const handleMouseDown = () => {
  // Any press dismisses the hover preview (the user is interacting now).
  hoverPreview.cancel();
};

const handleMouseLeave = () => {
  hoverPreview.cancel();
};
</script>
