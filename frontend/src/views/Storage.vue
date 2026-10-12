<template>
  <!-- Storage (4.0 Phase 5.1): what uses space under a folder. The treemap
       is the picture; the ranked "Largest files" list beside it is the
       keyboard and screen-reader equivalent. -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <div class="storage-hero">
        <div class="min-w-0 flex-1">
          <div
            class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-1"
          >
            Storage
          </div>
          <nav class="storage-crumbs" aria-label="Folder">
            <template v-for="(c, i) in crumbs" :key="c.path">
              <span v-if="i > 0" class="storage-crumbs__sep" aria-hidden="true"
                >/</span
              >
              <button
                type="button"
                class="storage-crumbs__btn"
                :class="{ 'is-current': i === crumbs.length - 1 }"
                :aria-current="i === crumbs.length - 1 ? 'page' : undefined"
                @click="goTo(c.path)"
              >
                {{ c.name }}
              </button>
            </template>
          </nav>
          <div
            class="mt-1 text-[13px] text-ink-3 tabular"
            data-testid="storage-summary"
          >
            <template v-if="loading && !tree">Measuring…</template>
            <template v-else-if="tree">
              {{ humanSize(tree.root.size) }} in
              {{ tree.root.files.toLocaleString() }}
              {{ tree.root.files === 1 ? "file" : "files" }}
              <template v-if="tree.disk && tree.disk.total > 0">
                <span class="storage-dot">·</span>
                {{ humanSize(tree.disk.total - tree.disk.used) }} free of
                {{ humanSize(tree.disk.total) }} on this drive
              </template>
            </template>
          </div>
          <div
            v-if="tree?.disk && tree.disk.total > 0"
            class="storage-disk"
            role="img"
            :aria-label="`This folder uses ${pct(tree.root.size, tree.disk.total)} of the drive; ${pct(tree.disk.used, tree.disk.total)} is used in all`"
          >
            <span
              class="storage-disk__used"
              :style="{ width: pct(tree.disk.used, tree.disk.total) }"
            />
            <span
              class="storage-disk__here"
              :style="{ width: pct(tree.root.size, tree.disk.total) }"
            />
          </div>
        </div>
        <button
          type="button"
          class="storage-btn"
          :disabled="loading"
          title="Measure again"
          @click="load(true)"
        >
          <Icon
            name="rotate-ccw"
            :size="14"
            :class="{ 'storage-spin': loading }"
          />
          <span class="max-md:hidden">Refresh</span>
        </button>
      </div>

      <div class="storage-body">
        <section class="storage-map-wrap" aria-label="Treemap">
          <div
            ref="mapEl"
            class="storage-map"
            data-testid="storage-map"
            @contextmenu.prevent
          >
            <template v-if="tree && tree.root.size > 0">
              <button
                v-for="b in blocks"
                :key="b.key"
                type="button"
                class="storage-block"
                :class="[
                  `kind-${b.node.kind || (b.node.isDir ? 'dir' : 'other')}`,
                  {
                    'storage-block--group': b.group,
                    'storage-block--other': b.node.other,
                  },
                ]"
                :style="{
                  left: `${b.x}px`,
                  top: `${b.y}px`,
                  width: `${b.w}px`,
                  height: `${b.h}px`,
                }"
                :tabindex="b.group || b.depth === 0 ? 0 : -1"
                :aria-label="blockLabel(b.node)"
                :title="blockLabel(b.node)"
                :data-path="b.node.path"
                @click="onBlockClick(b.node)"
                @contextmenu.prevent.stop="openMenu(b.node, $event)"
              >
                <span v-if="b.w > 56 && b.h > 26" class="storage-block__label">
                  <span class="storage-block__name">{{
                    b.node.name || rootName
                  }}</span>
                  <span v-if="b.h > 40" class="storage-block__size">{{
                    humanSize(b.node.size)
                  }}</span>
                </span>
              </button>
            </template>
            <EmptyState
              v-else-if="tree && !loading"
              icon="folder-open"
              title="Nothing stored here"
              message="This folder has no files yet."
            />
            <div v-if="loading && !tree" class="storage-map__loading">
              <Icon name="loader-circle" :size="18" class="storage-spin" />
              <span>Measuring {{ currentName }}…</span>
            </div>
          </div>
          <ul class="storage-legend" aria-hidden="true">
            <li v-for="k in LEGEND" :key="k.kind">
              <span class="storage-legend__dot" :class="`kind-${k.kind}`" />{{
                k.label
              }}
            </li>
          </ul>
        </section>

        <section class="storage-largest" aria-labelledby="largest-title">
          <h2 id="largest-title" class="storage-largest__title">
            Largest files
          </h2>
          <ol
            v-if="tree && tree.largest.length > 0"
            class="storage-largest__list"
            data-testid="storage-largest"
          >
            <li v-for="(f, i) in tree.largest" :key="f.path">
              <button
                type="button"
                class="storage-file"
                @click="reveal(f.path)"
                @contextmenu.prevent="openMenu(fileNode(f), $event)"
              >
                <span class="storage-file__rank">{{ i + 1 }}</span>
                <span
                  class="storage-legend__dot"
                  :class="`kind-${f.kind || 'other'}`"
                  aria-hidden="true"
                />
                <span class="storage-file__text">
                  <span class="storage-file__name">{{ f.name }}</span>
                  <span class="storage-file__dir">{{ dirOf(f.path) }}</span>
                </span>
                <span class="storage-file__size">{{ humanSize(f.size) }}</span>
              </button>
            </li>
          </ol>
          <p v-else-if="tree" class="storage-largest__empty">No files.</p>
        </section>
      </div>

      <context-menu
        :show="menu.show"
        :pos="menu.pos"
        :items="menuItems"
        @hide="menu.show = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import { files as filesApi } from "@/api";
