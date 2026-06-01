<template>
  <aside
    v-if="paneVisible"
    class="info-pane w-[320px] shrink-0 border-l border-line bg-canvas flex flex-col overflow-y-auto max-lg:fixed max-lg:top-12 max-lg:right-0 max-lg:bottom-0 max-lg:h-[calc(100vh-48px)] max-lg:z-40 max-lg:shadow-2xl max-[540px]:left-16 max-[540px]:w-auto"
  >
    <!-- Pane header -->
    <div
      class="h-12 px-4 flex items-center justify-between border-b border-line shrink-0"
    >
      <div class="text-[12px] font-semibold text-ink-2">Details</div>
      <button
        @click="isMobile ? close() : toggleCollapse()"
        class="w-6 h-6 rounded hover:bg-hover flex items-center justify-center text-ink-3 hover:text-ink-1 transition"
        :title="isMobile ? 'Close' : 'Collapse panel'"
        :aria-label="isMobile ? 'Close info pane' : 'Collapse info pane'"
      >
        <Icon :name="isMobile ? 'x' : 'panel-right-close'" :size="14" />
      </button>
    </div>

    <!-- ── State 1: a single item is selected (RC-4) ─────────────── -->
    <template v-if="item">
      <!-- Preview -->
      <div class="p-4 pb-3">
        <div
          class="aspect-[4/3] rounded-lg border border-line overflow-hidden relative flex items-center justify-center preview-mesh"
        >
          <img
            v-if="hasThumbnail"
            :src="thumbnailUrl"
            class="max-w-full max-h-full w-auto h-auto object-contain"
            :alt="item.name"
          />
          <div
            v-else
            class="w-14 h-14 rounded-xl flex items-center justify-center backdrop-blur-sm border border-line/60 shadow-sm"
            :class="iconColorClass"
          >
            <Icon :name="iconName" :size="28" :stroke-width="1.4" />
          </div>
        </div>
      </div>

      <!-- Title -->
      <div class="px-4 pb-3">
        <div
          class="text-[15px] font-semibold text-ink-1 break-words leading-snug"
        >
          {{ item.name }}
        </div>
        <div class="text-[12px] text-ink-3 mt-0.5 tabular">
          {{ typeLabel }}<span v-if="!item.isDir"> · {{ sizeLabel }}</span>
        </div>
      </div>

      <!-- Primary action grid: Share / Download / Rename / Delete — fixed positions -->
      <div class="px-4 pb-2 grid grid-cols-4 gap-1.5">
        <button
          v-if="canShare"
          @click="action('share')"
          class="info-action"
          title="Share"
        >
          <Icon name="share" :size="14" />
          <span>Share</span>
        </button>
        <button
          v-if="canDownload"
          @click="download"
          class="info-action"
          title="Download"
        >
          <Icon name="download" :size="14" />
          <span>Download</span>
        </button>
        <button
          v-if="canRename"
          @click="action('rename')"
          class="info-action"
          title="Rename"
        >
          <Icon name="pencil" :size="14" />
          <span>Rename</span>
        </button>
        <button
          v-if="canDelete"
          @click="action('delete')"
          class="info-action info-action--danger"
          title="Delete"
        >
          <Icon name="trash-2" :size="14" />
          <span>Delete</span>
        </button>
      </div>

      <!-- Secondary action row: Move / Copy / (Preview or Extract).
         For files this is a clean 3-up grid; for folders Preview/Extract
         are omitted and the row falls back to 2-col so Move + Copy still
         fill the width. The third tile swaps to "Extract" when the file
         is a `.zip` and the user can create — a zip's "preview" really is
         its contents, which is what Extract opens. -->
      <div
        v-if="canMove || canCopy || !item.isDir"
        class="pb-4 grid gap-1.5"
        :class="!item.isDir ? 'px-4 grid-cols-3' : 'grid-cols-2 w-2/3 mx-auto'"
      >
        <button
          v-if="canMove"
          @click="action('move')"
          class="info-action"
          title="Move"
        >
          <Icon name="forward" :size="14" />
          <span>Move</span>
        </button>
        <button
          v-if="canCopy"
          @click="action('copy')"
          class="info-action"
          title="Copy"
        >
          <Icon name="copy" :size="14" />
          <span>Copy</span>
        </button>
        <button
          v-if="!item.isDir && canExtract"
          @click="action('extract')"
          class="info-action"
          title="Extract zip"
        >
          <Icon name="package-open" :size="14" />
          <span>Extract</span>
        </button>
        <button
          v-else-if="!item.isDir"
          @click="open"
          class="info-action"
          title="Preview"
        >
          <Icon name="eye" :size="14" />
          <span>Preview</span>
        </button>
      </div>
      <div v-else class="pb-4"></div>

      <!-- Properties -->
      <div class="px-4 py-3 border-t border-line">
        <div
          class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-2"
        >
          Properties
        </div>
        <dl class="text-[12px] space-y-1.5">
          <div class="flex justify-between gap-3">
            <dt class="text-ink-3">Type</dt>
            <dd class="text-ink-1">{{ typeLabel }}</dd>
          </div>
          <div v-if="!item.isDir" class="flex justify-between gap-3">
            <dt class="text-ink-3">Size</dt>
            <dd class="text-ink-1 tabular">{{ sizeLabel }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-ink-3">Modified</dt>
            <dd class="text-ink-1 tabular">{{ modifiedLabel }}</dd>
          </div>
          <div v-if="item.extension" class="flex justify-between gap-3">
            <dt class="text-ink-3">Extension</dt>
            <dd class="text-ink-1 font-mono text-[11px]">
              {{ item.extension }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Tags (v1.3 S2-5). Full chip list + "Manage tags" CTA that
         opens the picker SlideOver. Empty state shows the CTA on its
         own. Reads tags from the cache populated by FileListing's
         batch fetch; falls back to forFile when stale. -->
      <div class="px-4 py-3 border-t border-line">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <div
            class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
          >
            Tags
          </div>
          <button
            type="button"
            class="info-pane__manage-tags"
            :title="itemTags.length === 0 ? 'Add tags' : 'Manage tags'"
            @click="tagPicker.open"
          >
            <Icon
              :name="itemTags.length === 0 ? 'plus' : 'pencil'"
              :size="11"
            />
            <span>{{ itemTags.length === 0 ? "Add" : "Manage" }}</span>
          </button>
        </div>
        <div v-if="itemTags.length > 0" class="info-pane__tag-list">
          <TagChip
            v-for="t in itemTags"
            :key="t.id"
            :tag="t"
            size="md"
            :focusable="false"
          />
        </div>
        <div v-else class="info-pane__tag-empty">No tags</div>
      </div>

      <!-- Location -->
      <div class="px-4 py-3 border-t border-line">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <div
            class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
          >
            Location
          </div>
          <!-- G6: Copy path action. Lives next to the Location label so
             the affordance is right where the user is looking when they
             want it. Uses the navigator.clipboard API (modern, no fallback
             needed for our target browsers). Toast confirms because the
             OS clipboard is invisible — the user needs feedback to know
             something happened. -->
          <button
            type="button"
            class="info-pane__copy-path"
            :title="copiedPath ? 'Copied!' : 'Copy path'"
            :aria-label="copiedPath ? 'Path copied' : 'Copy path'"
            @click="copyPath"
          >
            <Icon :name="copiedPath ? 'check' : 'copy'" :size="12" />
            <span>{{ copiedPath ? "Copied" : "Copy" }}</span>
          </button>
        </div>
        <div
          class="font-mono text-[11px] text-ink-2 break-all bg-elevated rounded-md px-2 py-1.5 border border-line"
        >
          {{ item.path || item.url }}
        </div>
      </div>
    </template>

    <!-- ── State 2: 2+ items selected ─────────────────────────────── -->
    <template v-else-if="selectedCount >= 2">
      <div class="ip-summary">
        <div class="ip-summary__icon ip-summary__icon--accent">
          <Icon name="layers" :size="26" :stroke-width="1.4" />
        </div>
        <div class="ip-summary__title">{{ selectedCount }} items selected</div>
        <div class="ip-summary__meta">{{ selectionSizeLabel }} total</div>
        <p class="ip-summary__hint">
          Use the action bar at the bottom of the list to move, copy, rename or
          delete the selection.
        </p>
      </div>
    </template>

    <!-- ── State 3: nothing selected → current folder summary ─────── -->
    <template v-else>
      <div class="ip-summary">
        <div class="ip-summary__icon ip-summary__icon--folder">
          <Icon name="folder" :size="26" :stroke-width="1.4" />
        </div>
        <div class="ip-summary__title">{{ folderName }}</div>
        <div class="ip-summary__meta">
          {{ folderItemCount }} {{ folderItemCount === 1 ? "item" : "items" }}
        </div>
        <dl class="ip-summary__props">
          <div class="ip-summary__prop">
            <dt>Folders</dt>
            <dd class="tabular">{{ folderDirCount }}</dd>
          </div>
          <div class="ip-summary__prop">
            <dt>Files</dt>
            <dd class="tabular">{{ folderFileCount }}</dd>
          </div>
          <div class="ip-summary__prop">
            <dt>Path</dt>
            <dd class="ip-summary__path" :title="folderPath">
              {{ folderPath }}
            </dd>
          </div>
        </dl>
        <p class="ip-summary__hint">Select an item to see its details.</p>
      </div>
    </template>

    <div class="flex-1"></div>

    <!-- Keyboard hint footer — only meaningful with a selection -->
    <div
      v-if="item"
      class="px-4 py-2.5 border-t border-line text-[11px] text-ink-3 flex items-center justify-between shrink-0"
    >
      <span class="flex items-center gap-1.5">
        <kbd
          class="font-mono text-[10px] px-1 py-px rounded border border-line bg-elevated"
          >Esc</kbd
        >
        <span>to clear</span>
      </span>
    </div>

    <!-- Tag picker sheet (v1.3 S2-5). Renders as a SlideOver via
         Teleport so it sits above the InfoPane in stacking order. -->
    <TagPickerSheet
      v-if="item"
      :open="tagPicker.isOpen.value"
      :path="item.url"
      @cancel="tagPicker.close"
      @saved="tagPicker.close"
    />
  </aside>

  <!-- Collapsed rail (desktop): a thin strip with an expand affordance
       so the pane can be reclaimed without losing the entry point. -->
  <button
    v-else-if="showRail"
    class="info-pane-rail shrink-0 border-l border-line bg-canvas flex items-start justify-center pt-3 text-ink-3 hover:text-ink-1 hover:bg-hover transition"
    title="Show details"
    aria-label="Show details panel"
    @click="toggleCollapse"
  >
    <Icon name="panel-left-open" :size="16" />
  </button>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import TagChip from "@/components/TagChip.vue";
import TagPickerSheet from "@/components/files/TagPickerSheet.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { useTagsStore } from "@/stores/tags";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { filesize } from "@/utils";
import { enableThumbs, unzipEnabled } from "@/utils/constants";
import { files as api } from "@/api";
import dayjs from "dayjs";
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import { useTagPicker } from "@/composables/useTagPicker";
import { usePreferences } from "@/composables/usePreferences";

const fileStore = useFileStore();
const tagsStore = useTagsStore();

// Tag picker open-state (v1.3 S2-5; hoisted to a singleton composable
// in S4-1 so the row context menu can also open it). The actual sheet
// component still lives in this file — only the flag moved out.
const tagPicker = useTagPicker();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

// G6: Copy-path local state. We flash the button label to "Copied" for
// ~1.5 s after a successful copy as immediate inline feedback, and ALSO
// show a toast. Double-feedback is intentional: the inline change is
// instant and right where the user clicked, the toast is durable so it
// survives them looking away.
const copiedPath = ref<boolean>(false);
let copiedResetTimer: number | null = null;

const copyPath = async () => {
  const path = item.value?.path || item.value?.url;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    copiedPath.value = true;
    if (copiedResetTimer !== null) window.clearTimeout(copiedResetTimer);
    copiedResetTimer = window.setTimeout(() => {
      copiedPath.value = false;
      copiedResetTimer = null;
    }, 1500);
    $showSuccess(`Path copied: ${path}`);
  } catch {
    // navigator.clipboard fails in insecure contexts (http://) or when
    // the user denied permission. Fall back to a manual selection prompt
    // via a one-off textarea + execCommand("copy") so the action still
    // succeeds on LAN-only HTTP setups (homelab without TLS).
    try {
      const ta = document.createElement("textarea");
      ta.value = path;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      copiedPath.value = true;
      if (copiedResetTimer !== null) window.clearTimeout(copiedResetTimer);
      copiedResetTimer = window.setTimeout(() => {
        copiedPath.value = false;
        copiedResetTimer = null;
      }, 1500);
      $showSuccess(`Path copied: ${path}`);
    } catch {
      /* both methods failed — silently no-op */
    }
  }
};

const item = computed<ResourceItem | null>(() => {
  if (!fileStore.req || fileStore.selectedCount !== 1) return null;
  const idx = fileStore.selected[0];
  return fileStore.req.items[idx] ?? null;
});

// ── RC-4: always-present details pane ───────────────────────────────
// The pane stays docked so the listing never reflows when an item is
// selected (which used to shift tiles mid-double-click and made
// double-click-to-open impossible in grid/gallery). It shows three
// states: a single item, a multi-select summary, or — when nothing is
// selected — a summary of the current folder.
const prefs = usePreferences();

const selectedCount = computed(() => fileStore.selectedCount);

// Below lg the pane reverts to an on-select overlay (an always-docked
// 320px panel would dominate a phone). Tracked via matchMedia.
const isMobile = ref(false);
const updateIsMobile = () => {
  isMobile.value =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches;
};

// Desktop collapse-to-rail, persisted across sessions.
const collapsed = ref<boolean>(
  prefs.get<boolean>("detailsPaneCollapsed", false)
);
const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
  void prefs.set("detailsPaneCollapsed", collapsed.value);
};

