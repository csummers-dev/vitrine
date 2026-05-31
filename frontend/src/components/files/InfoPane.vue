<template>
  <aside
    v-if="item"
    class="info-pane w-[320px] shrink-0 border-l border-line bg-canvas flex flex-col overflow-y-auto max-lg:fixed max-lg:top-12 max-lg:right-0 max-lg:bottom-0 max-lg:h-[calc(100vh-48px)] max-lg:z-40 max-lg:shadow-2xl max-[540px]:left-16 max-[540px]:w-auto"
  >
    <!-- Pane header -->
    <div
      class="h-12 px-4 flex items-center justify-between border-b border-line shrink-0"
    >
      <div class="text-[12px] font-semibold text-ink-2">Details</div>
      <button
        @click="close"
        class="w-6 h-6 rounded hover:bg-hover flex items-center justify-center text-ink-3 hover:text-ink-1 transition"
        title="Close"
        aria-label="Close info pane"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>

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
      class="px-4 pb-4 grid gap-1.5"
      :class="!item.isDir ? 'grid-cols-3' : 'grid-cols-2'"
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
          <dd class="text-ink-1 font-mono text-[11px]">{{ item.extension }}</dd>
        </div>
      </dl>
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

    <div class="flex-1"></div>

    <!-- Keyboard hint footer -->
    <div
      class="px-4 py-2.5 border-t border-line text-[11px] text-ink-3 flex items-center justify-between shrink-0"
    >
      <span class="flex items-center gap-1.5">
        <kbd
          class="font-mono text-[10px] px-1 py-px rounded border border-line bg-elevated"
          >Esc</kbd
        >
        <span>to close</span>
      </span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { filesize } from "@/utils";
import { enableThumbs, unzipEnabled } from "@/utils/constants";
import { files as api } from "@/api";
import dayjs from "dayjs";
import { computed, inject, onMounted, onUnmounted, ref } from "vue";

const fileStore = useFileStore();
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

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
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
/* Activate when the path is freshly in the clipboard. Subtle accent
   wash + matching ink so the flash reads as "yes, it happened". */
.info-pane__copy-path:has(svg[data-name="check"]),
.info-pane__copy-path:hover:has(svg[data-name="check"]) {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
  border-color: transparent;
}
</style>
