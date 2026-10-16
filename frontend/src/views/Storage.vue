<template>
  <!-- Storage (4.0 Phase 5.1): what uses space under a folder. The treemap
       is the picture; the ranked "Largest files" list beside it is the
       keyboard and screen-reader equivalent. -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <UiPageHeader
        eyebrow="Storage"
        :meta-attrs="{ 'data-testid': 'storage-summary' }"
      >
        <template #breadcrumb>
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
        </template>
        <template #meta>
          <template v-if="loading && !tree">Measuring…</template>
          <template v-else-if="tree">
            {{ humanSize(tree.root.size) }} in
            {{ tree.root.files.toLocaleString() }}
            {{ tree.root.files === 1 ? "file" : "files" }}
          </template>
          <template v-else-if="failed">Couldn’t measure this folder</template>
        </template>
        <!-- Drive usage (5.1): a ring with used and free, this folder's
             share in the accent; a pill when the last duplicate scan found
             copies here. -->
        <div
          v-if="tree?.disk && tree.disk.total > 0"
          class="storage-usage"
          data-testid="storage-usage"
        >
          <svg
            class="storage-ring"
            viewBox="0 0 36 36"
            role="img"
            :aria-label="`${pct(tree.disk.used, tree.disk.total)} of the drive is used; this folder is ${pct(tree.root.size, tree.disk.total)}`"
          >
            <circle class="storage-ring__track" cx="18" cy="18" r="15.915" />
            <circle
              class="storage-ring__used"
              cx="18"
              cy="18"
              r="15.915"
              :stroke-dasharray="`${ringPct(tree.disk.used, tree.disk.total)} 100`"
            />
            <circle
              class="storage-ring__here"
              cx="18"
              cy="18"
              r="15.915"
              :stroke-dasharray="`${ringPct(tree.root.size, tree.disk.total)} 100`"
            />
          </svg>
          <div class="storage-usage__text">
            <span class="storage-usage__main"
              >{{ pct(tree.disk.used, tree.disk.total) }} used</span
            >
            <span class="storage-usage__sub"
              >{{ humanSize(tree.disk.total - tree.disk.used) }} free of
              {{ humanSize(tree.disk.total) }}</span
            >
          </div>
          <RouterLink
            v-if="dupeShortcut"
            class="storage-pill"
            data-testid="storage-dupes-pill"
            :to="{
              path: '/duplicates',
              query: currentPath === '/' ? {} : { path: currentPath },
            }"
          >
            <Icon name="copy" :size="13" />
            <span
              >{{ humanSize(dupeShortcut) }} in duplicates ·
              <strong>Review</strong></span
            >
          </RouterLink>
        </div>
        <template #actions>
          <UiButton
            icon="copy"
            :to="{
              path: '/duplicates',
              query: currentPath === '/' ? {} : { path: currentPath },
            }"
            >Find duplicates</UiButton
          >
          <UiButton
            icon="rotate-ccw"
            :loading="loading"
            title="Measure again"
            @click="load(true)"
            >Refresh</UiButton
          >
        </template>
      </UiPageHeader>

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
                v-for="(b, i) in blocks"
                :key="b.key"
                type="button"
                class="storage-block"
                :class="[
                  `k-${b.node.kind || (b.node.isDir ? 'dir' : 'other')}`,
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
                :tabindex="i === focusIndex ? 0 : -1"
                :aria-label="blockLabel(b.node)"
                :title="blockLabel(b.node)"
                :data-path="b.node.path"
                @click="onBlockClick(b.node)"
                @focus="focusIndex = i"
                @keydown="onBlockKey($event, i)"
                @contextmenu.prevent.stop="openMenu(b.node, $event)"
              >
                <!-- A folder showing its contents gets its name in a strip
                     above them, so the label never covers its children. -->
                <span
                  v-if="b.group"
                  class="storage-block__strip"
                  :style="{ height: `${HEADER}px` }"
                >
                  <span class="storage-block__name">{{ b.node.name }}</span>
                  <span class="storage-block__size">{{
                    humanSize(b.node.size)
                  }}</span>
                </span>
                <span
                  v-else-if="b.w > 56 && b.h > 26"
                  class="storage-block__label"
                >
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
              hint="This folder has no files yet."
              data-testid="storage-empty"
            />
            <EmptyState
              v-else-if="failed && !loading"
              icon="alert-triangle"
              title="Couldn’t measure this folder"
              hint="The server didn’t answer. Try again in a moment."
              data-testid="storage-error"
            >
              <UiButton size="sm" icon="rotate-ccw" @click="load(true)"
                >Try again</UiButton
              >
            </EmptyState>
            <div
              v-if="loading && !tree"
              class="storage-map__loading"
              data-testid="storage-loading"
            >
              <Icon name="loader-circle" :size="18" class="storage-spin" />
              <span>Measuring {{ currentName }}…</span>
            </div>
          </div>
          <ul class="storage-legend" aria-hidden="true">
            <li v-for="k in LEGEND" :key="k.kind">
              <span class="storage-legend__dot" :class="`k-${k.kind}`" />{{
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
                  class="storage-file__tile"
                  :class="fileIconColor({ name: f.name })"
                  aria-hidden="true"
                  ><Icon :name="fileIcon({ name: f.name })" :size="16"
                /></span>
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
import UiButton from "@/components/ui/UiButton.vue";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
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
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { getScan } from "@/api/dupes";
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
const failed = ref(false);
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
    failed.value = false;
    focusIndex.value = 0;
    document.title = `Storage · ${currentName.value}`;
  } catch (e) {
    if (signal.aborted || (e instanceof StatusError && e.is_canceled)) return;
    tree.value = null;
    failed.value = true;
  } finally {
    if (!signal.aborted) loading.value = false;
  }
};