import {
  usageTree,
  type UsageNode,
  type UsageFile,
  type UsageTree,
} from "@/api/usage";
import { StatusError } from "@/api/utils";
import { squarify } from "@/utils/treemap";
import { encodePath } from "@/utils/url";
import { filesize } from "@/utils";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useRootLabel } from "@/composables/useRootLabel";

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const fileStore = useFileStore();
const { rootLabel } = useRootLabel();

const LEGEND = [
  { kind: "video", label: "Video" },
  { kind: "image", label: "Images" },
  { kind: "audio", label: "Audio" },
  { kind: "pdf", label: "PDF" },
  { kind: "text", label: "Text" },
  { kind: "archive", label: "Archives" },
  { kind: "dir", label: "Mixed folders" },
  { kind: "other", label: "Other" },
];

const rootName = computed(() => rootLabel.value || t("sidebar.myFiles"));

/** Current folder from `?path=`, normalized ("/" or "/Movies"). */
const currentPath = computed(() => {
  const raw = typeof route.query.path === "string" ? route.query.path : "/";
  const p = ("/" + raw).replace(/\/+/g, "/").replace(/\/$/, "");
  return p === "" ? "/" : p;
});
const currentName = computed(() =>
  currentPath.value === "/"
    ? rootName.value
    : currentPath.value.slice(currentPath.value.lastIndexOf("/") + 1)
);
const crumbs = computed(() => {
  const out = [{ name: rootName.value, path: "/" }];
  let acc = "";
  for (const seg of currentPath.value.split("/").filter(Boolean)) {
    acc += "/" + seg;
    out.push({ name: seg, path: acc });
  }
  return out;
});

const tree = ref<UsageTree | null>(null);
const loading = ref(false);
let controller: AbortController | null = null;

