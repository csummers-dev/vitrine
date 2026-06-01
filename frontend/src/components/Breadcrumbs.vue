<template>
  <nav
    class="flex items-center gap-0.5 text-[13px] min-w-0 text-ink-2"
    :aria-label="t('files.home')"
  >
    <component
      :is="element"
      :to="base || ''"
      :aria-label="t('files.home')"
      :title="t('files.home')"
      class="breadcrumb-link breadcrumb-link--root"
      :class="{ 'is-drop-target': dragOver === 'root' }"
      @dragenter="onDragEnter('root', $event)"
      @dragover="onDragOver($event)"
      @dragleave="onDragLeave('root')"
      @drop="onDrop(rootUrl, 'root', $event)"
      @mouseenter="onRootHoverEnter($event)"
      @mouseleave="cancelHoverTimer"
    >
      <Icon name="house" :size="14" />
    </component>

    <!-- Compact ellipsis shown only at narrow widths when there are intermediate
         segments (i.e. more than just the current folder). Saves horizontal room. -->
    <template v-if="items.length > 1">
      <span class="text-ink-3 px-0.5 hidden max-md:flex items-center">
        <Icon name="chevron-right" :size="12" />
      </span>
      <span
        class="px-1.5 py-1 rounded text-ink-3 hidden max-md:inline-flex items-center"
        :title="
          items
            .slice(0, -1)
            .map((l) => l.name)
            .join(' / ')
        "
      >
        …
      </span>
    </template>

    <template v-for="(entry, index) in displayItems" :key="index">
      <span
        :class="[
          'text-ink-3 px-0.5 flex items-center',
          // Hide the chevron preceding non-final items on mobile —
          // mobile already collapses everything but the last crumb
          // into the compact ellipsis up top.
          index !== displayItems.length - 1 && 'max-md:hidden',
        ]"
      >
        <Icon name="chevron-right" :size="12" />
      </span>

      <!-- Middle-ellipsis chip (v1.3 S3-6). When the path has more
           than 4 segments we collapse the middle into this clickable
           chip. Clicking it pops a ContextMenu listing the hidden
           segments so the user can jump directly to any of them. -->
      <button
        v-if="entry.kind === 'ellipsis'"
        type="button"
        class="breadcrumb-link breadcrumb-link--ellipsis max-md:hidden"
        :title="entry.collapsed.map((c) => c.name).join(' / ')"
        :aria-label="`${entry.collapsed.length} hidden path segment(s)`"
        @click.stop="openEllipsisMenu($event, entry.collapsed)"
      >
        …
      </button>

      <component
        v-else
        :is="element"
        :to="entry.link.url"
        :class="[
          'breadcrumb-link truncate max-w-[180px]',
          index === displayItems.length - 1
            ? 'text-ink-1 font-semibold'
            : 'text-ink-2 max-md:hidden',
          dragOver === entry.link.url && 'is-drop-target',
        ]"
        @dragenter="onDragEnter(entry.link.url, $event)"
        @dragover="onDragOver($event)"
        @dragleave="onDragLeave(entry.link.url)"
        @drop="onDrop(entry.link.url, entry.link.url, $event)"
        @mouseenter="onCrumbHoverEnter(entry.link, $event)"
        @mouseleave="cancelHoverTimer"
      >
        {{ entry.link.name }}
      </component>
    </template>

    <!-- Dropdown for the collapsed middle segments. ContextMenu
         primitive (S1-3) handles keyboard nav + smart positioning. -->
    <context-menu
      :show="ellipsisMenuShow"
      :pos="ellipsisMenuPos"
      :items="ellipsisMenuItems"
      @hide="ellipsisMenuShow = false"
    />

    <!-- Sibling-folder hover dropdown (v1.3 S3-7). Triggered by
         hovering any crumb (root or named) for 400 ms. Lists peer
         folders at that path depth for one-click lateral nav.
         Shares ContextMenu styling/keynav with the ellipsis menu. -->
    <context-menu
      :show="siblingsMenuShow"
      :pos="siblingsMenuPos"
      :items="siblingsMenuItems"
      @hide="siblingsMenuShow = false"
    />
  </nav>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { useDropTarget } from "@/composables/useDropTarget";
