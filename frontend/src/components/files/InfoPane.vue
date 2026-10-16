<template>
  <!-- Details panel (Phase 6, 4.5). Beside the list from 1100 px, over it
       with a scrim from 768 px, a bottom sheet on phones. The `info-pane`
       class names stay for custom.css (Decision 9). -->
  <div
    v-if="isOpen && mode !== 'docked'"
    class="info-pane-scrim"
    data-testid="details-scrim"
    aria-hidden="true"
    @click="panel.hide()"
  ></div>
  <aside
    v-if="isOpen"
    ref="paneEl"
    class="info-pane"
    :class="`info-pane--${mode}`"
    aria-labelledby="details-title"
    data-testid="details-panel"
    @keydown.esc.stop="onEsc"
  >
    <header class="ip-head">
      <h2 id="details-title" class="ip-head__title">Details</h2>
      <UiIconButton
        icon="x"
        size="sm"
        label="Close details"
        @click="panel.hide()"
      />
    </header>

    <div class="ip-scroll">
      <!-- ── One item ─────────────────────────────────────────────── -->
      <template v-if="item">
        <div class="ip-preview" :class="{ 'ip-preview--text': !!textPreview }">
          <img
            v-if="hasThumbnail && !thumbFailed"
            :src="thumbnailUrl"
            class="ip-preview__img"
            alt=""
            @error="thumbFailed = true"
          />
          <img
            v-else-if="albumArtUrl"
            :src="albumArtUrl"
            class="ip-preview__img"
            alt="Album artwork"
          />
          <img
            v-else-if="epubCoverUrl"
            :src="epubCoverUrl"
            class="ip-preview__cover"
            alt="Book cover"
          />
          <pre
            v-else-if="textPreview"
            class="ip-preview__text"
            data-testid="details-text-preview"
            >{{ textPreview }}</pre
          >
          <div
            v-else
            class="ip-preview__tile"
            :class="item.isDir ? 'ip-preview__tile--folder' : iconColorClass"
          >
            <Icon
              :name="iconName"
              :size="40"
              :stroke-width="1.5"
              :fill="item.isDir ? 'currentColor' : 'none'"
            />
          </div>
          <template v-if="videoResume">
            <span class="ip-preview__progress" aria-hidden="true"
              ><span
                class="ip-preview__progress-fill"
                :style="{
                  width: `${Math.round(videoResume.fraction * 100)}%`,
                }"
            /></span>
            <span class="ip-preview__chip">
              Stopped at {{ videoResume.at }}
            </span>
          </template>
        </div>

        <h3 class="ip-name">
          <template v-for="(seg, i) in nameSegments" :key="i"
            >{{ seg }}<wbr
          /></template>
        </h3>
        <p class="ip-sub tabular">
          {{ kindLabel }}<span v-if="sizeText"> · {{ sizeText }}</span>
        </p>

        <div class="ip-actions">
          <UiButton
            variant="primary"
            size="sm"
            :icon="openIcon"
            data-testid="details-open"
            @click="open"
            >{{ openLabel }}</UiButton
          >
          <UiButton v-if="canShare" size="sm" icon="share" @click="act('share')"
            >Share</UiButton
          >
          <UiButton
            v-if="canDownload"
            size="sm"
            icon="download"
            @click="download"
            >Download</UiButton
          >
          <UiIconButton
            icon="ellipsis"
            size="sm"
            variant="secondary"
            :label="`More actions for ${item.name}`"
            @click="openMenu"
          />
        </div>

        <section class="ip-section" aria-labelledby="ip-info">
          <h4 id="ip-info" class="ip-section__title">Information</h4>
          <dl class="ip-props">
            <div>
              <dt>Kind</dt>
              <dd>{{ kindLabel }}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd class="tabular">{{ sizeText || "—" }}</dd>
            </div>
            <div>
              <dt>Modified</dt>
              <dd class="tabular">
                <time :datetime="item.modified">{{
                  fullDate(item.modified)
                }}</time>
              </dd>
            </div>
            <div class="ip-props__where">
              <dt>Where</dt>
              <dd>
                <span class="ip-path" :title="itemPath">{{ itemPath }}</span>
                <UiIconButton
                  :icon="copiedPath ? 'check' : 'copy'"
                  size="sm"
                  :label="copiedPath ? 'Path copied' : 'Copy path'"
                  @click="copyPath"
                />
              </dd>
            </div>
          </dl>
        </section>

        <section
          v-if="audioTagRows.length > 0"
          class="ip-section"
          aria-labelledby="ip-audio"
        >
          <h4 id="ip-audio" class="ip-section__title">Audio tags</h4>
          <dl class="ip-props">
            <div v-for="row in audioTagRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="ip-section" aria-labelledby="ip-tags">
          <div class="ip-section__head">
            <h4 id="ip-tags" class="ip-section__title">Tags</h4>
            <UiButton
              variant="ghost"
              size="sm"
              :icon="itemTags.length === 0 ? 'plus' : 'pencil'"
              @click="tagPicker.open"
              >{{ itemTags.length === 0 ? "Add" : "Edit" }}</UiButton
            >
          </div>
          <div v-if="itemTags.length > 0" class="ip-tags">
            <TagChip
              v-for="t in itemTags"
              :key="t.id"
              :tag="t"
              size="md"
              :focusable="false"
            />
          </div>
          <p v-else class="ip-muted">No tags</p>
        </section>
      </template>

      <!-- ── Several items ────────────────────────────────────────── -->
      <template v-else-if="selectedCount >= 2">
        <div class="ip-summary" data-testid="details-multi">
          <div class="ip-summary__tile kind-other">
            <Icon name="layers" :size="28" :stroke-width="1.5" />
          </div>
          <h3 class="ip-name">{{ selectedCount }} items selected</h3>
          <p class="ip-sub tabular">{{ selectionSizeLabel }}</p>
        </div>
        <div class="ip-actions ip-actions--wrap">
          <UiButton
            v-if="canDownload"
            size="sm"
            icon="download"
            @click="act('download')"
            >Download</UiButton
          >
          <UiButton v-if="canMove" size="sm" icon="forward" @click="act('move')"
            >Move</UiButton
          >
          <UiButton v-if="canCopy" size="sm" icon="copy" @click="act('copy')"
            >Copy</UiButton
          >
          <UiButton
            v-if="canDelete"
            size="sm"
            variant="danger"
            icon="trash-2"
            @click="act('delete')"
            >Delete</UiButton
          >
        </div>
        <section class="ip-section" aria-labelledby="ip-kinds">
          <h4 id="ip-kinds" class="ip-section__title">Selection</h4>
          <dl class="ip-props">
            <div v-for="k in selectionKinds" :key="k.label">
              <dt>{{ k.label }}</dt>
              <dd class="tabular">{{ k.count }}</dd>
            </div>
            <div>
              <dt>Total size</dt>
              <dd class="tabular">{{ selectionSizeLabel }}</dd>
            </div>
          </dl>
        </section>
      </template>

      <!-- ── Nothing selected: the folder on screen ───────────────── -->
      <template v-else>
        <div class="ip-summary" data-testid="details-folder">
          <div class="ip-summary__tile ip-summary__tile--folder">
            <Icon
              name="folder"
              :size="28"
              :stroke-width="1.4"
              fill="currentColor"
            />
          </div>
          <h3 class="ip-name">{{ folderName }}</h3>
          <p class="ip-sub tabular">
            {{ folderItemCount }} {{ folderItemCount === 1 ? "item" : "items" }}
          </p>
        </div>
        <section class="ip-section" aria-labelledby="ip-folder">
          <h4 id="ip-folder" class="ip-section__title">Information</h4>
          <dl class="ip-props">
            <div>
              <dt>Size</dt>
              <dd class="tabular">{{ currentFolderSize }}</dd>
            </div>
            <div>
              <dt>Folders</dt>
              <dd class="tabular">{{ folderDirCount }}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd class="tabular">{{ folderFileCount }}</dd>
            </div>
            <div v-if="fileStore.req?.modified">
              <dt>Modified</dt>
              <dd class="tabular">{{ fullDate(fileStore.req.modified) }}</dd>
            </div>
            <div class="ip-props__where">
              <dt>Where</dt>
              <dd>
                <span class="ip-path" :title="folderPath">{{
                  folderPath
                }}</span>
              </dd>
            </div>
          </dl>
          <p class="ip-muted ip-hint">Select an item to see its details.</p>
        </section>
      </template>
    </div>

    <ContextMenu
      :show="menu.show"
      :pos="menu.pos"
      :items="menuItems"
      @hide="menu.show = false"
    />

    <TagPickerSheet
      v-if="item"
      :open="tagPicker.isOpen.value"
      :path="item.url"
      @cancel="tagPicker.close"
      @saved="tagPicker.close"
    />
  </aside>
