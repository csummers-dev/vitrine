<template>
  <SlideOver
    :open="open"
    :eyebrow="mode === 'move' ? 'Move' : 'Copy'"
    :title="title"
    @cancel="onCancel"
  >
    <!-- Selection summary chip -->
    <div class="mcp-summary">
      <Icon
        :name="mode === 'move' ? 'forward' : 'copy'"
        :size="14"
        :stroke-width="1.6"
      />
      <span>
        {{ summaryLabel }}
      </span>
    </div>

    <p class="mcp-instructions">
      Navigate to the destination folder, then click
      <strong>{{ mode === "move" ? "Move here" : "Copy here" }}</strong
      >.
    </p>

    <!-- RC-16: persisted "open destination" toggle (backed by the user's
         redirectAfterCopyMove field — cross-device, default off). Bound
         via explicit handler so only real toggles persist, not the
         on-open seeding. RC-45: kept at the TOP (above the folder picker)
         so it's visible without scrolling past a long folder list. -->
    <label class="mcp-option">
      <Toggle
        :model-value="openDest"
        :disabled="busy"
        @update:model-value="onToggleOpenDest"
      />
      <span class="mcp-option__text">
        <span class="mcp-option__label">
          Open destination after {{ mode === "move" ? "moving" : "copying" }}
        </span>
        <span class="mcp-option__hint">
          Go to the destination folder when the {{ mode }} finishes.
        </span>
      </span>
    </label>

    <FolderPicker
      ref="pickerRef"
      :initial-path="initialPath"
      :exclude="excluded"
      @update:path="onPathChange"
    />

    <template #footer>
      <button
        v-if="canCreate"
        type="button"
        class="mcp-btn mcp-btn--ghost"
        :disabled="busy"
        @click="onCreateFolder"
      >
        <Icon name="folder-plus" :size="13" />
        New folder
      </button>
      <div class="mcp-spacer"></div>
      <button
        type="button"
        class="mcp-btn mcp-btn--ghost"
        :disabled="busy"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="mcp-btn mcp-btn--primary"
        :disabled="!canSubmit || busy"
        @click="onSubmit"
      >
        <Icon v-if="busy" name="loader-circle" :size="13" class="mcp-spin" />
        {{ busy ? (mode === "move" ? "Moving…" : "Copying…") : actionLabel }}
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { users } from "@/api";
import * as upload from "@/utils/upload";
import { startTransfer, buildMoveCopyItems } from "@/utils/transfers";
import SlideOver from "@/components/SlideOver.vue";
import FolderPicker from "@/components/files/FolderPicker.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Icon from "@/components/Icon.vue";

type MoveCopyItem = {
  url: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
};

const props = defineProps<{
  open: boolean;
  mode: "move" | "copy";
  /**
   * Dual-pane (pane B): when set, move/copy THESE items from THIS source folder
   * instead of reading pane A's `fileStore` selection + route. Undefined for
   * pane A, so that path is byte-for-byte unchanged. The transfer itself
   * (`startTransfer`) is pane-agnostic; the TransferDock refreshes both panes
   * on settle, so no per-pane reload wiring is needed here.
   */
  override?: { items: MoveCopyItem[]; sourceUrl: string } | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "done"): void;
}>();

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();
// Shared floating transfer indicator (same one drag-drop moves use).
const $showError = inject<IToastError>("$showError");
const $showSuccess = inject<IToastSuccess>("$showSuccess");

const pickerRef = ref<InstanceType<typeof FolderPicker> | null>(null);
const destPath = ref<string>("");
// RC-16: in-flight indicator + the persisted "open destination" choice.
const busy = ref<boolean>(false);
const openDest = ref<boolean>(false);