// Full pane: desktop always (unless collapsed), or mobile when something
// is selected (overlay). Collapsed rail: desktop only.
const paneVisible = computed(
  () =>
    (!isMobile.value && !collapsed.value) ||
    (isMobile.value && selectedCount.value >= 1)
);
const showRail = computed(() => !isMobile.value && collapsed.value);

// Folder summary (nothing selected).
const folderName = computed(() => fileStore.req?.name || "Home");
const folderDirCount = computed(() => fileStore.req?.numDirs ?? 0);
const folderFileCount = computed(() => fileStore.req?.numFiles ?? 0);
const folderItemCount = computed(
  () => folderDirCount.value + folderFileCount.value
);
const folderPath = computed(() => fileStore.req?.path ?? "/");

// Multi-select summary (2+ selected).
const selectionSizeLabel = computed(() => {
  const req = fileStore.req;
  if (!req) return "";
  const total = fileStore.selected.reduce(
    (sum, idx) => sum + (req.items[idx]?.size ?? 0),
    0
  );
  return filesize(total);
});

// Tag list for the currently-selected item. Reads from the same
// byPath cache the listing rows use → no extra HTTP, and the chip
// set stays consistent between the row + the info pane.
const itemTags = computed<Tag[]>(() => {
  if (!item.value) return [];
  return tagsStore.forPath(item.value.url);
});

