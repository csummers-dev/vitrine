<template>
  <div
    class="item"
    :class="{ 'item--spring-loaded': springProgress > 0 }"
    role="button"
    tabindex="0"
    :draggable="isDraggable"
    @dragstart="dragStart($event)"
    @dragend="dragEnd"
    @dragenter="onDragEnter"
    @dragover="dragOver"
    @dragleave="onDragLeave"
    @drop="drop"
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
    <!-- Selection checkbox -->
    <div class="item__select">
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
        <img v-if="showThumbnail" v-lazy="thumbnailUrl" class="item__thumb" />
        <!-- Inner wrapper: display:contents in list/grid (layout-transparent),
             becomes a visible squircle in gallery for non-folder/non-image files -->
        <div v-else class="item__icon-inner">
          <Icon :name="iconName" :size="16" :stroke-width="1.6" />
        </div>
        <!-- Spring-load progress ring (F6): renders only while a drag is
             hovering this folder, fills clockwise over 3s, then we
             navigate into the folder. -->
        <svg
          v-if="springProgress > 0"
          class="item__spring-ring"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <circle
            class="item__spring-ring-track"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke-width="2"
          />
          <circle
            class="item__spring-ring-fill"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke-width="2"
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
        <span v-else class="item__name-text name">{{ name }}</span>
        <div class="item__name-compact-meta">
          <time :datetime="modified">{{ humanTime() }}</time>
          <span v-if="!isDir"> · {{ humanSize() }}</span>
        </div>
        <!-- Inline tag chips (v1.3 S2-5). Capped at 2 visible + a "+N"
             overflow chip per locked decision. Tags come from the
             pre-batched listing fetch in FileListing.vue so this is a
             pure prop read — no per-row API call. Hidden when the user
             has opted out via the "Show tags on rows" Profile toggle. -->
        <div
          v-if="inlineTags.length > 0 && showTagsOnRows"
          class="item__tags"
          aria-label="Tags"
        >
          <TagChip
            v-for="t in visibleTags"
            :key="t.id"
            :tag="t"
            size="sm"
            :focusable="false"
          />
          <span
            v-if="overflowTagCount > 0"
            class="item__tags-overflow"
            :title="overflowTagNames"
            >+{{ overflowTagCount }}</span
          >
        </div>
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
      <div v-if="isDir" class="item__size size" data-order="-1">&mdash;</div>
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
      <button
        class="item__actions-btn"
        @click.stop="onActionsClick"
        :title="'More'"
        :aria-label="'More'"
      >
        <Icon name="ellipsis" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import TagChip from "@/components/TagChip.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { useTagsStore } from "@/stores/tags";
import { usePreferences } from "@/composables/usePreferences";
import { useFavorites } from "@/composables/useFavorites";
import { useImageHoverPreview } from "@/composables/useImageHoverPreview";
import { useTransferIndicator } from "@/composables/useTransferIndicator";

import { enableThumbs, enableVideoThumbs } from "@/utils/constants";
import { filesize } from "@/utils";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { setDragGhost } from "@/utils/dragGhost";
import dayjs from "dayjs";
import { files as api } from "@/api";
import { removePrefix } from "@/api/utils";
import urlUtil from "@/utils/url";
import * as upload from "@/utils/upload";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";

const touches = ref<number>(0);

const $showError = inject<IToastError>("$showError")!;
const router = useRouter();
const { runTransfer } = useTransferIndicator();

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

// v1.3 H12: row drag-drop notifications so FileListing can mirror the
// active-target state into its bottom "drop into current folder" zone.
//   • rowIntoZone(true)  — cursor entered this folder's INTO-zone
//                          (icon/name area, list view) or its icon
//                          (mosaic/gallery). FileListing hides the
//                          bottom zone's active highlight.
//   • rowIntoZone(false) — cursor is on this row but OUTSIDE the
//                          into-zone (the "alongside" area). FileListing
//                          lights up the bottom zone since that's
//                          truthfully where a drop will land.
//   • dropAlongside(e)   — drop happened in the alongside area; ask
//                          FileListing to route it to current folder.
const emit = defineEmits<{
  rowIntoZone: [active: boolean];
  dropAlongside: [event: DragEvent];
}>();