watch(currentPath, () => {
  tree.value = null;
  void load();
});

// "… in duplicates · Review" (5.1): the last finished duplicate scan, when it
// covered this folder and found copies here. Hidden when there's none.
const dupeScan = ref<Awaited<ReturnType<typeof getScan>>>(null);
const loadDupes = async () => {
  try {
    dupeScan.value = await getScan();
  } catch {
    dupeScan.value = null;
  }
};
const dupeShortcut = computed(() => {
  const scan = dupeScan.value;
  if (!scan || scan.status !== "done" || !scan.result?.groups) return 0;
  const here = currentPath.value;
  const under = (p: string) =>
    here === "/" || p === here || p.startsWith(here + "/");
  let bytes = 0;
  for (const g of scan.result.groups) {
    const copies = g.files.filter((f) => under(f.path)).length;
    // Every copy after the first one kept is space you could free.
    if (copies > 1) bytes += g.size * (copies - 1);
  }
  return bytes;
});
const ringPct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, (part / whole) * 100).toFixed(2) : "0";

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
  void loadDupes();
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

const HEADER = 22; // label strip on a folder that shows its children
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

// Keyboard (5.1): one block is tabbable; arrows move through the blocks in
// drawing order (a folder, then the blocks inside it), Home and End jump.
const focusIndex = ref(0);
const onBlockKey = (e: KeyboardEvent, i: number) => {
  const last = blocks.value.length - 1;
  let next = i;
  if (e.key === "ArrowRight" || e.key === "ArrowDown")
    next = Math.min(last, i + 1);
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    next = Math.max(0, i - 1);
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = last;
  else return;
  e.preventDefault();
  focusIndex.value = next;
  mapEl.value?.querySelectorAll<HTMLElement>(".storage-block")[next]?.focus();
};

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
.storage-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
}
.storage-crumbs__btn {
  font-size: var(--type-display);
  font-weight: 700;
  line-height: var(--type-display-lh);
  color: var(--color-ink-3);
  border-radius: var(--radius-sm);
  padding: 0 3px;
}
/* The hover pad shouldn't push the title off the page's left edge. */
.storage-crumbs__btn:first-child {
  margin-left: -3px;
}
.storage-crumbs__btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
@media (max-width: 767px) {
  .storage-crumbs__btn {
    font-size: var(--type-title);
    line-height: var(--type-title-lh);
  }
}
.storage-crumbs__btn:hover {
  color: var(--color-ink-1);
  background: var(--color-elevated);
}
.storage-crumbs__btn.is-current {
  color: var(--color-ink-1);
}
.storage-crumbs__sep {
  color: var(--color-ink-3);
  font-size: var(--type-title);
}
.storage-usage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.storage-ring {
  width: 44px;
  height: 44px;
  transform: rotate(-90deg);
  flex: none;
}
.storage-ring circle {
  fill: none;
  stroke-width: 4;
}
.storage-ring__track {
  stroke: var(--color-elevated);
}
.storage-ring__used {
  stroke: var(--color-ink-3);
}
.storage-ring__here {
  stroke: var(--color-accent);
}
.storage-usage__text {
  display: flex;
  flex-direction: column;
}
.storage-usage__main {
  font-size: var(--type-ui);
  font-weight: 600;
  color: var(--color-ink-1);
}
.storage-usage__sub {
  font-size: var(--type-small);
  color: var(--color-ink-3);
}
.storage-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  background: var(--tint-archive-bg);
  color: var(--tint-archive-fg);
  font-size: var(--type-small);
  text-decoration: none;
}
.storage-pill strong {
  font-weight: 600;
}
.storage-pill:hover {
  filter: brightness(0.97);
}
.storage-pill:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
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
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-canvas);
  border: 1px solid var(--color-line);
}
.storage-map__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-ink-3);
  font-size: 13px;
}

