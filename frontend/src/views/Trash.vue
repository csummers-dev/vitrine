<template>
  <!-- Mirrors the FileListing shell: full-height column with a hero header
       (title left, actions right) over a scrolling content region — so Trash
       reads like every other page in the app rather than a bespoke screen.
       fb-columns / fb-primary give it the same floating surface-panel shell
       as the files view (v2.7 panel shell). -->
  <div class="fb-columns flex-1 flex min-h-0 overflow-hidden">
    <div class="fb-primary flex-1 flex flex-col min-w-0 min-h-0">
      <!-- ── Hero (matches .fb-hero metrics) ───────────────────────── -->
      <div class="trash-hero">
        <div class="min-w-0">
          <div
            class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em] mb-1"
          >
            Recycle bin
          </div>
          <h1
            class="text-[22px] font-semibold leading-tight text-ink-1 max-md:text-[18px]"
          >
            Trash
          </h1>
          <div class="mt-1 text-[13px] text-ink-3 tabular max-md:text-[12px]">
            <template v-if="loading">Loading…</template>
            <template v-else-if="entries.length === 0"
              >Nothing here right now</template
            >
            <template v-else>
              {{ entries.length }} item{{ entries.length === 1 ? "" : "s" }}
              <span class="trash-dot">·</span>
              {{ humanSize(totalSize) }}
            </template>
          </div>
        </div>

        <button
          v-if="entries.length > 0 && canDelete"
          type="button"
          class="trash-empty-btn"
          @click="confirmEmpty"
        >
          <Icon name="trash-2" :size="14" :stroke-width="1.9" />
          <span class="max-md:hidden">Empty trash</span>
        </button>
      </div>

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
          message="Deleted files and folders land here. You can put them back where they came from, or remove them for good."
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
              <button
                v-if="canCreate"
                type="button"
                class="trash-act trash-act--restore"
                title="Restore to original location"
                aria-label="Restore to original location"
                @click="restore(e)"
              >
                <Icon name="undo-2" :size="14" :stroke-width="1.9" />
                <span class="trash-act__label">Restore</span>
              </button>
              <button
                v-if="canDelete"
                type="button"
                class="trash-act trash-act--forever"
                title="Delete forever"
                aria-label="Delete forever"
                @click="confirmForever(e)"
              >
                <Icon name="trash-2" :size="14" :stroke-width="1.9" />
                <span class="trash-act__label">Delete</span>
              </button>
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
/* Hero — same rhythm as FileListing's .fb-hero (16px 20px 12px, title left,
   actions right) so the page header lines up with the rest of the app. */
.trash-hero {
  display: flex;
  /* Center the "Empty trash" button beside the title (it used to be pushed to
     the far right by a flex-1 on the title block, where top-right toasts
     covered it and blocked the click). */
  align-items: center;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}
@media (max-width: 768px) {
  .trash-hero {
    padding: 12px 16px 10px;
  }
}

.trash-dot {
  margin: 0 1px;
  opacity: 0.55;
}

/* Empty-trash: a rose-tinted danger action sized like the hero toolbar buttons
   (uses the app's defined --c-rose token, light/dark aware). */
.trash-empty-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px;
  margin-top: 2px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--c-rose) 30%, transparent);
  background: color-mix(in srgb, var(--c-rose) 8%, transparent);
  color: var(--c-rose);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
}
.trash-empty-btn:hover {
  background: color-mix(in srgb, var(--c-rose) 15%, transparent);
  border-color: color-mix(in srgb, var(--c-rose) 50%, transparent);
}
@media (max-width: 768px) {
  .trash-empty-btn {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
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
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
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
  color: var(--color-ink-1, #18181b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-meta {
  margin-top: 1px;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-from {
  color: var(--color-ink-2, #52525b);
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

.trash-act {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.trash-act--restore:hover {
  border-color: color-mix(in srgb, var(--c-green) 45%, transparent);
  background: color-mix(in srgb, var(--c-green) 10%, transparent);
  color: var(--c-green);
}
.trash-act--forever:hover {
  border-color: color-mix(in srgb, var(--c-rose) 45%, transparent);
  background: color-mix(in srgb, var(--c-rose) 9%, transparent);
  color: var(--c-rose);
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
  .trash-act__label {
    display: none;
  }
  .trash-act {
    width: 32px;
    justify-content: center;
    padding: 0;
  }
}
</style>