// Persist the toggle to the user's redirectAfterCopyMove field (only on a
// real user toggle — see the explicit handler binding). Non-fatal if the
// write fails; the choice still applies for this session.
const onToggleOpenDest = async (val: boolean) => {
  openDest.value = val;
  const user = authStore.user;
  if (!user) return;
  try {
    await users.update({ id: user.id, redirectAfterCopyMove: val }, [
      "redirectAfterCopyMove",
    ]);
    authStore.updateUser({ redirectAfterCopyMove: val });
  } catch {
    /* swallow — toggle still works locally */
  }
};

// Items being moved/copied — snapshotted on open so layout-store changes
// don't pull the rug from under the panel.
const selectedItems = ref<
  {
    url: string;
    name: string;
    isDir: boolean;
    size: number;
    modified: string;
  }[]
>([]);

// The source folder the items came from (trailing-slash-stripped to match
// `route.path`). Drives the picker's start folder + the "same as source" no-op
// guard + the "open destination" skip.
const sourceFolder = computed(() =>
  props.override ? props.override.sourceUrl.replace(/\/+$/, "") : route.path
);

const initialPath = computed(() =>
  props.override
    ? props.override.sourceUrl.replace(/\/?$/, "/")
    : fileStore.isFiles
      ? route.path.replace(/\/?$/, "/")
      : "/files/"
);

const excluded = computed(() => {
  // For Move, don't let the user pick a folder that's currently being moved.
  // For Copy, picking the same folder is fine — backend auto-renames.
  if (props.mode !== "move") return [];
  return selectedItems.value.filter((i) => i.isDir).map((i) => i.url);
});

const canCreate = computed(() => !!authStore.user?.perm.create);

const sameAsSource = computed(
  () =>
    destPath.value === sourceFolder.value ||
    destPath.value === sourceFolder.value + "/"
);

const canSubmit = computed(() => {
  if (selectedItems.value.length === 0) return false;
  if (!destPath.value) return false;
  // Move into the same folder is a no-op; Copy is allowed (backend renames).
  if (props.mode === "move" && sameAsSource.value) return false;
  return true;
});

const title = computed(() => {
  const n = selectedItems.value.length;
  if (n === 0) return props.mode === "move" ? "Move…" : "Copy…";
  if (n === 1)
    return props.mode === "move"
      ? `Move “${selectedItems.value[0].name}”`
      : `Copy “${selectedItems.value[0].name}”`;
  return props.mode === "move" ? `Move ${n} items` : `Copy ${n} items`;
});

const summaryLabel = computed(() => {
  const n = selectedItems.value.length;
  return n === 1 ? "1 item selected" : `${n} items selected`;
});

const actionLabel = computed(() =>
  props.mode === "move" ? "Move here" : "Copy here"
);

const onPathChange = (p: string) => {
  destPath.value = p;
};

const onCancel = () => emit("cancel");

const onCreateFolder = () => {
  // Create a folder in the picker's CURRENTLY-BROWSED destination — not the
  // listing behind the panel. The picker owns the inline input + POST and then
  // drops into the new folder so it becomes the chosen destination. (The old
  // flow routed through the listing's inline new-folder, which created it in
  // the current open directory — unreachable behind the panel's scrim.)
  void pickerRef.value?.startCreate();
};

