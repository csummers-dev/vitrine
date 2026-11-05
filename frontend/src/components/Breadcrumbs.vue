<template>
  <nav
    ref="navEl"
    class="breadcrumbs-nav flex items-center gap-0.5 text-[13px] min-w-0 text-ink-2"
    :class="{
      'breadcrumbs-nav--drag': isDragActive,
      'breadcrumbs-nav--squeezed': squeezed,
      'is-title': title,
    }"
    :aria-label="t('files.home')"
  >
    <component
      :is="element"
      :to="base || ''"
      :aria-label="t('files.home')"
      :title="t('files.home')"
      class="breadcrumb-link breadcrumb-link--root"
      :class="{ 'is-drop-target': dragOver === 'root' }"
      :data-drop-url="rootUrl"
      @dragenter="onDragEnter('root', $event)"
      @dragover="onDragOver($event)"
      @dragleave="onDragLeave('root')"
      @drop="onDrop(rootUrl, 'root', $event)"
    >
      <Icon name="house" :size="14" class="text-[var(--color-accent-ink)]" />
    </component>

    <!-- When the path doesn't fit, the middle folds into "…" (a menu of the
         folders it hides): first the folders after the top one, then the
         top one too, so the current folder always shows. Phones always fold
         everything but the current folder. -->
    <template v-for="(entry, index) in items" :key="entry.url">
      <template v-if="index === foldAt">
        <span class="text-ink-3 px-0.5 flex items-center" aria-hidden="true">
          <Icon name="chevron-right" :size="12" />
        </span>
        <button
          type="button"
          class="breadcrumb-link breadcrumb-fold text-ink-2"
          :aria-label="`${hiddenItems.length} more folders`"
          :title="hiddenItems.map((l) => l.name).join(' / ')"
          aria-haspopup="menu"
          data-testid="breadcrumb-fold"
          @click.stop.prevent="openFoldMenu"
        >
          <span class="breadcrumb-link__text">…</span>
        </button>
      </template>
      <template v-if="!hidden.has(index)">
        <!-- The separator chevron doubles as a SIBLING-FOLDER menu trigger
             (v2.7): clicking the chevron before a crumb lists that level's
             folders, so lateral moves (/Media/Comics → /Media/Music) are one
             click instead of two navigations. Only in the real files tree —
             share views + noLink renders keep the plain separator. -->
        <button
          v-if="siblingMenusEnabled"
          type="button"
          class="breadcrumb-sep text-ink-3 px-0.5 flex items-center"
          :aria-label="`Show folders in ${index === 0 ? t('files.home') : items[index - 1].name}`"
          aria-haspopup="menu"
          @click.stop.prevent="openSiblingMenu(index, $event)"
        >
          <Icon name="chevron-right" :size="12" />
        </button>
        <span v-else class="text-ink-3 px-0.5 flex items-center">
          <Icon name="chevron-right" :size="12" />
        </span>

        <component
          :is="element"
          :to="entry.url"
          :class="[
            'breadcrumb-link',
            index === items.length - 1
              ? 'breadcrumb-link--current text-ink-1 font-semibold'
              : 'breadcrumb-link--crumb text-ink-2',
            dragOver === entry.url && 'is-drop-target',
          ]"
          :title="entry.name"
          :data-drop-url="entry.url"
          @dragenter="onDragEnter(entry.url, $event)"
          @dragover="onDragOver($event)"
          @dragleave="onDragLeave(entry.url)"
          @drop="onDrop(entry.url, entry.url, $event)"
        >
          <!-- Text lives in a block span so `text-overflow: ellipsis` actually
               truncates — an inline-flex link can't ellipsize its own text
               node (it hard-clips). -->
          <span class="breadcrumb-link__text">{{ entry.name }}</span>
        </component>
      </template>
    </template>
  </nav>

  <!-- Sibling-folder and folded-crumb popover (teleports to <body> itself). -->
  <ContextMenu
    :show="siblingMenu.show"
    :pos="siblingMenu.pos"
    :items="siblingMenu.items"
    @hide="siblingMenu.show = false"
  />
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { useDropTarget } from "@/composables/useDropTarget";
import { files as filesApi } from "@/api";
import { foldedCrumbs } from "@/utils/breadcrumbFold";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const { performDrop } = useDropTarget();

