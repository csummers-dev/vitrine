<template>
  <!-- Recent (Phase 6, 3.5; Decision 1): files you opened, newest first. -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <UiPageHeader
        title="Recent"
        :meta-attrs="{ 'data-testid': 'recent-summary' }"
      >
        <template #meta>
          <template v-if="entries.length === 0">Nothing opened yet</template>
          <template v-else>
            {{ entries.length }} {{ entries.length === 1 ? "file" : "files" }}
          </template>
        </template>
        <template v-if="entries.length > 0" #actions>
          <UiButton icon="x" variant="ghost" @click="clearAll"
            >Clear list</UiButton
          >
        </template>
      </UiPageHeader>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 pb-8 max-md:px-3">
        <EmptyState
          v-if="entries.length === 0"
          icon="clock"
          title="No recent files"
          hint="Files you open show up here, newest first."
        />
        <ul v-else class="recent-list" data-testid="recent-list">
          <li
            v-for="r in entries"
            :key="r.path"
            class="recent-row"
            @contextmenu.prevent="openMenu(r, $event)"
          >
            <button
              type="button"
              class="recent-row__open"
              :title="r.path"
              @click="open(r)"
            >
              <span
                class="recent-row__tile"
                :class="fileIconColor({ name: r.name })"
                aria-hidden="true"
              >
                <Icon :name="fileIcon({ name: r.name })" :size="17" />
              </span>
              <span class="recent-row__text">
                <span class="recent-row__name">{{ label(r.name) }}</span>
                <span class="recent-row__dir">{{ folderOf(r.path) }}</span>
              </span>
              <span class="recent-row__when">{{ since(r.accessedAt) }}</span>
            </button>
            <UiIconButton
              icon="ellipsis"
              size="sm"
              :label="`More for ${r.name}`"
              @click.stop="openMenu(r, $event)"
            />
          </li>
        </ul>
      </div>

      <ContextMenu
        :show="menu.show"
        :pos="menu.pos"
        :items="menuItems"
        @hide="menu.show = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The recents log as a page (it used to be a short list in the sidebar).
 * Opening a row opens the file where it lives. Renames made in the app are
 * followed (useRecents.renamePath); when a folder holding a recent file
 * changes on disk, the entries in it are checked and dropped if the file is
 * gone.
 */
import { computed, reactive } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiIconButton from "@/components/ui/UiIconButton.vue";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
import { useRecents, type RecentEntry } from "@/composables/useRecents";
import { usePreferences } from "@/composables/usePreferences";
import { useServerEvents } from "@/composables/useServerEvents";
import { useRootLabel } from "@/composables/useRootLabel";
import { useFileStore } from "@/stores/file";
import { files as filesApi } from "@/api";
import { StatusError } from "@/api/utils";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { displayName } from "@/utils/filename";
import { encodePath } from "@/utils/url";
import { timeAgo } from "@/utils/relativeTime";

const router = useRouter();
const recents = useRecents();
const prefs = usePreferences();
const fileStore = useFileStore();
const { rootLabel } = useRootLabel();

const entries = computed(() => recents.recents.value);

const label = (name: string) =>
  displayName(name, false, prefs.get("nav.showExtensions", true));
const since = (ms: number) => timeAgo(new Date(ms).toISOString());
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const folderOf = (path: string) => {
  const dir = parentOf(path);
  return dir === "/" ? rootLabel.value || "My files" : dir;
};
const fileUrl = (path: string) => `/files${encodePath(path)}`;

const open = (r: RecentEntry) => void router.push(fileUrl(r.path));
const reveal = (r: RecentEntry) => {
  fileStore.setPreselect(r.path);
  const dir = parentOf(r.path);
  void router.push(`/files${encodePath(dir)}${dir === "/" ? "" : "/"}`);
};
const clearAll = () => recents.clear();

const menu = reactive({ show: false, pos: { x: 0, y: 0 } });
const target = reactive<{ r: RecentEntry | null }>({ r: null });
const openMenu = (r: RecentEntry, e: MouseEvent) => {
  target.r = r;
  menu.pos = { x: e.clientX, y: e.clientY };
  menu.show = true;
};
const menuItems = computed<MenuItem[]>(() => {
  const r = target.r;
  if (!r) return [];
  return [
    { label: "Open", icon: "external-link", action: () => open(r) },
    { label: "Show in folder", icon: "folder-open", action: () => reveal(r) },
    { type: "separator" },
    {
      label: "Remove from Recent",
      icon: "x",
      destructive: true,
      action: () => recents.remove(r.path),
    },
  ];
});

// A folder holding recent files changed: drop the ones that are gone.
useServerEvents("files.changed", async ({ dir, names }) => {
  const d = dir.length > 1 ? dir.replace(/\/+$/, "") : dir;
  const affected = entries.value.filter(
    (r) => parentOf(r.path) === d && names.includes(r.name)
  );
  const gone: string[] = [];
  await Promise.all(
    affected.map(async (r) => {
      try {
        await filesApi.fetch(fileUrl(r.path));
      } catch (e) {
        if (e instanceof StatusError && e.status === 404) gone.push(r.path);
      }
    })
  );
  recents.removeMany(gone);
});
</script>

<style scoped>
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.recent-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  padding-right: var(--space-2);
}
.recent-row:hover {
  background: var(--color-hover);
}
.recent-row__open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.recent-row__open:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.recent-row__tile {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.recent-row__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.recent-row__name {
  font-size: var(--type-ui);
  font-weight: 500;
  color: var(--color-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-row__dir {
  font-size: var(--type-small);
  color: var(--color-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-row__when {
  flex-shrink: 0;
  font-size: var(--type-small);
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