const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();
const tagsStore = useTagsStore();
const prefs = usePreferences();
const favorites = useFavorites();

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

// ── Inline tag chips (v1.3 S2-5) ────────────────────────────────────
// Tags come from the pre-batched listing fetch (FileListing fires a
// single tagsApi.batchForFiles call after each directory load). This
// computed is a pure store read — no per-row HTTP. Cap-2 + overflow
// per the locked Stage 2 decision; can be hidden entirely via the
// "Show tags on file rows" Profile toggle.
const MAX_VISIBLE_TAGS = 2;
const showTagsOnRows = computed<boolean>(() =>
  prefs.get<boolean>("tags.showOnRows", true)
);
const inlineTags = computed<Tag[]>(() => tagsStore.forPath(props.url));
const visibleTags = computed<Tag[]>(() =>
  inlineTags.value.slice(0, MAX_VISIBLE_TAGS)
);
const overflowTagCount = computed<number>(() =>
  Math.max(0, inlineTags.value.length - MAX_VISIBLE_TAGS)
);
// Tooltip lists the tags hidden in the "+N" chip so users can see
// what's there without opening the picker.
const overflowTagNames = computed<string>(() =>
  inlineTags.value
    .slice(MAX_VISIBLE_TAGS)
    .map((t) => t.name)
    .join(", ")
);

const singleClick = computed(
  () => !props.readOnly && authStore.user?.singleClick
);
const isSelected = computed(
  () => fileStore.selected.indexOf(props.index) !== -1
);
const isDraggable = computed(
  () => !props.readOnly && authStore.user?.perm.rename
);

const canDrop = computed(() => {
  if (!props.isDir || props.readOnly) return false;

  for (const i of fileStore.selected) {
    if (fileStore.req?.items[i].url === props.url) {
      return false;
    }
  }

  return true;
});

// v1.3 H12: even non-droppable rows (files, or folders that are the
// drag source) participate in drag-drop as alongside-forwarders. The
// row geometry still lets the user release "alongside" to mean "drop
// into the current folder" — so the whole listing surface routes
// drops correctly without dead zones. Only readOnly rows opt out
// entirely.
const canForwardDrop = computed(() => !props.readOnly);

// v1.3 H12 geometry helper. Computes whether the cursor is currently
// over this row's "drop INTO this folder" zone, which is tighter than
// the full row:
//   • List view  → bounding rect of `.item__name` (icon + name stack)
//                  expanded by 12px horizontally and 8px vertically
//                  for forgiving targeting.
//   • Mosaic     → bounding rect of `.item__icon` only (the central
//   /  Gallery     squircle / thumbnail dominates the tile so the
//                  surrounding padding feels naturally "alongside").
// Returning false for non-folder rows means file rows always treat
// hovers as alongside, which is correct: files aren't drop targets.
const isInIntoZone = (event: DragEvent, rowEl: HTMLElement): boolean => {
  if (!props.isDir) return false;
  const listingEl = rowEl.closest("#listing");
  const isMosaic = listingEl?.classList.contains("mosaic") ?? false;
  const selector = isMosaic ? ".item__icon" : ".item__name";
  const target = rowEl.querySelector(selector) as HTMLElement | null;
  if (!target) return false;
  const rect = target.getBoundingClientRect();
  const padX = isMosaic ? 0 : 12;
  const padY = isMosaic ? 0 : 8;
  return (
    event.clientX >= rect.left - padX &&
    event.clientX <= rect.right + padX &&
    event.clientY >= rect.top - padY &&
    event.clientY <= rect.bottom + padY
  );
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
  startSpringLoad();
  emit("rowIntoZone", true);
};

const leaveIntoZone = (rowEl: HTMLElement) => {
  if (!inIntoZone) return;
  inIntoZone = false;
  // Restore the global drag-active fade. The document-level dragEnter
  // sets all .item to 0.5 opacity; we just undo our override so it
  // re-asserts naturally if a drag is still in flight.
  rowEl.style.opacity = "0.5";
  cancelSpringLoad();
  emit("rowIntoZone", false);
};