</template>

<script setup lang="ts">
/**
 * The details panel (Phase 6, 4.5): what the selection is, at a glance, and
 * the few things you do with it. One item shows a preview, its information,
 * tags and its main actions (the rest are in the ⋯ menu); several items show
 * a count, total size and kinds with the actions they share; nothing selected
 * shows the folder on screen. Open state and layout: useDetailsPanel.
 */
import Icon from "@/components/Icon.vue";
import TagChip from "@/components/TagChip.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiIconButton from "@/components/ui/UiIconButton.vue";
import TagPickerSheet from "@/components/files/TagPickerSheet.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { useTagsStore } from "@/stores/tags";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { filesize } from "@/utils";
import {
  enableThumbs,
  enableVideoThumbs,
  enablePdfThumbs,
  unzipEnabled,
} from "@/utils/constants";
import { isExtractable } from "@/utils/archive";
import { isAudioTaggable } from "@/utils/audio";
import { files as api, audiotags as audioTagsApi } from "@/api";
import type { Book } from "epubjs";
import dayjs from "dayjs";
import {
  computed,
  inject,
  nextTick,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { useTagPicker } from "@/composables/useTagPicker";
import { useFolderSizes } from "@/composables/useFolderSizes";
import { useDetailsPanel } from "@/composables/useDetailsPanel";
import {
  useVideoProgress,
  formatTimestamp,
} from "@/composables/useVideoProgress";
import { useRootLabel } from "@/composables/useRootLabel";

const fileStore = useFileStore();
const tagsStore = useTagsStore();
const authStore = useAuthStore();
const layoutStore = useLayoutStore();
const router = useRouter();
const tagPicker = useTagPicker();
const panel = useDetailsPanel();
const { rootLabel } = useRootLabel();
const $showSuccess = inject<IToastSuccess>("$showSuccess", () => {});

const isOpen = computed(() => panel.isOpen.value);
const mode = computed(() => panel.mode.value);

// Over the list (overlay or sheet), focus moves into the panel so keyboard
// users land where the new content is; Escape closes it.
const paneEl = ref<HTMLElement | null>(null);
watch(
  () => isOpen.value && mode.value !== "docked",
  (floating) => {
    if (floating)
      void nextTick(() => paneEl.value?.querySelector("button")?.focus());
  }
);
const onEsc = () => {
  if (mode.value !== "docked") panel.hide();
};

const item = computed<ResourceItem | null>(() => {
  if (!fileStore.req || fileStore.selectedCount !== 1) return null;
  return fileStore.req.items[fileStore.selected[0]] ?? null;
});
const selectedCount = computed(() => fileStore.selectedCount);

// ── Sizes ─────────────────────────────────────────────────────────────
const folderSizes = useFolderSizes();
const modKey = (it: { modified?: string }) => String(it.modified ?? "");
const folderSizeOf = (it: ResourceItem): number | undefined =>
  folderSizes.cached(it.url, modKey(it));

watch(
  () =>
    [
      isOpen.value,
      item.value,
      fileStore.selected.slice(),
      fileStore.req?.url,
    ] as const,
  () => {
    const req = fileStore.req;
    if (!isOpen.value || !req) return;
    if (req.url && selectedCount.value === 0)
      void folderSizes.ensure(req.url, modKey(req));
    for (const i of fileStore.selected) {
      const it = req.items[i];
      if (it?.isDir && it.url) void folderSizes.ensure(it.url, modKey(it));
    }
  },
  { immediate: true }
);

const sizeText = computed(() => {
  const it = item.value;
  if (!it) return "";
  if (!it.isDir) return filesize(it.size);
  const s = folderSizeOf(it);
  return s === undefined ? "" : filesize(s);
});

const currentFolderSize = computed(() => {
  const req = fileStore.req;
  if (!req?.url) return "—";
  const s = folderSizes.cached(req.url, modKey(req));
  return s === undefined ? "—" : filesize(s);
});

// ── One item ──────────────────────────────────────────────────────────
const thumbFailed = ref(false);
watch(item, () => (thumbFailed.value = false));

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
    : "kind-other"
);

