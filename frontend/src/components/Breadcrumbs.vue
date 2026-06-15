<template>
  <nav
    ref="navEl"
    class="breadcrumbs-nav flex items-center gap-0.5 text-[13px] min-w-0 text-ink-2"
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
      <Icon name="house" :size="14" class="text-[var(--c-blue)]" />
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

    <!-- Desktop: every segment is shown in full (no middle "…" fold) — when the
         path is wider than the bar the strip scrolls horizontally instead, with
         the scroll pinned to the current folder. Mobile keeps the compact "…"
         above and hides the intermediate crumbs (`max-md:hidden`). -->
    <template v-for="(entry, index) in items" :key="index">
      <span
        :class="[
          'text-ink-3 px-0.5 flex items-center',
          // Hide the chevron preceding non-final items on mobile —
          // mobile already collapses everything but the last crumb
          // into the compact ellipsis up top.
          index !== items.length - 1 && 'max-md:hidden',
        ]"
      >
        <Icon name="chevron-right" :size="12" />
      </span>

      <component
        :is="element"
        :to="entry.url"
        :class="[
          'breadcrumb-link',
          index === items.length - 1
            ? 'breadcrumb-link--current text-ink-1 font-semibold'
            : 'breadcrumb-link--crumb text-ink-2 max-md:hidden',
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
             truncates — an inline-flex link can't ellipsize its own text node
             (it hard-clips). Ancestor crumbs cap + ellipsize at a fixed width;
             the current crumb shows in full and the bar scrolls if it overflows. -->
        <span class="breadcrumb-link__text">{{ entry.name }}</span>
      </component>
    </template>
  </nav>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { useDropTarget } from "@/composables/useDropTarget";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const { performDrop } = useDropTarget();

// When the path is too long for the bar it scrolls horizontally; default the
// scroll to the FAR RIGHT so the current folder (last crumb) is visible by
// default, and the user can scroll left to reach ancestors.
const navEl = ref<HTMLElement | null>(null);
watch(
  () => route.path,
  () =>
    void nextTick(() => {
      if (navEl.value) navEl.value.scrollLeft = navEl.value.scrollWidth;
    }),
  { immediate: true }
);

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
});
</script>

<style scoped>
/* The breadcrumb strip scrolls horizontally instead of overflowing under the
   search box / header actions when the path is too long for the available
   width (the reported "covered up" bug, most visible on mobile / narrow
   windows). The scrollbar is hidden so it stays clean; children don't shrink
   so the full path can be revealed by scrolling. */
.breadcrumbs-nav {
  overflow-x: auto;
  overflow-y: hidden;
  flex-wrap: nowrap;
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* Smooth momentum scrolling on iOS. */
  -webkit-overflow-scrolling: touch;
}
.breadcrumbs-nav::-webkit-scrollbar {
  display: none;
}
.breadcrumbs-nav > * {
  flex-shrink: 0;
}

.breadcrumb-link {
  padding: 4px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  transition:
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease,
    color var(--dur-base) ease;
}
.breadcrumb-link:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
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

/* The current folder does NOT shrink (matches the nav's `> * { flex-shrink: 0 }`)
   so when the path is too long the strip OVERFLOWS and the nav scrolls
   horizontally (scroll pinned to the current folder), instead of the name being
   silently ellipsized to fit. */
.breadcrumb-link--current {
  flex-shrink: 0;
  min-width: 0;
}

.breadcrumb-link.is-drop-target {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  box-shadow: 0 0 0 2px var(--color-accent, #5e6ad2);
  color: var(--color-accent, #5e6ad2);
}
</style>