const iconName = computed(() =>
  item.value
    ? fileIcon({
        isDir: item.value.isDir,
        type: item.value.type,
        name: item.value.name,
      })
    : "file"
);

const iconColorClass = computed(() =>
  item.value
    ? fileIconColor({
        isDir: item.value.isDir,
        type: item.value.type,
        name: item.value.name,
      })
    : "bg-zinc-100 text-zinc-600"
);

const hasThumbnail = computed(() => {
  return (
    enableThumbs &&
    item.value !== null &&
    item.value.type === "image" &&
    !item.value.isDir
  );
});

const thumbnailUrl = computed(() => {
  if (!item.value) return "";
  return api.getPreviewURL(item.value as Resource, "thumb");
});

const typeLabel = computed(() => {
  if (!item.value) return "";
  if (item.value.isDir) return "Folder";
  if (item.value.extension) {
    return `${item.value.extension.replace(".", "").toUpperCase()} file`;
  }
  return "File";
});

const sizeLabel = computed(() => (item.value ? filesize(item.value.size) : ""));

const modifiedLabel = computed(() => {
  if (!item.value) return "";
  const m = dayjs(item.value.modified);
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
});

const canShare = computed(
  () => !!authStore.user?.perm.share && !!authStore.user?.perm.download
);
const canDownload = computed(() => !!authStore.user?.perm.download);
const canRename = computed(() => !!authStore.user?.perm.rename);
const canDelete = computed(() => !!authStore.user?.perm.delete);
// Move requires rename perm (same backend operation); Copy requires create.
const canMove = computed(() => !!authStore.user?.perm.rename);
const canCopy = computed(() => !!authStore.user?.perm.create);
// Extract (PR #5746) — show in place of Preview when the selected file
// is a `.zip` and the user can create + the operator hasn't disabled the
// feature. Preview is useless for archives, so the slot is more valuable
// as the entry point to the panel.
const canExtract = computed(
  () =>
    unzipEnabled &&
    !!authStore.user?.perm.create &&
    !!item.value &&
    !item.value.isDir &&
    (item.value.extension ?? "").toLowerCase() === ".zip"
);