/* Kind colours (tokens.css --kind-*-solid). `k-` rather than `kind-`, which
   is the global icon-tile class. */
.k-video {
  --k: var(--kind-video-solid);
  --k-bg: var(--tint-video-bg);
  --k-fg: var(--tint-video-fg);
}
.k-image {
  --k: var(--kind-image-solid);
  --k-bg: var(--tint-image-bg);
  --k-fg: var(--tint-image-fg);
}
.k-audio {
  --k: var(--kind-audio-solid);
  --k-bg: var(--tint-audio-bg);
  --k-fg: var(--tint-audio-fg);
}
.k-pdf {
  --k: var(--kind-pdf-solid);
  --k-bg: var(--tint-pdf-bg);
  --k-fg: var(--tint-pdf-fg);
}
.k-text {
  --k: var(--kind-text-solid);
  --k-bg: var(--tint-text-bg);
  --k-fg: var(--tint-text-fg);
}
.k-archive {
  --k: var(--kind-archive-solid);
  --k-bg: var(--tint-archive-bg);
  --k-fg: var(--tint-archive-fg);
}
.k-dir {
  --k: var(--kind-folder-solid);
  --k-bg: var(--tint-folder-bg);
  --k-fg: var(--tint-folder-fg);
}
.k-other {
  --k: var(--kind-other-solid);
  --k-bg: var(--tint-file-bg);
  --k-fg: var(--tint-file-fg);
}

.storage-block {
  position: absolute;
  box-sizing: border-box;
  /* Labels sit at the top-left, not centred (a button centres by default). */
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  padding: 0;
  border: 1px solid var(--color-surface);
  /* Opaque tint (the -bg tokens are translucent in dark) so labels keep
     their contrast. */
  background: linear-gradient(var(--k-bg), var(--k-bg)), var(--color-surface);
  color: var(--k-fg);
  text-align: left;
  overflow: hidden;
  transition: filter 0.1s ease;
}
.storage-block:hover,
.storage-block:focus-visible {
  filter: brightness(0.96);
  outline: none;
  z-index: 1;
}
.storage-block:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-accent-ink);
}
.storage-block--group {
  background: color-mix(in srgb, var(--k) 30%, var(--color-surface));
  color: var(--color-ink-1);
}
.storage-block--other {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--k) 55%, transparent) 0 6px,
    color-mix(in srgb, var(--k) 40%, transparent) 6px 12px
  );
  cursor: default;
}
.storage-block__strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  min-width: 0;
  pointer-events: none;
}
.storage-block__strip .storage-block__name {
  min-width: 0;
}
.storage-block__strip .storage-block__size {
  flex: none;
  color: var(--color-ink-3);
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
}
.storage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--color-ink-3);
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
  margin: 0 0 var(--space-2);
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--color-ink-2);
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
  color: var(--color-ink-3);
}
/* Largest files as cards (5.1). */
.storage-largest__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.storage-file {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  text-align: left;
}
.storage-file:hover {
  border-color: var(--color-line-strong);
  background: var(--color-hover);
}
.storage-file:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.storage-file__tile {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.storage-file__rank {
  width: 20px;
  flex: none;
  text-align: right;
  font-size: 11px;
  color: var(--color-ink-3);
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
  color: var(--color-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storage-file__dir {
  font-size: 11px;
  color: var(--color-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storage-file__size {
  flex: none;
  font-size: 12px;
  color: var(--color-ink-2);
  font-variant-numeric: tabular-nums;
}
</style>
