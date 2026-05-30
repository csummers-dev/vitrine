<template>
  <div
    class="item"
    :class="{ 'item--spring-loaded': springProgress > 0 }"
    role="button"
    tabindex="0"
    :draggable="isDraggable"
    @dragstart="dragStart"
    @dragenter="onDragEnter"
    @dragover="dragOver"
    @dragleave="onDragLeave"
    @drop="drop"
    @click="itemClick"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchCancel"
    @touchmove="handleTouchMove"
    :data-dir="isDir"
    :data-type="type"
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
        <img
          v-if="!readOnly && type === 'image' && isThumbsEnabled"
          v-lazy="thumbnailUrl"
          class="item__thumb"
        />
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
          @keydown.enter.prevent.stop="submitRename"
          @keydown.esc.prevent.stop="cancelRename"
          @blur="onRenameBlur"
        />
        <span v-else class="item__name-text name">{{ name }}</span>
        <div class="item__name-compact-meta">
          <time :datetime="modified">{{ humanTime() }}</time>
          <span v-if="!isDir"> · {{ humanSize() }}</span>
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
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

import { enableThumbs } from "@/utils/constants";
import { filesize } from "@/utils";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import dayjs from "dayjs";
import { files as api } from "@/api";
import { removePrefix } from "@/api/utils";
import urlUtil from "@/utils/url";
import * as upload from "@/utils/upload";
import { computed, inject, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";

const touches = ref<number>(0);

const longPressTimer = ref<number | null>(null);
const longPressTriggered = ref<boolean>(false);
const longPressDelay = ref<number>(500);
const startPosition = ref<{ x: number; y: number } | null>(null);
const moveThreshold = ref<number>(10);

const $showError = inject<IToastError>("$showError")!;
const router = useRouter();

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

const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

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

const thumbnailUrl = computed(() => {
  const file = {
    path: props.path,
    modified: props.modified,
  };

  return api.getPreviewURL(file as Resource, "thumb");
});

const isThumbsEnabled = computed(() => {
  return enableThumbs;
});

const iconName = computed(() =>
  fileIcon({ isDir: props.isDir, type: props.type, name: props.name })
);

const iconColorClass = computed(() =>
  fileIconColor({ isDir: props.isDir, type: props.type, name: props.name })
);

// ── Inline rename (Stage 8) ─────────────────────────────────────────────
// This row enters edit mode when the rename prompt is active and it's the
// only selected item. Auto-focus the input on entry; ↵ commits, Esc cancels,
// blur cancels (with a small race guard so submitting doesn't double-fire).
const renameValue = ref<string>("");
const renameInputEl = ref<HTMLInputElement | null>(null);
let renameSubmitting = false;

const isRenaming = computed(() => {
  return (
    layoutStore.currentPromptName === "rename" &&
    fileStore.selectedCount === 1 &&
    fileStore.selected[0] === props.index
  );
});

watch(isRenaming, async (active) => {
  if (!active) return;
  renameValue.value = props.name;
  renameSubmitting = false;
  await nextTick();
  const el = renameInputEl.value;
  if (!el) return;
  el.focus();
  // Select the filename stem (everything before the last "." for files)
  const dot = !props.isDir ? props.name.lastIndexOf(".") : -1;
  el.setSelectionRange(0, dot > 0 ? dot : props.name.length);
});

const cancelRename = () => {
  if (renameSubmitting) return;
  layoutStore.closeHovers();
};

const onRenameBlur = () => {
  if (renameSubmitting) return;
  // Tiny delay so a sibling click (e.g. on a hypothetical "Save" button)
  // can register before we cancel.
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
    fileStore.preselect = removePrefix(newLink);
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

const dragStart = () => {
  if (fileStore.selectedCount === 0) {
    fileStore.selected.push(props.index);
    return;
  }

  if (!isSelected.value) {
    fileStore.selected = [];
    fileStore.selected.push(props.index);
  }
};

const dragOver = (event: Event) => {
  if (!canDrop.value) return;

  event.preventDefault();
  let el = event.target as HTMLElement | null;
  if (el !== null) {
    for (let i = 0; i < 5; i++) {
      if (!el?.classList.contains("item")) {
        el = el?.parentElement ?? null;
      }
    }

    if (el !== null) el.style.opacity = "1";
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
  if (!canDrop.value) return;
  event.preventDefault();
  dragDepth++;
  if (dragDepth === 1) startSpringLoad();
};

const onDragLeave = (event: DragEvent) => {
  if (!canDrop.value) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) cancelSpringLoad();
  void event;
};

const drop = async (event: Event) => {
  // A real drop wins over the pending spring-load — kill the timer
  // before any conflict prompts so we don't navigate mid-resolve.
  dragDepth = 0;
  cancelSpringLoad();

  if (!canDrop.value) return;
  event.preventDefault();

  if (fileStore.selectedCount === 0) return;

  let el = event.target as HTMLElement | null;
  for (let i = 0; i < 5; i++) {
    if (el !== null && !el.classList.contains("item")) {
      el = el.parentElement;
    }
  }

  const items: any[] = [];

  for (const i of fileStore.selected) {
    if (fileStore.req) {
      items.push({
        from: fileStore.req?.items[i].url,
        to: props.url + encodeURIComponent(fileStore.req?.items[i].name),
        name: fileStore.req?.items[i].name,
        size: fileStore.req?.items[i].size,
        modified: fileStore.req?.items[i].modified,
        overwrite: false,
        rename: false,
      });
    }
  }

  // Get url from ListingItem instance
  if (el === null) {
    return;
  }
  const path = el.__vue__.url;

  const action = (overwrite?: boolean, rename?: boolean) => {
    const action =
      (event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey
        ? api.copy
        : api.move;
    action(items, overwrite, rename)
      .then(() => {
        fileStore.reload = true;
      })
      .catch($showError);
  };

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

const itemClick = (event: Event | KeyboardEvent) => {
  // If long press was triggered, prevent normal click behavior
  if (longPressTriggered.value) {
    longPressTriggered.value = false;
    return;
  }

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

// Long-press helper functions
const startLongPress = (clientX: number, clientY: number) => {
  startPosition.value = { x: clientX, y: clientY };
  longPressTimer.value = window.setTimeout(() => {
    handleLongPress();
  }, longPressDelay.value);
};

const cancelLongPress = () => {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  startPosition.value = null;
};

const handleLongPress = () => {
  if (singleClick.value) {
    longPressTriggered.value = true;
    click(new Event("longpress"));
  }
  cancelLongPress();
};

const checkMovement = (clientX: number, clientY: number): boolean => {
  if (!startPosition.value) return false;

  const deltaX = Math.abs(clientX - startPosition.value.x);
  const deltaY = Math.abs(clientY - startPosition.value.y);

  return deltaX > moveThreshold.value || deltaY > moveThreshold.value;
};

// Event handlers
const handleMouseDown = (event: MouseEvent) => {
  if (event.button === 0) {
    startLongPress(event.clientX, event.clientY);
  }
};

const handleMouseUp = () => {
  cancelLongPress();
};

const handleMouseLeave = () => {
  cancelLongPress();
};

const handleTouchStart = (event: TouchEvent) => {
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    startLongPress(touch.clientX, touch.clientY);
  }
};

const handleTouchEnd = () => {
  cancelLongPress();
};

const handleTouchCancel = () => {
  cancelLongPress();
};

const handleTouchMove = (event: TouchEvent) => {
  if (event.touches.length === 1 && startPosition.value) {
    const touch = event.touches[0];
    if (checkMovement(touch.clientX, touch.clientY)) {
      cancelLongPress();
    }
  }
};
</script>