const navEl = ref<HTMLElement | null>(null);

const props = defineProps<{
  base: string;
  noLink?: boolean;
  /** The current folder is the page title (the files header). */
  title?: boolean;
}>();

const items = computed(() => {
  const relativePath = route.path.replace(props.base, "");
  const parts = relativePath.split("/");

  if (parts[0] === "") {
    parts.shift();
  }

  if (parts[parts.length - 1] === "") {
    parts.pop();
  }

  const breadcrumbs: BreadCrumb[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      breadcrumbs.push({
        name: decodeURIComponent(parts[i]),
        url: props.base + "/" + parts[i] + "/",
      });
    } else {
      breadcrumbs.push({
        name: decodeURIComponent(parts[i]),
        url: breadcrumbs[i - 1].url + parts[i] + "/",
      });
    }
  }

  return breadcrumbs;
});

// ── Middle fold (Phase 6, 3.3) ──────────────────────────────────────
// `folded` counts how many crumbs are tucked into "…", in the order
// foldedCrumbs() gives. fit() starts from nothing folded and folds one more
// until the strip fits its container; phones always fold everything but the
// current folder.
const phone = useMediaQuery("(max-width: 767px)");
const folded = ref(0);
const maxFold = computed(() => Math.max(0, items.value.length - 1));
const hidden = computed(
  () => new Set(foldedCrumbs(items.value.length, folded.value))
);
const hiddenItems = computed(() =>
  items.value.filter((_, i) => hidden.value.has(i))
);
/** Index of the first crumb after the folded run: "…" renders before it. */
const foldAt = computed(() => {
  if (hidden.value.size === 0) return -1;
  return Math.max(...hidden.value) + 1;
});
/** Everything that can fold has, and it still doesn't fit: the current
 *  folder's name gives way (ellipsis) instead. */
const squeezed = ref(false);

const overflowing = () => {
  const el = navEl.value;
  return !!el && el.scrollWidth > el.clientWidth + 1;
};

let fitting = false;
let observedWidth = -1;
const fit = async () => {
  if (fitting) return;
  fitting = true;
  try {
    squeezed.value = false;
    folded.value = phone.value ? maxFold.value : 0;
    await nextTick();
    while (overflowing() && folded.value < maxFold.value) {
      folded.value++;
      await nextTick();
    }
    squeezed.value = overflowing();
    await nextTick();
  } finally {
    observedWidth = navEl.value?.parentElement?.clientWidth ?? -1;
    fitting = false;
  }
};

watch([() => items.value.length, () => route.path, phone], () => void fit());

let ro: ResizeObserver | null = null;
const onWindowResize = () => void fit();
onMounted(() => {
  void fit();
  window.addEventListener("resize", onWindowResize);
  const parent = navEl.value?.parentElement;
  if (parent && typeof ResizeObserver !== "undefined") {
    // Our own folding can change the container's width when it hugs the
    // path (the split view's footer bar); only a change we didn't cause
    // re-fits.
    ro = new ResizeObserver(() => {
      if (fitting || parent.clientWidth === observedWidth) return;
      void fit();
    });
    ro.observe(parent);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowResize);
  ro?.disconnect();
});

const openFoldMenu = (event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  siblingFetchSeq++; // a pending sibling fetch must not replace this menu
  siblingMenu.value = {
    show: true,
    pos: { x: rect.left, y: rect.bottom + 6 },
    items: hiddenItems.value.map((entry) => ({
      label: entry.name,
      icon: "folder",
      action: () => {
        siblingMenu.value.show = false;
        if (!props.noLink) void router.push({ path: entry.url });
      },
    })),
  };
};

const element = computed(() => {
  if (props.noLink) {
    return "span";
  }

  return "router-link";
});

const rootUrl = computed(() => `${props.base}/`);

// ── Sibling-folder dropdowns (v2.7) ─────────────────────────────────
// The chevron before crumb N opens a menu of the folders at N's level
// (its parent's child dirs), so you can move laterally without going up
// first. Files-tree only: `api.fetch` hits /api/resources, which the
// share view's paths don't map onto (and a noLink render is read-only
// chrome anyway).
const siblingMenusEnabled = computed(
  () => !props.noLink && props.base === "/files"
);