const onSubmit = async () => {
  if (!canSubmit.value) return;
  const dest = destPath.value;
  const items = buildMoveCopyItems(selectedItems.value, dest);

  // The legacy flows show a conflict-resolution prompt when names already
  // exist. We delegate to the same util so behavior stays identical.
  const conflict = await upload.checkMoveConflict(items, dest);

  // RC-46: run the transfer in the BACKGROUND. Close the tool immediately
  // and hand off to the shared floating transfer indicator (the same one
  // drag-drop moves use) so the user can keep working while it runs —
  // instead of holding the panel open with a spinning button. Per-item
  // overwrite/rename flags (set during conflict resolution) are read by
  // the move/copy API; the (false, false) args are just the defaults.
  const runInBackground = () => {
    const isCopy = props.mode === "copy";
    const sourceRoute = sourceFolder.value;
    const goToDest =
      openDest.value && dest !== sourceRoute && dest !== sourceRoute + "/";

    // Close the panel now — the transfer runs in the background and its
    // progress + result are shown by the floating transfer dock, which also
    // refreshes the listing when the job settles.
    emit("done");

    if (goToDest) router.push({ path: dest });

    // Selecting the moved/copied items at their destination is handled
    // centrally when the job settles (TransferDock), using the server's
    // resolved destination names — so it works whether you stay here or use
    // "open destination" to land in the target folder (where the new files
    // don't exist until the copy actually finishes).
    void startTransfer(isCopy ? "copy" : "move", items).catch((e) =>
      $showError?.(e as Error)
    );
  };

  if (conflict.length > 0) {
    // Hand off to the existing conflict-resolution prompt; on confirm, apply
    // the rename/overwrite/skip choices and then run in the background.
    // Source for the header line = parent dir of the first selected item;
    // dest = the folder the picker resolved to.
    const firstFrom = items[0]?.from ?? "";
    const sourceUrl = firstFrom.replace(/[^/]+\/?$/, "");
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: { conflict, files: items, from: sourceUrl, to: dest },
      confirm: (event: any, result: any[]) => {
        event?.preventDefault?.();
        layoutStore.closeHovers();
        for (let i = result.length - 1; i >= 0; i--) {
          const r = result[i];
          if (r.checked.length === 2) {
            items[r.index].rename = true;
          } else if (r.checked.length === 1 && r.checked[0] === "origin") {
            items[r.index].overwrite = true;
          } else {
            items.splice(r.index, 1);
          }
        }
        if (items.length > 0) runInBackground();
        // Every conflicting item was skipped — nothing left to transfer. Tell
        // the user, otherwise the dialog closes silently with no indication of
        // what happened.
        else
          $showSuccess?.(
            `All conflicting items were skipped — nothing was ${
              props.mode === "copy" ? "copied" : "moved"
            }.`
          );
      },
    });
    return;
  }

  runInBackground();
};

// Snapshot selection when the panel opens. Closing the panel doesn't clear
// the snapshot so the slide-out animation keeps showing the right items.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.override) {
      // Pane B (or any non-pane-A caller): use the items handed in.
      selectedItems.value = props.override.items.map((i) => ({
        url: i.url,
        name: i.name,
        isDir: i.isDir,
        size: i.size,
        modified: i.modified,
      }));
    } else {
      const req = fileStore.req;
      if (!req) return;
      selectedItems.value = fileStore.selected
        .map((idx) => req.items[idx])
        .filter(Boolean)
        .map((i) => ({
          url: i.url,
          name: i.name,
          isDir: i.isDir,
          size: i.size,
          modified: i.modified,
        }));
    }
    destPath.value = initialPath.value;
    busy.value = false;
    // RC-16: seed the toggle from the persisted user field.
    openDest.value = !!authStore.user?.redirectAfterCopyMove;
  }
);
</script>

<style scoped>
.mcp-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
  font-size: 11.5px;
  font-weight: 500;
  margin-bottom: 10px;
}

.mcp-instructions {
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
  margin: 0 0 14px;
  line-height: 1.45;
}

.mcp-instructions strong {
  color: var(--color-ink-1, #18181b);
  font-weight: 600;
}

/* RC-16: open-destination toggle row. RC-45: sits above the folder picker,
   so the spacing is below it (not above). */
.mcp-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  cursor: pointer;
}

.mcp-option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mcp-option__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
}

.mcp-option__hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.4;
}

.mcp-spin {
  animation: mcp-spin 0.9s linear infinite;
}

@keyframes mcp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mcp-spin {
    animation: none;
  }
}

.mcp-spacer {
  flex: 1;
}

.mcp-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.mcp-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.mcp-btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.mcp-btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.mcp-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.mcp-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.mcp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