const hasThumbnail = computed(() => {
  const it = item.value;
  if (!enableThumbs || !it || it.isDir) return false;
  if (it.type === "image") return true;
  if (it.type === "video") return enableVideoThumbs;
  if (it.type === "pdf") return enablePdfThumbs;
  const n = (it.name || "").toLowerCase();
  return n.endsWith(".cbr") || n.endsWith(".cbz");
});
const thumbnailUrl = computed(() =>
  item.value ? api.getPreviewURL(item.value as Resource, "thumb") : ""
);

const nameSegments = computed(() =>
  (item.value?.name ?? "").split(/(?<=[._\-\s/])/)
);

const KIND_NAMES: Record<string, [string, string]> = {
  dir: ["Folder", "Folders"],
  image: ["Image", "Images"],
  video: ["Video", "Videos"],
  audio: ["Audio", "Audio files"],
  pdf: ["PDF document", "PDFs"],
  text: ["Text document", "Text documents"],
  textImmutable: ["Text document", "Text documents"],
};
const kindOf = (it: { isDir: boolean; type: string; extension?: string }) => {
  if (it.isDir) return KIND_NAMES.dir;
  const k = KIND_NAMES[it.type];
  if (k) return k;
  const ext = it.extension?.replace(".", "").toUpperCase();
  return ext ? [`${ext} file`, `${ext} files`] : ["File", "Files"];
};
const kindLabel = computed(() => (item.value ? kindOf(item.value)[0] : ""));