const SIBLING_MENU_MAX = 40;
const siblingMenu = ref<{
  show: boolean;
  pos: { x: number; y: number };
  items: MenuItem[];
}>({ show: false, pos: { x: 0, y: 0 }, items: [] });
// Guards a slow fetch against a newer click (last click wins).
let siblingFetchSeq = 0;

const openSiblingMenu = async (index: number, event: MouseEvent) => {
  const btn = event.currentTarget as HTMLElement | null;
  const rect = btn?.getBoundingClientRect();
  const pos = rect
    ? { x: rect.left, y: rect.bottom + 6 }
    : { x: event.clientX, y: event.clientY };
  const parentUrl = index === 0 ? rootUrl.value : items.value[index - 1].url;
  const currentName = items.value[index]?.name;
  const seq = ++siblingFetchSeq;
  let dirs: ResourceItem[];
  try {
    const res = await filesApi.fetch(parentUrl);
    if (seq !== siblingFetchSeq) return;
    dirs = (res.items ?? []).filter((i) => i.isDir);
  } catch {
    // Permission / network failure — no menu is better than a broken one.
    return;
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));

  const menuItems: MenuItem[] = dirs.slice(0, SIBLING_MENU_MAX).map((d) => ({
    label: d.name,
    // A check marks the level's CURRENT folder (the crumb the chevron
    // precedes) so the menu doubles as "where am I".
    icon: d.name === currentName ? "check" : "folder",
    action: () => {
      siblingMenu.value.show = false;
      const url = d.url.endsWith("/") ? d.url : d.url + "/";
      void router.push({ path: url });
    },
  }));
  if (dirs.length > SIBLING_MENU_MAX) {
    menuItems.push({
      label: `…and ${dirs.length - SIBLING_MENU_MAX} more`,
      disabled: true,
    });
  }
  if (menuItems.length === 0) {
    menuItems.push({ label: "No subfolders", disabled: true });
  }
  siblingMenu.value = { show: true, pos, items: menuItems };
};

// ── Drag-to-parent (F5) ──────────────────────────────────────────────
// Each breadcrumb segment is a drop target during a file drag so the
// user can move items to any ancestor in the path without leaving the
// current folder. `dragOver` tracks which crumb is currently lit up so
// the accent ring renders. We DON'T accept drops on the segment for
// the folder the user is already in (the current folder is its own
// crumb — dropping there would be a no-op move).

const dragOver = ref<string | null>(null);

// True while an in-app drag is in progress (fileStore.draggedItems is set on
// dragstart and cleared on dragend). Drives the enlarged crumb drop targets in
// the styles below so a dragged file is easy to drop onto an ancestor folder.
const isDragActive = computed(() => fileStore.draggedItems.length > 0);

const isDroppable = (target: string): boolean => {
  if (fileStore.selectedCount === 0) return false;
  // Current folder = last item's URL; drop on it would no-op.
  const current =
    items.value.length > 0
      ? items.value[items.value.length - 1].url
      : rootUrl.value;
  if (target === current) return false;
  return true;
};

const onDragEnter = (key: string, event: DragEvent) => {
  // We compare against the resolved URL when key is "root". `key` for
  // intermediate crumbs IS the URL.
  const targetUrl = key === "root" ? rootUrl.value : key;
  if (!isDroppable(targetUrl)) return;
  event.preventDefault();
  dragOver.value = key;
  startSpringLoad(key, targetUrl);
};

const onDragOver = (event: DragEvent) => {
  // preventDefault is mandatory to accept the drop; the browser
  // otherwise resets the cursor + rejects.
  if (fileStore.selectedCount === 0) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect =
      event.ctrlKey || event.metaKey ? "copy" : "move";
  }
};

const onDragLeave = (key: string) => {
  if (dragOver.value === key) dragOver.value = null;
  cancelSpringLoad(key);
};

const onDrop = (targetUrl: string, key: string, event: DragEvent) => {
  dragOver.value = null;
  cancelSpringLoad(key);
  if (!isDroppable(targetUrl)) return;
  // Defer to the shared composable for the actual move/copy + conflict
  // handling. Key isn't used here but we keep it in the signature for
  // symmetry with the enter/leave handlers.
  void key;
  void performDrop(event, targetUrl);
};

