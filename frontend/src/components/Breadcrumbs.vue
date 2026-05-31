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

    <template v-for="(link, index) in items" :key="index">
      <span
        :class="[
          'text-ink-3 px-0.5 flex items-center',
          index !== items.length - 1 && 'max-md:hidden',
        ]"
      >
        <Icon name="chevron-right" :size="12" />
      </span>
      <component
        :is="element"
        :to="link.url"
        :class="[
          'breadcrumb-link truncate max-w-[180px]',
          index === items.length - 1
            ? 'text-ink-1 font-semibold'
            : 'text-ink-2 max-md:hidden',
          dragOver === link.url && 'is-drop-target',
        ]"
        @dragenter="onDragEnter(link.url, $event)"
        @dragover="onDragOver($event)"
        @dragleave="onDragLeave(link.url)"
        @drop="onDrop(link.url, link.url, $event)"
      >
        {{ link.name }}
      </component>
    </template>
  </nav>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { useDropTarget } from "@/composables/useDropTarget";

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

  if (breadcrumbs.length > 3) {
    while (breadcrumbs.length !== 4) {
      breadcrumbs.shift();
    }

    breadcrumbs[0].name = "...";
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
</style>