import { files as api } from "@/api";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const { performDrop } = useDropTarget();

const props = defineProps<{
  base: string;
  noLink?: boolean;
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

// ── Middle-ellipsis collapse (v1.3 S3-6) ────────────────────────────
// Standard pattern (Finder, Linear): when a path is deeper than 4
// segments, keep the first, second-to-last, and last visible, and
// collapse the middle into a clickable "…" chip. Click pops a
// ContextMenu listing the hidden segments so the user can jump to
// any of them in one click.
const ELLIPSIS_THRESHOLD = 4;

/**
 * Discriminated union of items rendered in the breadcrumb strip.
 * Either a real link or an ellipsis chip carrying the collapsed
 * sub-list. Template branches on `kind`.
 */
type CrumbEntry =
  | { kind: "link"; link: BreadCrumb }
  | { kind: "ellipsis"; collapsed: BreadCrumb[] };

const displayItems = computed<CrumbEntry[]>(() => {
  const all = items.value;
  if (all.length <= ELLIPSIS_THRESHOLD) {
    return all.map((link) => ({ kind: "link" as const, link }));
  }
  // Keep: items[0] (first), items[len-2] (second-last), items[len-1] (last)
  // Collapse: items[1..len-2] (everything between first and second-last)
  return [
    { kind: "link" as const, link: all[0] },
    { kind: "ellipsis" as const, collapsed: all.slice(1, all.length - 2) },
    { kind: "link" as const, link: all[all.length - 2] },
    { kind: "link" as const, link: all[all.length - 1] },
  ];
});

// ── Ellipsis dropdown state ─────────────────────────────────────────
const ellipsisMenuShow = ref(false);
const ellipsisMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const ellipsisMenuItems = ref<MenuItem[]>([]);

const openEllipsisMenu = (event: MouseEvent, collapsed: BreadCrumb[]) => {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  // Anchor under the ellipsis chip. ContextMenu's positioner clamps
  // to viewport so right-edge overflow self-corrects.
  ellipsisMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
  ellipsisMenuItems.value = collapsed.map((crumb) => ({
    label: crumb.name,
    icon: "folder",
    action: () => router.push({ path: crumb.url }),
  }));
  ellipsisMenuShow.value = true;
};

const element = computed(() => {
  if (props.noLink) {
    return "span";
  }

  return "router-link";
});

const rootUrl = computed(() => `${props.base}/`);

// ── Drag-to-parent (F5) ──────────────────────────────────────────────
// Each breadcrumb segment is a drop target during a file drag so the
// user can move items to any ancestor in the path without leaving the
// current folder. `dragOver` tracks which crumb is currently lit up so
// the accent ring renders. We DON'T accept drops on the segment for
// the folder the user is already in (the current folder is its own
// crumb — dropping there would be a no-op move).

const dragOver = ref<string | null>(null);

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
  cancelHoverTimer();
});

// ── Sibling-folder hover dropdown (v1.3 S3-7) ────────────────────────
// Hovering any crumb (root or named) for 400 ms opens a ContextMenu
// listing peer folders at that depth. Lets the user jump laterally —
// "Documents → Photos at the same level" — without first navigating
// to the parent. Results are cached in-memory for 30 s per parent
// URL so repeated traversals are instant and don't hammer the API.
//
// Why module-level cache (instead of in-component): the same parent
// directory is often re-hovered as the user moves through subtrees
// (e.g. /A/B/C → /A/B/D shares /A/B/'s sibling list). Module scope
// means the cache survives crumb re-renders and short navigations.
const HOVER_DELAY_MS = 400;
const SIBLINGS_TTL_MS = 30000;
const siblingsCache = new Map<
  string,
  { items: BreadCrumb[]; expires: number }
>();

let hoverTimer: number | null = null;
const siblingsMenuShow = ref(false);
const siblingsMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const siblingsMenuItems = ref<MenuItem[]>([]);

/** Derive the parent URL of a crumb URL.
 *  "/files/Docs/Letters/" → "/files/Docs/", "/files/Docs/" → "/files/" */