const itemPath = computed(() => item.value?.path || item.value?.url || "");

const fullDate = (iso: string) => {
  const m = dayjs(iso);
  return m.isValid() ? m.format("MMM D, YYYY [at] HH:mm") : "—";
};

// Video: where playback stopped, over the poster.
const videoProgress = useVideoProgress();
const videoResume = computed(() => {
  const it = item.value;
  if (!it || it.type !== "video" || !it.path) return null;
  const fraction = videoProgress.fraction(it.path);
  const at = videoProgress.get(it.path)?.t ?? 0;
  return fraction > 0 ? { fraction, at: formatTimestamp(at) } : null;
});

// Text: the first lines, read from the file (small files only).
const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
const TEXT_PREVIEW_LINES = 14;
const textPreview = ref("");
let textToken = 0;
watch(
  () => {
    const it = item.value;
    return it &&
      isOpen.value &&
      !it.isDir &&
      (it.type === "text" || it.type === "textImmutable") &&
      it.size <= TEXT_PREVIEW_MAX_BYTES
      ? `${it.url}#${it.modified}`
      : null;
  },
  async (key) => {
    const token = ++textToken;
    textPreview.value = "";
    if (!key || !item.value) return;
    try {
      const res = await api.fetch(item.value.url);
      if (token !== textToken) return;
      const content = (res as Resource).content ?? "";
      textPreview.value = content
        .split("\n")
        .slice(0, TEXT_PREVIEW_LINES)
        .join("\n");
    } catch {
      /* unreadable: the kind tile shows instead */
    }
  },
  { immediate: true }
);

