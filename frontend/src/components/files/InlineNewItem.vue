<template>
  <div class="item inline-new" :data-dir="isDir ? 'true' : 'false'">
    <!-- Empty checkbox slot to keep grid alignment with real rows -->
    <div class="item__select"></div>

    <!-- Name cell: squircle icon + inline input -->
    <div class="item__name">
      <div class="item__icon" :class="iconColorClass">
        <div class="item__icon-inner">
          <Icon :name="iconName" :size="16" :stroke-width="1.6" />
        </div>
      </div>
      <div class="item__name-stack">
        <input
          ref="inputEl"
          v-model.trim="name"
          type="text"
          class="inline-new__input"
          :placeholder="placeholder"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="submit"
          @keydown.esc.prevent="cancel"
          @blur="onBlur"
        />
      </div>
    </div>

    <!-- Meta wrapper (display:contents in list mode → becomes grid cells).
         Leave empty so the columns stay aligned with the rest of the listing. -->
    <div class="item__meta">
      <div class="item__modified modified"></div>
      <div class="item__size size"></div>
    </div>

    <!-- Actions slot mirrors row layout; show inline hint instead -->
    <div class="item__actions">
      <span class="inline-new__hint"> <kbd>↵</kbd> create </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { files as api } from "@/api";
import url, { buildCreatePath } from "@/utils/url";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  /** "newDir" creates a folder, "newFile" creates an empty file. */
  kind: "newDir" | "newFile";
  /**
   * Dual-pane (pane B): create in THIS folder and refresh/dismiss via the given
   * callbacks instead of pane A's route + fileStore. Undefined for pane A, so
   * that path is byte-for-byte unchanged.
   */
  target?: {
    folderUrl: string;
    reload: () => void;
    close: () => void;
  } | null;
}>();

const $showError = inject<IToastError>("$showError")!;

const route = useRoute();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

const name = ref<string>("");
const inputEl = ref<HTMLInputElement | null>(null);
// Guard against double-submit when Enter and blur both fire in quick succession
let submitting = false;

const isDir = computed(() => props.kind === "newDir");
const placeholder = computed(() => (isDir.value ? "Folder name" : "File name"));

const iconName = computed(() =>
  fileIcon({ isDir: isDir.value, name: name.value || undefined })
);
const iconColorClass = computed(() =>
  fileIconColor({ isDir: isDir.value, name: name.value || undefined })
);

onMounted(async () => {
  await nextTick();
  inputEl.value?.focus();
});

const cancel = () => {
  if (props.target) props.target.close();
  else layoutStore.closeHovers();
};

// Blur often fires when the user clicks "Save" elsewhere on the page; only
// cancel if they didn't actually commit. The `submitting` flag covers the
// Enter→close path so we don't double-fire.
const onBlur = () => {
  if (submitting) return;
  // Delay one tick so a click on a sibling submit button can still register
  setTimeout(() => {
    if (!submitting) cancel();
  }, 120);
};

const submit = async () => {
  if (submitting) return;
  const trimmed = name.value.trim();
  if (trimmed === "") {
    cancel();
    return;
  }
  submitting = true;

  // Build the URI the same way the legacy NewDir.vue / NewFile.vue did, so we
  // don't change any backend contract. Pane B (target) creates in its own folder
  // via the shared `buildCreatePath`; pane A derives it from the route +
  // fileStore as before.
  let uri: string;
  if (props.target) {
    uri = buildCreatePath(props.target.folderUrl, trimmed, isDir.value);
  } else {
    let u = fileStore.isFiles ? route.path + "/" : "/";
    if (!fileStore.isListing) u = url.removeLastDir(u) + "/";
    u += encodeURIComponent(trimmed);
    if (isDir.value) u += "/";
    uri = u.replace("//", "/");
  }

  try {
    await api.post(uri);
    if (props.target) {
      // Pane B: refresh its own listing + dismiss the inline input.
      props.target.reload();
      props.target.close();
    } else {
      // Stay in the current listing for both folders and files — reload in
      // place so the new entry appears in the row list. The legacy NewFile
      // flow used to auto-navigate into the empty file's editor; we don't
      // do that anymore.
      const res = await api.fetch(url.removeLastDir(uri) + "/");
      fileStore.updateRequest(res);
      layoutStore.closeHovers();
    }
  } catch (e) {
    if (e instanceof Error) $showError(e);
    submitting = false;
    return;
  }
};
</script>

<style scoped>
.inline-new__input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  padding: 0;
  letter-spacing: -0.005em;
}

.inline-new__input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
  font-weight: 400;
}

.inline-new__hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  white-space: nowrap;
}

.inline-new__hint kbd {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  line-height: 1.3;
}
</style>
