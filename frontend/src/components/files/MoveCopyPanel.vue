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
        @click="onCreateFolder"
      >
        <Icon name="folder-plus" :size="13" />
        New folder
      </button>
      <div class="mcp-spacer"></div>
      <button type="button" class="mcp-btn mcp-btn--ghost" @click="onCancel">
        Cancel
      </button>
      <button
        type="button"
        class="mcp-btn mcp-btn--primary"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        {{ actionLabel }}
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { files as api } from "@/api";
import { removePrefix } from "@/api/utils";
import * as upload from "@/utils/upload";
import { inject } from "vue";
import SlideOver from "@/components/SlideOver.vue";
import FolderPicker from "@/components/files/FolderPicker.vue";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  open: boolean;
  mode: "move" | "copy";
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "done"): void;
}>();

const $showError = inject<IToastError>("$showError")!;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

const pickerRef = ref<InstanceType<typeof FolderPicker> | null>(null);
const destPath = ref<string>("");

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

const initialPath = computed(() =>
  fileStore.isFiles ? route.path.replace(/\/?$/, "/") : "/files/"
);

const excluded = computed(() => {
  // For Move, don't let the user pick a folder that's currently being moved.
  // For Copy, picking the same folder is fine — backend auto-renames.
  if (props.mode !== "move") return [];
  return selectedItems.value.filter((i) => i.isDir).map((i) => i.url);
});

const canCreate = computed(() => !!authStore.user?.perm.create);

const sameAsSource = computed(
  () => destPath.value === route.path || destPath.value === route.path + "/"
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
  // Reuse the existing newDir flow but scoped to the picker's current path.
  // The picker doesn't auto-refresh on confirm yet, so we trigger refresh().
  const base = destPath.value;
  layoutStore.showHover({
    prompt: "newDir",
    confirm: (createdUrl: string) => {
      // Append the new folder to the picker's current view instead of refetch
      const parts = createdUrl.replace(/\/$/, "").split("/");
      pickerRef.value?.appendFolder({
        name: decodeURIComponent(parts[parts.length - 1]),
        url: createdUrl,
      });
    },
    props: { redirect: false, base },
  });
};

const onSubmit = async () => {
  if (!canSubmit.value) return;
  const dest = destPath.value;
  const items = selectedItems.value.map((i) => ({
    from: i.url,
    to: dest + encodeURIComponent(i.name),
    name: i.name,
    size: i.size,
    modified: i.modified,
    isDir: i.isDir,
    overwrite: false,
    rename: false,
  }));

  // The legacy flows show a conflict-resolution prompt when names already
  // exist. We delegate to the same util so behavior stays identical.
  const conflict = await upload.checkConflict(items, dest);

  const performAction = async () => {
    try {
      if (props.mode === "move") {
        await api.move(items, false, false);
      } else {
        await api.copy(items, false, false);
      }
      // Keep the first moved/copied item highlighted in the destination
      fileStore.preselect = removePrefix(items[0].to);
      if (
        authStore.user?.redirectAfterCopyMove &&
        dest !== route.path &&
        dest !== route.path + "/"
      ) {
        router.push({ path: dest });
      } else {
        fileStore.reload = true;
      }
      emit("done");
    } catch (e) {
      if (e instanceof Error) $showError(e);
    }
  };

  if (conflict.length > 0) {
    // Hand off to the existing conflict-resolution prompt; on confirm, apply
    // the rename/overwrite/skip choices and re-run the action.
    layoutStore.showHover({
      prompt: "resolve-conflict",
      props: { conflict, files: items },
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
        if (items.length > 0) void performAction();
      },
    });
    return;
  }

  void performAction();
};

// Snapshot selection when the panel opens. Closing the panel doesn't clear
// the snapshot so the slide-out animation keeps showing the right items.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
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
    destPath.value = initialPath.value;
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
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.mcp-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.mcp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