const tagsOf = (url: string) =>
  [...tagsStore.forPath(url)].sort((a, b) => a.name.localeCompare(b.name));
const itemTags = computed<Tag[]>(() =>
  item.value ? tagsOf(item.value.url) : []
);

// ── Actions ───────────────────────────────────────────────────────────
const perm = computed(() => authStore.user?.perm);
const canShare = computed(() => !!perm.value?.share && !!perm.value?.download);
const canDownload = computed(() => !!perm.value?.download);
const canRename = computed(() => !!perm.value?.rename);
const canDelete = computed(() => !!perm.value?.delete);
const canMove = computed(() => !!perm.value?.rename);
const canCopy = computed(() => !!perm.value?.create);
const canExtract = computed(
  () =>
    unzipEnabled &&
    !!perm.value?.create &&
    !!item.value &&
    !item.value.isDir &&
    isExtractable(item.value.name)
);

const isPlayable = computed(
  () => item.value?.type === "video" || item.value?.type === "audio"
);
const openLabel = computed(() => (isPlayable.value ? "Play" : "Open"));
const openIcon = computed(() =>
  isPlayable.value ? "play" : item.value?.isDir ? "folder-open" : "eye"
);

const act = (name: string) => {
  if (mode.value !== "docked") panel.hide();
  layoutStore.showHover(name);
};
const open = () => {
  if (!item.value) return;
  if (mode.value !== "docked") panel.hide();
  void router.push(item.value.url);
};
const download = () => {
  if (item.value) window.open(api.getDownloadURL(item.value, false));
};

const copiedPath = ref(false);
let copiedTimer: number | null = null;
const copyPath = async () => {
  const path = itemPath.value;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    // Plain-HTTP LAN setups have no async clipboard: fall back.
    const ta = document.createElement("textarea");
    ta.value = path;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  copiedPath.value = true;
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copiedPath.value = false), 1500);
  $showSuccess(`Path copied: ${path}`);
};

const menu = reactive({ show: false, pos: { x: 0, y: 0 } });
const openMenu = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menu.pos = { x: r.left, y: r.bottom + 4 };
  menu.show = true;
};
const menuItems = computed<MenuItem[]>(() => {
  if (!item.value) return [];
  const items: MenuItem[] = [];
  if (canRename.value)
    items.push({
      label: "Rename",
      icon: "pencil",
      action: () => act("rename"),
    });
  if (canMove.value)
    items.push({ label: "Move", icon: "forward", action: () => act("move") });
  if (canCopy.value)
    items.push({ label: "Copy", icon: "copy", action: () => act("copy") });
  if (canExtract.value)
    items.push({
      label: "Extract",
      icon: "package-open",
      action: () => act("extract"),
    });
  if (canEditTags.value)
    items.push({
      label: "Edit audio tags",
      icon: "music",
      action: () => act("audio-tags"),
    });
  items.push({
    label: "Copy path",
    icon: "link",
    action: () => void copyPath(),
  });
  if (canDelete.value)
    items.push(
      { type: "separator" },
      {
        label: "Delete",
        icon: "trash-2",
        destructive: true,
        action: () => act("delete"),
      }
    );
  return items;
});

