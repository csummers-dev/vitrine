<template>
  <!-- Mirrors the FileListing shell: full-height column with a hero header
       (title left, actions right) over a scrolling content region — so Trash
       reads like every other page in the app rather than a bespoke screen.
       fb-columns / fb-primary give it the same floating surface-panel shell
       as the files view (v2.7 panel shell). -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <UiPageHeader eyebrow="Recycle bin" title="Trash">
        <template #meta>
          <template v-if="loading">Loading…</template>
          <template v-else-if="entries.length === 0"
            >Nothing here right now</template
          >
          <template v-else>
            {{ entries.length }} item{{ entries.length === 1 ? "" : "s" }} ·
            {{ humanSize(totalSize) }}
          </template>
        </template>
        <template v-if="entries.length > 0 && canDelete" #actions>
          <UiButton icon="trash-2" @click="confirmEmpty">Empty trash</UiButton>
        </template>
      </UiPageHeader>

      <!-- ── Scrolling content ─────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-y-auto px-5 pb-8 max-md:px-3">
        <!-- Loading skeleton (mirrors a real row). -->
        <ul v-if="loading" class="trash-list" role="list" aria-hidden="true">
          <li v-for="i in 4" :key="i" class="trash-row">
            <Skeleton class="trash-tile" />
            <div class="min-w-0 flex-1 flex flex-col gap-1.5">
              <Skeleton class="h-3 rounded w-[34%]" />
              <Skeleton class="h-2.5 rounded w-[58%]" />
            </div>
          </li>
        </ul>

        <!-- Empty. -->
        <EmptyState
          v-else-if="entries.length === 0"
          icon="trash-2"
          title="Trash is empty"
          hint="Deleted files and folders land here. You can put them back where they came from, or remove them for good."
        />

        <!-- List. -->
        <ul v-else class="trash-list" role="list">
          <li v-for="e in entries" :key="e.id" class="trash-row">
            <span class="trash-tile" :class="tileColor(e)" aria-hidden="true">
              <Icon
                :name="iconName(e)"
                :size="17"
                :stroke-width="1.7"
                :fill="e.isDir ? 'currentColor' : 'none'"
              />
            </span>

            <div class="min-w-0 flex-1">
              <div class="trash-name" :title="e.name">{{ e.name }}</div>
              <div class="trash-meta">
                <span class="trash-from">{{ friendlyDir(e.originalDir) }}</span>
                <span class="trash-dot">·</span>
                {{ since(e.trashedAt) }}
                <template v-if="!e.isDir">
                  <span class="trash-dot">·</span> {{ humanSize(e.size) }}
                </template>
              </div>
            </div>

            <div class="trash-actions">
              <UiButton
                v-if="canCreate"
                size="sm"
                icon="undo-2"
                title="Restore to original location"
                aria-label="Restore to original location"
                @click="restore(e)"
                >Restore</UiButton
              >
              <UiButton
                v-if="canDelete"
                size="sm"
                variant="ghost"
                icon="trash-2"
                title="Delete forever"
                aria-label="Delete forever"
                @click="confirmForever(e)"
                >Delete</UiButton
              >
            </div>
          </li>
        </ul>
      </div>

      <ConfirmDialog
        :open="confirm.open"
        :title="confirm.title"
        :message="confirm.message"
        confirm-label="Delete forever"
        cancel-label="Cancel"
        destructive
        @confirm="onConfirm"
        @cancel="confirm.open = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from "vue";
import Icon from "@/components/Icon.vue";
import EmptyState from "@/components/EmptyState.vue";
import Skeleton from "@/components/Skeleton.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
import { trash as trashApi } from "@/api";
import { StatusError } from "@/api/utils";
import type { TrashEntry } from "@/api/trash";
import { useAuthStore } from "@/stores/auth";
import { useRootLabel } from "@/composables/useRootLabel";
import { filesize } from "@/utils";
import { timeAgo } from "@/utils/relativeTime";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const authStore = useAuthStore();
const { rootLabel } = useRootLabel();

const canCreate = computed(() => !!authStore.user?.perm.create);
const canDelete = computed(() => !!authStore.user?.perm.delete);