const parentUrlOf = (crumbUrl: string): string => {
  const trimmed = crumbUrl.endsWith("/") ? crumbUrl.slice(0, -1) : crumbUrl;
  const parent = trimmed.replace(/[^/]+$/, "");
  return parent || rootUrl.value;
};

const cancelHoverTimer = () => {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

/** Fetch (with 30 s in-memory cache) the folder children of a path.
 *  Returns an empty array on any error — UI silently skips opening
 *  the menu in that case, which is the right "do no harm" behavior. */
const fetchSiblings = async (parentUrl: string): Promise<BreadCrumb[]> => {
  const now = Date.now();
  const cached = siblingsCache.get(parentUrl);
  if (cached && cached.expires > now) return cached.items;
  try {
    const res = await api.fetch(parentUrl);
    if (!res.isDir || !Array.isArray(res.items)) return [];
    const siblings: BreadCrumb[] = res.items
      .filter((it: any) => it.isDir)
      .map((it: any) => ({ name: it.name, url: it.url }));
    siblingsCache.set(parentUrl, {
      items: siblings,
      expires: now + SIBLINGS_TTL_MS,
    });
    return siblings;
  } catch {
    return [];
  }
};

/** Open the sibling-folder menu anchored to `anchor`, listing
 *  folders under `parentUrl` excluding `excludeName` (so a crumb's
 *  own name isn't shown as a "sibling" of itself). Bails silently
 *  during an active drag — the spring-load + drop machinery owns
 *  hover then, and we don't want a menu popping up under the cursor. */
const openSiblingsForParent = async (
  parentUrl: string,
  anchor: HTMLElement,
  excludeName?: string
) => {
  if (fileStore.draggedItems.length > 0) return;
  const siblings = await fetchSiblings(parentUrl);
  const filtered = excludeName
    ? siblings.filter((s) => s.name !== excludeName)
    : siblings;
  if (filtered.length === 0) return;
  const rect = anchor.getBoundingClientRect();
  // Anchor under the crumb. ContextMenu clamps to viewport so
  // right-edge overflow self-corrects.
  siblingsMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
  siblingsMenuItems.value = filtered.map((s) => ({
    label: s.name,
    icon: "folder",
    action: () => {
      siblingsMenuShow.value = false;
      router.push({ path: s.url });
    },
  }));
  siblingsMenuShow.value = true;
};

const onCrumbHoverEnter = (crumb: BreadCrumb, event: MouseEvent) => {
  cancelHoverTimer();
  const anchor = event.currentTarget as HTMLElement;
  const parent = parentUrlOf(crumb.url);
  hoverTimer = window.setTimeout(() => {
    hoverTimer = null;
    void openSiblingsForParent(parent, anchor, crumb.name);
  }, HOVER_DELAY_MS);
};

const onRootHoverEnter = (event: MouseEvent) => {
  cancelHoverTimer();
  const anchor = event.currentTarget as HTMLElement;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = null;
    // Root's "siblings" = top-level folders. No name to exclude.
    void openSiblingsForParent(rootUrl.value, anchor);
  }, HOVER_DELAY_MS);
};

// Close the sibling menu the moment a drag begins — a drag operation
// implies a different interaction model (move/copy targets, spring-load)
// and a dangling hover-menu would be confusing.
watch(
  () => fileStore.draggedItems.length,
  (n) => {
    if (n > 0) {
      siblingsMenuShow.value = false;
      cancelHoverTimer();
    }
  }
);
</script>

<style scoped>
.breadcrumb-link {
  padding: 4px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease,
    color 120ms ease;
}
.breadcrumb-link:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}

.breadcrumb-link.is-drop-target {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  box-shadow: 0 0 0 2px var(--color-accent, #5e6ad2);
  color: var(--color-accent, #5e6ad2);
}

/* Middle-ellipsis chip (v1.3 S3-6). Button-shaped (not a link)
   because clicking opens a dropdown of skipped segments, not a
   navigation. Slightly tighter padding than regular crumbs so it
   reads as a compact placeholder. */
.breadcrumb-link--ellipsis {
  font: inherit;
  font-size: 13px;
  border: 0;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
}
.breadcrumb-link--ellipsis:hover {
  color: var(--color-ink-1, #18181b);
}
.breadcrumb-link--ellipsis:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}
</style>