// ── Several items ─────────────────────────────────────────────────────
const selectedItems = computed(() => {
  const req = fileStore.req;
  if (!req) return [];
  return fileStore.selected
    .map((i) => req.items[i])
    .filter((x): x is ResourceItem => !!x);
});
const selectionKinds = computed(() => {
  const counts = new Map<string, number>();
  for (const it of selectedItems.value) {
    const [one, many] = kindOf(it);
    const key = `${one}|${many}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [one, many] = key.split("|");
      return { label: count === 1 ? one : many, count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
});
const selectionSizeLabel = computed(() => {
  let total = 0;
  let pending = false;
  for (const it of selectedItems.value) {
    if (!it.isDir) total += it.size ?? 0;
    else {
      const s = folderSizeOf(it);
      if (s === undefined) pending = true;
      else total += s;
    }
  }
  return pending ? `${filesize(total)} so far` : filesize(total);
});

// ── Nothing selected ──────────────────────────────────────────────────
const folderName = computed(
  () => fileStore.req?.name || rootLabel.value || "My files"
);
const folderDirCount = computed(() => fileStore.req?.numDirs ?? 0);
const folderFileCount = computed(() => fileStore.req?.numFiles ?? 0);
const folderItemCount = computed(
  () => folderDirCount.value + folderFileCount.value
);
const folderPath = computed(() => fileStore.req?.path ?? "/");

// ── Album art for a selected music file (RC-42) ─────────────────────
// Mirrors AudioViewer's approach (E2): range-fetch the file header
// (ID3v2 + APIC live in the first few hundred KB) and parse it client-
// side. `music-metadata` is dynamically imported so it never enters the
// always-loaded listing bundle — only when an audio file is selected.
const albumArtUrl = ref<string>("");
let albumArtRevocable: string | null = null;
let albumArtToken = 0;
let albumArtAbort: AbortController | null = null;
// V3-E #17: match AudioViewer — 512 KB sliced large OGG covers in half (the
// Vorbis-comment picture is base64-inflated and overruns the header window).
// 2 MB captures the full cover; the fetch is aborted the moment the selection
// moves on, so browsing isn't slowed by the larger window.
const AUDIO_META_RANGE = 2 * 1024 * 1024; // 2 MB

const isAudio = computed(
  () => !!item.value && !item.value.isDir && item.value.type === "audio"
);

const clearAlbumArt = () => {
  // Cancel any in-flight range fetch so a rapid selection sweep doesn't leave
  // a stack of pending 512 KB requests (RC review #4).
  if (albumArtAbort) {
    albumArtAbort.abort();
    albumArtAbort = null;
  }
  if (albumArtRevocable) {
    URL.revokeObjectURL(albumArtRevocable);
    albumArtRevocable = null;
  }
  albumArtUrl.value = "";
};

const loadAlbumArt = async (resource: ResourceItem) => {
  const token = ++albumArtToken;
  clearAlbumArt(); // also aborts any previous in-flight fetch
  const ctrl = new AbortController();
  albumArtAbort = ctrl;
  try {
    const url = api.getDownloadURL(resource, true);
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${AUDIO_META_RANGE - 1}` },
      signal: ctrl.signal,
    });
    if (token !== albumArtToken) return; // selection moved on
    if (!res.ok && res.status !== 206) return;
    const blob = await res.blob();
    if (token !== albumArtToken) return;
    const { parseBlob } = await import("music-metadata");
    const parsed = await parseBlob(blob);
    if (token !== albumArtToken) return;
    const pic = parsed.common.picture?.[0];
    if (!pic) return; // no embedded art → keep the generic music icon
    const artBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
    const objUrl = URL.createObjectURL(artBlob);
    albumArtRevocable = objUrl;
    albumArtUrl.value = objUrl;
  } catch {
    /* parse failure / aborted — fall back to the generic icon */
  }
};

// Re-extract whenever the selected audio file changes; clear for anything
// that isn't a single audio file.
watch(
  () => (isAudio.value ? (item.value?.url ?? null) : null),
  (url) => {
    if (url) void loadAlbumArt(item.value as ResourceItem);
    else clearAlbumArt();
  },
  { immediate: true }
);

onUnmounted(clearAlbumArt);

// ── WS7 #6 + #8: audio tag entry point + read-only tag display ──────
// A single selected MP3/FLAC/… file. #6 surfaces an "Edit tags" button
// (gated on perm.modify); #8 lists its non-empty tags read-only (no perm
// needed — reading is harmless and useful even without edit rights).
const isTaggableAudioFile = computed(
  () => !!item.value && !item.value.isDir && isAudioTaggable(item.value.name)
);
const canEditTags = computed(
  () => isTaggableAudioFile.value && !!authStore.user?.perm.modify
);