const entries = ref<TrashEntry[]>([]);
const loading = ref(true);

const totalSize = computed(() =>
  entries.value.reduce((sum, e) => sum + (e.isDir ? 0 : e.size), 0)
);

const load = async () => {
  try {
    entries.value = await trashApi.list();
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const since = (ts: string) => timeAgo(ts);
const humanSize = (n: number) => filesize(n);
const friendlyDir = (dir: string) =>
  dir === "/" ? rootLabel.value || "My files" : decodeURIComponent(dir);

// Same icon + colour system the file listing uses, so a trashed item looks
// exactly like it does in its folder. A TrashEntry carries no server `type`,
// so fileIcon infers it from the extension (see utils/fileIcon) — otherwise
// images/audio/video would fall back to a generic grey tile.
const iconName = (e: TrashEntry) => fileIcon({ isDir: e.isDir, name: e.name });
const tileColor = (e: TrashEntry) =>
  fileIconColor({ isDir: e.isDir, name: e.name });

const restore = async (e: TrashEntry) => {
  try {
    await trashApi.restore(e.id);
    $showSuccess(`Restored “${e.name}”`);
  } catch (err) {
    if (err instanceof Error) $showError(err);
  } finally {
    void load();
  }
};

// One dialog covers both destructive actions; `target` distinguishes them.
const confirm = reactive({
  open: false,
  title: "",
  message: "",
  target: null as TrashEntry | null, // null → empty-trash
});

const confirmForever = (e: TrashEntry) => {
  confirm.target = e;
  confirm.title = `Permanently delete “${e.name}”?`;
  confirm.message = "This cannot be undone.";
  confirm.open = true;
};

const confirmEmpty = () => {
  confirm.target = null;
  confirm.title = `Empty the trash?`;
  confirm.message = `All ${entries.value.length} item${
    entries.value.length === 1 ? "" : "s"
  } will be permanently deleted. This cannot be undone.`;
  confirm.open = true;
};

const onConfirm = async () => {
  confirm.open = false;
  try {
    if (confirm.target) {
      await trashApi.deleteForever(confirm.target.id);
    } else {
      await trashApi.empty();
      $showSuccess("Trash emptied");
    }
  } catch (err) {
    // A 403 here is almost never the user's own permission (the Delete
    // button only renders with perm.delete) — it's the SERVER hitting
    // EACCES/EPERM on the files: something inside is owned by another
    // system user (e.g. media written by a different container's uid),
    // which even the v2.7.3 chmod-and-retry can't cross. Say that,
    // instead of a bare "403 Forbidden".
    if (err instanceof StatusError && err.status === 403) {
      $showError(
        new Error(
          "The server can't delete some items inside — they're owned by " +
            "another system user. Fix the ownership on the volume (chown " +
            "to the server's user), then try again."
        )
      );
    } else if (err instanceof Error) {
      $showError(err);
    }
  } finally {
    confirm.target = null;
    void load();
  }
};
</script>

<style scoped>
/* Decorative separator in the meta line. */
.trash-dot {
  margin: 0 1px;
  opacity: 0.55;
}

/* ── Rows — flat, full-width, hover bg (matches the list view's .item rows;
   no bordered card). ─────────────────────────────────────────────────── */
.trash-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.trash-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  transition: background-color 0.12s ease;
}
.trash-row:hover {
  background: var(--color-hover);
}

/* Colour tile — bg/text classes come from fileIconColor (same as the listing). */
.trash-tile {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.trash-name {
  font-size: 13.5px;
  font-weight: 560;
  color: var(--color-ink-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-meta {
  margin-top: 1px;
  font-size: 11.5px;
  color: var(--color-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-from {
  color: var(--color-ink-2);
}

/* Per-row actions — revealed on hover / focus-within (desktop); always visible
   on touch + narrow widths via the queries below. */
.trash-actions {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.trash-row:hover .trash-actions,
.trash-row:focus-within .trash-actions {
  opacity: 1;
}

@media (hover: none) {
  .trash-actions {
    opacity: 1;
  }
}
@media (max-width: 560px) {
  .trash-actions {
    opacity: 1;
  }
  .trash-actions :deep(.ui-btn__label) {
    display: none;
  }
}
</style>