const load = async (refresh = false) => {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  try {
    const res = await usageTree(currentPath.value, { refresh, signal });
    if (signal.aborted) return;
    tree.value = res;
    document.title = `Storage · ${currentName.value}`;
  } catch (e) {
    if (signal.aborted || (e instanceof StatusError && e.is_canceled)) return;
    tree.value = null;
    if (e instanceof Error) $showError(e);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
};

watch(currentPath, () => {
  tree.value = null;
  void load();
});

const goTo = (path: string) => {
  if (path === currentPath.value) return;
  void router.push({
    path: "/storage",
    query: path === "/" ? {} : { path },
  });
};

// ── Layout ────────────────────────────────────────────────────────────
const mapEl = ref<HTMLElement | null>(null);
const size = reactive({ w: 0, h: 0 });
let observer: ResizeObserver | null = null;

const measure = () => {
  const el = mapEl.value;
  if (!el) return;
  size.w = el.clientWidth;
  size.h = el.clientHeight;
};

onMounted(() => {
  void load();
  void nextTick(measure);
  if (typeof ResizeObserver !== "undefined" && mapEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(mapEl.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  controller?.abort();
});

interface Block {
  key: string;
  node: UsageNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** A folder drawn as a frame around its own children. */
  group: boolean;
}

const HEADER = 20; // label strip on a folder that shows its children
const PAD = 2;

const blocks = computed<Block[]>(() => {
  const root = tree.value?.root;
  if (!root || size.w <= 0 || size.h <= 0) return [];
  const out: Block[] = [];
  const top = squarify(root.children ?? [], (n) => n.size, {
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
  });
  for (const p of top) {
    const kids = p.item.children ?? [];
    const roomy = p.w > 90 && p.h > 60 && kids.length > 0;
    out.push({
      key: `0:${p.item.path}:${p.item.name}`,
      node: p.item,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      depth: 0,
      group: roomy,
    });
    if (!roomy) continue;
    const inner = squarify(kids, (n) => n.size, {
      x: p.x + PAD,
      y: p.y + HEADER,
      w: p.w - PAD * 2,
      h: p.h - HEADER - PAD,
    });
    for (const q of inner) {
      out.push({
        key: `1:${q.item.path}:${q.item.name}`,
        node: q.item,
        x: q.x,
        y: q.y,
        w: q.w,
        h: q.h,
        depth: 1,
        group: false,
      });
    }
  }
  return out;
});

// ── Labels and actions ────────────────────────────────────────────────
const humanSize = (n: number) => filesize(n);
const pct = (part: number, whole: number) =>
  `${whole > 0 ? Math.min(100, (part / whole) * 100).toFixed(1) : 0}%`;
const dirOf = (p: string) => {
  const d = p.slice(0, p.lastIndexOf("/"));
  return d === "" ? rootName.value : d;
};

const blockLabel = (n: UsageNode) => {
  const name = n.other ? n.name : n.name || rootName.value;
  const share =
    tree.value && tree.value.root.size > 0
      ? `, ${pct(n.size, tree.value.root.size)} of this folder`
      : "";
  const what = n.isDir
    ? `folder, ${n.files.toLocaleString()} ${n.files === 1 ? "file" : "files"}`
    : n.other
      ? "smaller items"
      : "file";
  return `${name}: ${humanSize(n.size)}${share} (${what})`;
};

const filesUrl = (path: string, isDir: boolean) =>
  `/files${encodePath(path)}${isDir && path !== "/" ? "/" : ""}`;

/** Open a file's folder in the listing with the file selected. */
const reveal = (path: string) => {
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  fileStore.setPreselect(path);
  void router.push(filesUrl(dir, true));
};

const onBlockClick = (n: UsageNode) => {
  if (n.other) return;
  if (n.isDir) goTo(n.path);
  else reveal(n.path);
};

const fileNode = (f: UsageFile): UsageNode => ({
  name: f.name,
  path: f.path,
  size: f.size,
  files: 1,
  isDir: false,
  kind: f.kind,
});

const menu = reactive({
  show: false,
  pos: { x: 0, y: 0 },
  node: null as UsageNode | null,
});
const openMenu = (n: UsageNode, e: MouseEvent) => {
  if (n.other) return;
  menu.node = n;
  menu.pos = { x: e.clientX, y: e.clientY };
  menu.show = true;
};

const trash = async (n: UsageNode) => {
  try {
    await filesApi.remove(filesUrl(n.path, n.isDir));
    $showSuccess(`Moved “${n.name}” to the trash`);
    void load(true);
  } catch (e) {
    if (e instanceof Error) $showError(e);
  }
};

const menuItems = computed<MenuItem[]>(() => {
  const n = menu.node;
  if (!n) return [];
  const hide = (fn: () => void) => () => {
    menu.show = false;
    fn();
  };
  const items: MenuItem[] = [];
  if (n.isDir) {
    items.push({
      label: "Open here",
      icon: "folder-search",
      action: hide(() => goTo(n.path)),
    });
    items.push({
      label: "Open folder in files",
      icon: "folder-open",
      action: hide(() => void router.push(filesUrl(n.path, true))),
    });
  } else {
    items.push({
      label: "Show in files",
      icon: "folder-open",
      action: hide(() => reveal(n.path)),
    });
  }
  if (authStore.user?.perm.delete) {
    items.push({ type: "separator" });
    items.push({
      label: "Move to trash",
      icon: "trash-2",
      destructive: true,
      action: hide(() => void trash(n)),
    });
  }
  return items;
});
</script>

<style scoped>
.storage-hero {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}
@media (max-width: 768px) {
  .storage-hero {
    padding: 12px 16px 10px;
  }
}
.storage-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
}
.storage-crumbs__btn {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-ink-3, #82828c);
  border-radius: 6px;
  padding: 0 3px;
}
.storage-crumbs__btn:hover {
  color: var(--color-ink-1, #18181b);
  background: var(--color-elevated, #f4f4f5);
}
.storage-crumbs__btn.is-current {
  color: var(--color-ink-1, #18181b);
}
.storage-crumbs__sep {
  color: var(--color-ink-3, #82828c);
  font-size: 18px;
}
.storage-dot {
  margin: 0 3px;
  opacity: 0.55;
}
.storage-disk {
  position: relative;
  margin-top: 8px;
  height: 6px;
  max-width: 420px;
  border-radius: 999px;
  background: var(--color-line, #ececec);
  overflow: hidden;
}
.storage-disk__used,
.storage-disk__here {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
}
.storage-disk__used {
  background: color-mix(in srgb, var(--color-ink-3, #82828c) 45%, transparent);
}
.storage-disk__here {
  background: var(--color-accent, #6e72d9);
}
.storage-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font-size: 13px;
}
.storage-btn:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
}
.storage-spin {
  animation: storage-spin 0.9s linear infinite;
}
@keyframes storage-spin {
  to {
    transform: rotate(360deg);
  }
}

.storage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 0 20px 20px;
}
@media (max-width: 900px) {
  .storage-body {
    flex-direction: column;
    overflow-y: auto;
    padding: 0 16px 16px;
  }
}
.storage-map-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.storage-map {
  position: relative;
  flex: 1;
  min-height: 320px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-canvas, #fafaf9);
  border: 1px solid var(--color-line, #ececec);
}
.storage-map__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-ink-3, #82828c);
  font-size: 13px;
}

/* Kind colours: distinct hues that read in both themes. */
.kind-video {
  --k: #7c6cd9;
}
.kind-image {
  --k: #2f9e8f;
}
.kind-audio {
  --k: #d08a2e;
}
.kind-pdf {
  --k: #c9566a;
}
.kind-text {
  --k: #4b8fd1;
}
.kind-archive {
  --k: #9a7b55;
}
.kind-dir {
  --k: #7d8597;
}
.kind-other {
  --k: #a3a3ad;
}

.storage-block {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--color-surface, #fff);
  background: color-mix(in srgb, var(--k) 78%, transparent);
  color: #fff;
  text-align: left;
  overflow: hidden;
  transition: filter 0.1s ease;
}
.storage-block:hover,
.storage-block:focus-visible {
  filter: brightness(1.12);
  outline: none;
  z-index: 1;
}
.storage-block:focus-visible {
  box-shadow: inset 0 0 0 2px #fff;
}
.storage-block--group {
  background: color-mix(in srgb, var(--k) 30%, var(--color-surface, #fff));
  color: var(--color-ink-1, #18181b);
}
.storage-block--other {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--k) 55%, transparent) 0 6px,
    color-mix(in srgb, var(--k) 40%, transparent) 6px 12px
  );
  cursor: default;
}
.storage-block__label {
  display: flex;
  flex-direction: column;
  padding: 3px 6px;
  min-width: 0;
  pointer-events: none;
}
.storage-block__name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storage-block__size {
  font-size: 11px;
  opacity: 0.85;
}
.storage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--color-ink-3, #82828c);
}
.storage-legend li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.storage-legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: var(--k);
  flex: none;
}

.storage-largest {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
@media (max-width: 900px) {
  .storage-largest {
    width: auto;
  }
}
.storage-largest__title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #82828c);
}
.storage-largest__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
}
.storage-largest__empty {
  font-size: 13px;
  color: var(--color-ink-3, #82828c);
}
.storage-file {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 7px;
  text-align: left;
}
.storage-file:hover,
.storage-file:focus-visible {
  background: var(--color-elevated, #f4f4f5);
  outline: none;
}
.storage-file__rank {
  width: 20px;
  flex: none;
  text-align: right;
  font-size: 11px;
  color: var(--color-ink-3, #82828c);
  font-variant-numeric: tabular-nums;
}
.storage-file__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.storage-file__name {
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storage-file__dir {
  font-size: 11px;
  color: var(--color-ink-3, #82828c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storage-file__size {
  flex: none;
  font-size: 12px;
  color: var(--color-ink-2, #52525b);
  font-variant-numeric: tabular-nums;
}
</style>