const audioTagRows = ref<Array<{ label: string; value: string }>>([]);
let audioTagsToken = 0;
const AUDIO_TAG_FIELDS: Array<{ key: string; label: string }> = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "albumArtist", label: "Album artist" },
  { key: "year", label: "Year" },
  { key: "track", label: "Track" },
  { key: "disc", label: "Disc" },
  { key: "genres", label: "Genre" },
  { key: "composer", label: "Composer" },
];

const clearAudioTags = () => {
  audioTagsToken++;
  audioTagRows.value = [];
};

const loadAudioTags = async (resource: ResourceItem) => {
  const token = ++audioTagsToken;
  audioTagRows.value = [];
  const path = resource.path || resource.url;
  if (!path) return;
  try {
    const results = await audioTagsApi.read([path]);
    if (token !== audioTagsToken) return;
    const tags = results[0]?.tags;
    if (!tags) return;
    const rows: Array<{ label: string; value: string }> = [];
    for (const f of AUDIO_TAG_FIELDS) {
      const raw =
        f.key === "genres"
          ? (tags.genres ?? []).join(", ")
          : ((tags as unknown as Record<string, string>)[f.key] ?? "");
      if (raw && raw.trim()) rows.push({ label: f.label, value: raw });
    }
    audioTagRows.value = rows;
  } catch {
    /* read failed (corrupt / unsupported) — show nothing */
  }
};

// Re-read when the selected taggable audio file changes OR its modified time
// bumps (a tag save), so the read-only list never goes stale after an edit.
watch(
  () =>
    isTaggableAudioFile.value
      ? `${item.value?.url ?? ""}#${item.value?.modified ?? ""}`
      : null,
  (key) => {
    if (key && item.value) void loadAudioTags(item.value as ResourceItem);
    else clearAudioTags();
  },
  { immediate: true }
);
onUnmounted(clearAudioTags);

// ── Embedded cover art for a selected EPUB (batch #4) ───────────────
// The Preview pane shows the cover because it mounts EpubViewer, which
// loads epub.js and calls book.coverUrl(). The details pane never mounts
// the reader, so it had no cover. Mirror the album-art approach: lazily
// import epub.js (kept OUT of the always-loaded listing bundle via the
// dynamic import — it stays in the shared epubjs async chunk), open the
// book just long enough to resolve its cover into our OWN blob URL, then
// destroy the book so the archive doesn't linger in memory.
const epubCoverUrl = ref<string>("");
let epubCoverRevocable: string | null = null;
let epubCoverToken = 0;

const isEpub = computed(
  () =>
    !!item.value &&
    !item.value.isDir &&
    item.value.extension?.toLowerCase() === ".epub"
);

const clearEpubCover = () => {
  // Bump the token so any in-flight load drops its result on return.
  epubCoverToken++;
  if (epubCoverRevocable) {
    URL.revokeObjectURL(epubCoverRevocable);
    epubCoverRevocable = null;
  }
  epubCoverUrl.value = "";
};

const loadEpubCover = async (resource: ResourceItem) => {
  const token = ++epubCoverToken;
  if (epubCoverRevocable) {
    URL.revokeObjectURL(epubCoverRevocable);
    epubCoverRevocable = null;
  }
  epubCoverUrl.value = "";
  let book: Book | null = null;
  try {
    // The ?auth= token in the inline download URL is the real
    // authenticator (same as the working preview path, RC-44), so we
    // don't need requestCredentials. openAs:'epub' skips epub.js's
    // extension sniff, which the auth JWT's dots otherwise confuse.
    const url = api.getDownloadURL(resource, true);
    const ePub = (await import("epubjs")).default;
    if (token !== epubCoverToken) return; // selection moved on
    book = ePub(url, { openAs: "epub" });
    await book.ready;
    if (token !== epubCoverToken) return;
    const coverUrl = await book.coverUrl();
    if (token !== epubCoverToken || !coverUrl) return;
    // Copy the cover into our OWN blob URL so it survives book.destroy()
    // (which revokes epub.js's internally-created archive URLs).
    const blob = await (await fetch(coverUrl)).blob();
    if (token !== epubCoverToken) return;
    const objUrl = URL.createObjectURL(blob);
    epubCoverRevocable = objUrl;
    epubCoverUrl.value = objUrl;
  } catch {
    /* no cover / open failed — keep the generic book glyph */
  } finally {
    try {
      book?.destroy();
    } catch {
      /* ignore */
    }
  }
};