const thumbnailUrl = computed(() => {
  const file = {
    path: props.path,
    modified: props.modified,
  };

  return api.getPreviewURL(file as Resource, "thumb");
});

// S6-2: render the thumbnail <img> (vs. the generic icon) for images
// whenever thumbs are on, and for videos only when the server can produce
// poster frames (ffmpeg present). The same /api/preview/thumb endpoint
// serves both — for videos it returns an ffmpeg-extracted JPEG.
const showThumbnail = computed(() => {
  if (props.readOnly || !props.path) return false;
  if (props.type === "image") return enableThumbs;
  if (props.type === "video") return enableThumbs && enableVideoThumbs;
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
    fileStore.selectedCount === 1 &&
    fileStore.selected[0] === props.index
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
  renameValue.value = props.name;
  renameSubmitting = false;
  await nextTick();
  const el = renameInputEl.value;
  if (!el) return;
  el.focus();
  // Select the filename stem (everything before the last "." for files)
  const dot = !props.isDir ? props.name.lastIndexOf(".") : -1;
  el.setSelectionRange(0, dot > 0 ? dot : props.name.length);

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

// Safety net: tear down the document listener if the row unmounts
// mid-rename (e.g. user navigates away during edit). The watch handles
// the normal close path; this catches the edge case.
onBeforeUnmount(() => {
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
    nextTick(() => {
      const el = renameInputEl.value;
      if (el && isRenaming.value) el.focus();
    });
    return;
  }
  // Genuine click-away / Tab-out — cancel after a small delay so a
  // sibling click handler (e.g. on a future Save button) can register
  // before we tear down.
  setTimeout(() => {
    if (!renameSubmitting && isRenaming.value) cancelRename();
  }, 120);
};

const submitRename = async () => {
  if (renameSubmitting) return;
  const next = renameValue.value.trim();
  if (next === "" || next === props.name) {
    cancelRename();
    return;
  }
  renameSubmitting = true;
  const oldLink = props.url;
  const newLink =
    urlUtil.removeLastDir(oldLink) + "/" + encodeURIComponent(next);
  try {
    await api.move([{ from: oldLink, to: newLink }]);
    // Decode the path before queueing it — removePrefix(newLink) is
    // URL-encoded (we built newLink with encodeURIComponent), but
    // item.path in the next listing is decoded. Without this decode
    // applyPreSelection would silently fail to find the renamed item
    // and the row would lose its selection — the exact "feels broken"
    // UX the user reported.
    fileStore.setPreselect(decodeURIComponent(removePrefix(newLink)));
    fileStore.reload = true;
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

const onActionsClick = (event: MouseEvent) => {
  // Treat the actions button as a right-click on this item
  if (!isSelected.value) {
    fileStore.selected = [props.index];
  }
  contextMenu(event);
};

const dragStart = (event: DragEvent) => {
  if (fileStore.selectedCount === 0) {
    fileStore.selected.push(props.index);
  } else if (!isSelected.value) {
    fileStore.selected = [];
    fileStore.selected.push(props.index);
  }

  // Snapshot the dragged items now, before any spring-load navigation
  // can mutate `req` and cause `updateRequest()` to drop the selection.
  // Drop handlers read from `draggedItems`, not `selected`, so the move
  // survives navigation between dragstart and drop.
  if (fileStore.req) {
    fileStore.draggedItems = fileStore.selected
      .map((i) => fileStore.req!.items[i])
      .filter((it): it is ResourceItem => it != null);
  }

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
};

const dragEnd = () => {
  // Browsers fire dragend on the source after drop/cancel — always.
  // Use it as the canonical "drag is over" signal to clear the snapshot.
  fileStore.draggedItems = [];
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
    router.push({ path: props.url });
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
    // Leaving the row entirely — clear into-zone state. Spring-load is
    // cancelled inside leaveIntoZone. Note we don't emit rowIntoZone
    // here because leaveIntoZone already emits(false) when transitioning
    // out of the into-zone; the redundant emit would just be a no-op.
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

  // v1.3 H12: geometry decides which destination this drop resolves to.
  //   • In the into-zone of a droppable folder → drop INTO that folder
  //     (existing behavior below this guard).
  //   • Anywhere else on the row (alongside, or any drop on a file row,
  //     or a self-drop folder row) → forward to FileListing, which
  //     routes the move to the CURRENT folder.
  const rowEl = event.currentTarget as HTMLElement;
  const intoZone = canDrop.value && isInIntoZone(event, rowEl);

  // Always clear into-state on drop (it ends the hover regardless of
  // which branch we take).
  if (inIntoZone) {
    inIntoZone = false;
    rowEl.style.opacity = "0.5";
    emit("rowIntoZone", false);
  }

  if (!intoZone) {
    emit("dropAlongside", event);
    return;
  }

  // Pull dragged items from the snapshot taken at dragstart, NOT from
  // `selected`. Spring-load navigation may have wiped `selected` between
  // dragstart and now; the snapshot is the source of truth.
  const dragged = fileStore.draggedItems;
  if (dragged.length === 0) {
    // Empty snapshot = the drop was already handled (a single native drop
    // bubbles through multiple drop handlers; `dragend` may have cleared
    // the snapshot by the time a later one runs). Not a user-facing error
    // — silently no-op instead of toasting (RC-12).
    return;
  }

  let el = event.target as HTMLElement | null;
  for (let i = 0; i < 5; i++) {
    if (el !== null && !el.classList.contains("item")) {
      el = el.parentElement;
    }
  }

  const items: any[] = dragged.map((it) => ({
    from: it.url,
    to: props.url + encodeURIComponent(it.name),
    name: it.name,
    size: it.size,
    modified: it.modified,
    overwrite: false,
    rename: false,
  }));

  // Get url from ListingItem instance
  if (el === null) {
    return;
  }
  const path = el.__vue__.url;

  // DragEvent inherits ctrlKey/metaKey from MouseEvent — no cast needed.
  const isCopy = event.ctrlKey || event.metaKey;
  const action = (overwrite?: boolean, rename?: boolean) => {
    // runTransfer shows a delayed "Moving…/Copying…" toast, reloads the
    // listing + confirms on success, and surfaces errors — so a slow
    // drag-drop move isn't silent (RC).
    const op = isCopy ? api.copy : api.move;
    void runTransfer(() => op(items, overwrite, rename), isCopy, items);
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

  action(false, false);
};

const itemClick = (event: Event | KeyboardEvent) => {
  if (
    singleClick.value &&
    !(event as KeyboardEvent).ctrlKey &&
    !(event as KeyboardEvent).metaKey &&
    !(event as KeyboardEvent).shiftKey &&
    !fileStore.multiple
  )
    open();
  else click(event);
};

const contextMenu = (event: MouseEvent) => {
  event.preventDefault();
  if (
    fileStore.selected.length === 0 ||
    event.ctrlKey ||
    fileStore.selected.indexOf(props.index) === -1
  ) {
    click(event);
  }
};

const click = (event: Event | KeyboardEvent) => {
  if (!singleClick.value && fileStore.selectedCount !== 0)
    event.preventDefault();

  setTimeout(() => {
    touches.value = 0;
  }, 300);

  touches.value++;
  if (touches.value > 1) {
    open();
  }

  if (fileStore.selected.indexOf(props.index) !== -1) {
    // Clicking an already-selected item deselects it (toggle behavior)
    fileStore.removeSelected(props.index);
    return;
  }

  if ((event as KeyboardEvent).shiftKey && fileStore.selected.length > 0) {
    let fi = 0;
    let la = 0;

    if (props.index > fileStore.selected[0]) {
      fi = fileStore.selected[0] + 1;
      la = props.index;
    } else {
      fi = props.index;
      la = fileStore.selected[0] - 1;
    }

    for (; fi <= la; fi++) {
      if (fileStore.selected.indexOf(fi) == -1) {
        fileStore.selected.push(fi);
      }
    }

    return;
  }

  if (
    !(event as KeyboardEvent).ctrlKey &&
    !(event as KeyboardEvent).metaKey &&
    !fileStore.multiple
  ) {
    fileStore.selected = [];
  }
  fileStore.selected.push(props.index);
};

const open = () => {
  router.push({ path: props.url });
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