// ── Spring-load on hover (F2) ──────────────────────────────────────
// Hover any droppable crumb for 2 s with a drag in progress and we
// navigate to that folder — same behavior as ListingItem's
// spring-loaded folders, but for the path elements in the header.
// Lets the user "rewind" up the path tree without dropping at every
// level, then drop at the destination.
//
// Drop still wins over navigate: dropping on a crumb cancels the timer
// (handled in onDrop above) and triggers the move/copy instead.
const SPRING_LOAD_MS = 2000;
const springTimers = new Map<string, number>();

const startSpringLoad = (key: string, targetUrl: string) => {
  if (springTimers.has(key)) return; // already running
  const timer = window.setTimeout(() => {
    springTimers.delete(key);
    dragOver.value = null;
    router.push({ path: targetUrl });
  }, SPRING_LOAD_MS);
  springTimers.set(key, timer);
};

const cancelSpringLoad = (key: string) => {
  const t = springTimers.get(key);
  if (t !== undefined) {
    window.clearTimeout(t);
    springTimers.delete(key);
  }
};

// Cleanup any in-flight timers if the user navigates away mid-drag.
onBeforeUnmount(() => {
  for (const t of springTimers.values()) window.clearTimeout(t);
  springTimers.clear();
});
</script>

<style scoped>
/* A path that doesn't fit folds its middle into "…" (see fit()); nothing
   shrinks while it measures, so the overflow is visible to it. */
.breadcrumbs-nav {
  overflow: hidden;
  flex-wrap: nowrap;
}
.breadcrumbs-nav > * {
  flex-shrink: 0;
}
/* Fully folded and still too wide: the current folder's name ellipsizes. */
.breadcrumbs-nav--squeezed > .breadcrumb-link--current {
  flex-shrink: 1;
}

.breadcrumb-fold {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.breadcrumb-fold:focus-visible {
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
}

/* The separator chevron is a real button when sibling menus are enabled —
   give it a quiet hover affordance so it reads as clickable without adding
   noise at rest. */
.breadcrumb-sep {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  border-radius: var(--radius-xs);
  padding-top: 4px;
  padding-bottom: 4px;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.breadcrumb-sep:hover {
  background: var(--color-hover);
  color: var(--color-ink-1);
}
.breadcrumb-sep:focus-visible {
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
  color: var(--color-ink-1);
}

.breadcrumb-link {
  padding: 4px 6px;
  border-radius: var(--radius-xs);
  display: inline-flex;
  align-items: center;
  min-width: 0;
  transition:
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease,
    color var(--dur-base) ease;
}
.breadcrumb-link:hover {
  background: var(--color-hover);
}

/* The text node lives in this block span so the ellipsis renders (an inline-flex
   parent hard-clips instead). */
.breadcrumb-link__text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Ancestor crumbs cap at a fixed width + ellipsize a long name. */
.breadcrumb-link--crumb {
  max-width: 180px;
}

.breadcrumb-link--current {
  min-width: 0;
}

/* As the page title, the current folder reads as one. */
.breadcrumbs-nav.is-title .breadcrumb-link--current {
  font-size: var(--type-title);
  line-height: var(--type-title-lh);
  font-weight: 700;
}

.breadcrumb-link.is-drop-target {
  background: var(--color-accent-soft);
  box-shadow: var(--glow-accent-strong);
  color: var(--color-accent-ink);
}

/* While a file is being dragged in-app, every droppable crumb becomes a much
   larger drop target so it's obvious which folder will receive the drop: the
   visible pill grows (a bigger highlight) and a transparent hit-area extension
   fills the row height and reaches back over the preceding chevron, so there
   are no dead gaps between crumbs. The resting state is untouched. */
.breadcrumbs-nav--drag .breadcrumb-link {
  position: relative;
  padding: 7px 11px;
}
.breadcrumbs-nav--drag .breadcrumb-link:not(.breadcrumb-link--current)::before {
  content: "";
  position: absolute;
  z-index: 1;
  inset: -7px 0 -7px -16px;
}
</style>