// Re-extract whenever the selected EPUB changes; clear for anything else.
watch(
  () => (isEpub.value ? (item.value?.url ?? null) : null),
  (url) => {
    if (url) void loadEpubCover(item.value as ResourceItem);
    else clearEpubCover();
  },
  { immediate: true }
);

onUnmounted(clearEpubCover);

onUnmounted(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<style scoped>
.info-pane {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--color-panel);
  color: var(--color-ink-1);
}

/* Over the list (768–1099 px): a floating panel at the right edge. */
.info-pane--overlay {
  position: fixed;
  top: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 41;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2);
}

/* Phones: a bottom sheet. */
.info-pane--sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  max-height: 82vh;
  z-index: 41;
  border-top: 1px solid var(--color-line);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-2);
  padding-bottom: env(safe-area-inset-bottom);
}

.info-pane-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: var(--scrim);
}

.ip-head {
  height: 48px;
  padding: 0 var(--space-2) 0 var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.ip-head__title {
  margin: 0;
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--color-ink-1);
}

.ip-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--space-4) var(--space-5);
}

/* ── Preview ───────────────────────────────────────────────────────── */
.ip-preview {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ip-preview__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ip-preview__cover {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.ip-preview--text {
  align-items: stretch;
  justify-content: stretch;
  background: var(--color-surface);
}
.ip-preview__text {
  margin: 0;
  width: 100%;
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--color-ink-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: hidden;
  /* Fade the last lines into the card. */
  mask-image: linear-gradient(to bottom, black 70%, transparent);
}
.ip-preview__tile {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ip-preview__tile--folder {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.ip-preview__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: var(--media-chrome-soft);
}
.ip-preview__progress-fill {
  display: block;
  height: 100%;
  background: var(--color-accent);
}
.ip-preview__chip {
  position: absolute;
  left: var(--space-2);
  bottom: calc(var(--space-2) + 4px);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--media-chrome);
  color: var(--media-ink);
  font-size: var(--type-small);
  font-variant-numeric: tabular-nums;
}

/* ── Name, actions ─────────────────────────────────────────────────── */
.ip-name {
  margin: var(--space-3) 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-ink-1);
  overflow-wrap: anywhere;
}
.ip-sub {
  margin: 2px 0 0;
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
/* Open or Play across the top; Share, Download and ⋯ beneath it. */
.ip-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.ip-actions > :first-child {
  grid-column: 1 / -1;
}
/* Several items: two equal columns. */
.ip-actions--wrap {
  grid-template-columns: 1fr 1fr;
}
.ip-actions--wrap > :first-child {
  grid-column: auto;
}

/* ── Sections ──────────────────────────────────────────────────────── */
.ip-section {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-line);
}
.ip-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ip-section__title {
  margin: 0 0 var(--space-2);
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--color-ink-3);
}
.ip-section__head .ip-section__title {
  margin: 0;
}
.ip-props {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--type-small);
}
.ip-props > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
.ip-props dt {
  color: var(--color-ink-3);
  flex-shrink: 0;
}
.ip-props dd {
  margin: 0;
  min-width: 0;
  color: var(--color-ink-1);
  text-align: right;
  overflow-wrap: anywhere;
}
.ip-props__where dd {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.ip-path {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-2);
  overflow-wrap: anywhere;
}
.ip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: var(--space-2);
}
.ip-muted {
  margin: var(--space-1) 0 0;
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
.ip-hint {
  margin-top: var(--space-4);
}

/* ── Summaries (several items, the folder) ─────────────────────────── */
.ip-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: var(--space-4);
}
.ip-summary__tile {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ip-summary__tile--folder {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