const close = () => {
  fileStore.selected = [];
};

const action = (name: string) => {
  layoutStore.showHover(name);
};

const open = () => {
  if (item.value) {
    window.location.href = item.value.url;
  }
};

const download = () => {
  if (item.value) {
    const url = api.getDownloadURL(item.value as ResourceItem, false);
    window.open(url);
  }
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === "Escape" && item.value) {
    close();
  }
};

onMounted(() => {
  window.addEventListener("keydown", onKey);
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", updateIsMobile);
});
</script>

<style scoped>
/* ── RC-4: folder-summary + multi-select states + collapsed rail ──── */
.ip-summary {
  padding: 22px 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ip-summary__icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.ip-summary__icon--folder {
  background: var(--color-amber-soft, rgba(245, 158, 11, 0.16));
  color: var(--color-amber-strong, #d97706);
}
.ip-summary__icon--accent {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
}
.ip-summary__title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  word-break: break-word;
  line-height: 1.3;
}
.ip-summary__meta {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.ip-summary__props {
  width: 100%;
  margin: 16px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--color-line, #ececec);
  display: flex;
  flex-direction: column;
  gap: 7px;
  text-align: left;
}
.ip-summary__prop {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.ip-summary__prop dt {
  color: var(--color-ink-3, #a1a1aa);
}
.ip-summary__prop dd {
  color: var(--color-ink-1, #18181b);
  margin: 0;
  min-width: 0;
}
.ip-summary__path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.ip-summary__hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.45;
  margin: 16px 0 0;
}
.info-pane-rail {
  width: 36px;
  cursor: pointer;
}

.preview-mesh {
  background:
    radial-gradient(at 20% 20%, rgba(244, 114, 182, 0.18) 0%, transparent 50%),
    radial-gradient(at 80% 30%, rgba(251, 191, 36, 0.15) 0%, transparent 50%),
    radial-gradient(at 60% 80%, rgba(94, 106, 210, 0.18) 0%, transparent 50%),
    var(--color-surface, #ffffff);
}

/* Dark-mode: bump alpha so the radial blobs still read against the dark
   surface, and let the surface token drive the base color. */
html.dark .preview-mesh {
  background:
    radial-gradient(at 20% 20%, rgba(244, 114, 182, 0.22) 0%, transparent 55%),
    radial-gradient(at 80% 30%, rgba(251, 191, 36, 0.18) 0%, transparent 55%),
    radial-gradient(at 60% 80%, rgba(94, 106, 210, 0.24) 0%, transparent 55%),
    var(--color-surface);
}

.info-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.info-action--wide {
  flex-direction: row;
  width: 100%;
  padding: 10px;
  font-size: 12px;
  gap: 6px;
}

.info-action:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.info-action--danger:hover {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}

/* RC-21: the light-red hover above reads as a bright block on the dark
   panel. Use deep, low-alpha red tones in dark mode (matches the
   destructive treatment used elsewhere, e.g. the extract error banner). */
html.dark .info-action--danger:hover {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(127, 29, 29, 0.22);
}

/* ── Copy-path button (G6) ────────────────────────────────────────
   Small ghost button sitting next to the "Location" label. Goes
   accent-tinted in the "Copied" state to reinforce the success. */
.info-pane__copy-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}
.info-pane__copy-path:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
  border-color: var(--color-line, #ececec);
}
.info-pane__copy-path:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* Tag section (v1.3 S2-5) — chip list + "Manage" button. Same visual
   shape as the Copy-path affordance so the section header pattern
   stays consistent. */
.info-pane__manage-tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-ink-2, #52525b);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease,
    border-color 0.1s ease;
}
.info-pane__manage-tags:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-accent, #5e6ad2);
  border-color: var(--color-line-strong, #d4d4d8);
}
.info-pane__manage-tags:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.info-pane__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.info-pane__tag-empty {
  font-size: 12px;
  color: var(--color-ink-3, #a1a1aa);
  font-style: italic;
}
/* Activate when the path is freshly in the clipboard. Subtle accent
   wash + matching ink so the flash reads as "yes, it happened". */
.info-pane__copy-path:has(svg[data-name="check"]),
.info-pane__copy-path:hover:has(svg[data-name="check"]) {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
  border-color: transparent;
}
</style>
