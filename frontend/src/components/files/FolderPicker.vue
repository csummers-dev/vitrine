<template>
  <div class="folder-picker">
    <!-- Breadcrumb path showing where you currently are -->
    <div class="folder-picker__breadcrumb">
      <button
        type="button"
        class="folder-picker__crumb"
        :class="{ 'is-current': segments.length === 0 }"
        @click="navigate('/files/')"
      >
        <Icon name="house" :size="13" class="text-[var(--color-accent)]" />
        <span>Home</span>
      </button>
      <template v-for="(seg, i) in segments" :key="i">
        <Icon
          name="chevron-right"
          :size="11"
          class="folder-picker__crumb-sep"
        />
        <button
          type="button"
          class="folder-picker__crumb"
          :class="{ 'is-current': i === segments.length - 1 }"
          @click="navigate(seg.url)"
        >
          {{ seg.name }}
        </button>
      </template>
    </div>

    <!-- Inline "new folder" input. Creates the folder in the CURRENT picker
         path, then drops into it so it becomes the chosen destination. Shown
         above the list so it's visible even when the folder has no subfolders. -->
    <div v-if="creating" class="folder-picker__create">
      <span
        class="folder-picker__icon bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      >
        <Icon
          name="folder"
          :size="14"
          :stroke-width="1.4"
          style="fill: currentColor"
        />
      </span>
      <input
        ref="createInputEl"
        v-model.trim="newName"
        type="text"
        class="folder-picker__create-input"
        placeholder="New folder name"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="commitCreate"
        @keydown.esc.prevent="cancelCreate"
        @blur="onCreateBlur"
      />
      <kbd class="folder-picker__create-kbd">↵</kbd>
    </div>

    <!-- Loading / error / empty / items -->
    <div v-if="loading" class="folder-picker__state">
      <Icon name="loader-circle" :size="14" class="folder-picker__spin" />
      <span>Loading…</span>
    </div>

    <div
      v-else-if="folders.length === 0"
      class="folder-picker__state folder-picker__state--empty"
    >
      <Icon name="folder-open" :size="18" :stroke-width="1.4" />
      <span>No subfolders here</span>
      <span class="folder-picker__state-hint">
        You can still pick this folder using the action below.
      </span>
    </div>

    <ul v-else class="folder-picker__list">
      <li v-for="folder in folders" :key="folder.url">
        <button
          type="button"
          class="folder-picker__row"
          @click="navigate(folder.url)"
        >
          <span
            class="folder-picker__icon bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          >
            <Icon
              name="folder"
              :size="14"
              :stroke-width="1.4"
              style="fill: currentColor"
            />
          </span>
          <span class="folder-picker__name">{{ folder.name }}</span>
          <Icon
            name="chevron-right"
            :size="12"
            class="folder-picker__chevron"
          />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import { files as api } from "@/api";
import { StatusError } from "@/api/utils";
import url from "@/utils/url";
import Icon from "@/components/Icon.vue";

const $showError = inject<IToastError>("$showError");

interface Folder {
  name: string;
  url: string;
}

const props = defineProps<{
  /** Initial path to open the picker at (a /files/... URL). */
  initialPath: string;
  /** URLs to filter out of the listing (e.g. the items being moved). */
  exclude?: string[];
}>();

const emit = defineEmits<{
  /** Fires whenever the user navigates to a different folder. */
  (e: "update:path", path: string): void;
}>();

const currentPath = ref<string>(props.initialPath);
const folders = ref<Folder[]>([]);
const loading = ref<boolean>(false);
let abortCtrl: AbortController | null = null;

// Inline "new folder" creation (triggered by the host panel's New-folder
// button via the exposed `startCreate`). `creating` toggles the input row;
// the guard prevents an Enter→blur double-submit.
const creating = ref<boolean>(false);
const newName = ref<string>("");
const createInputEl = ref<HTMLInputElement | null>(null);
let createSubmitting = false;

const segments = computed<Folder[]>(() => {
  const stripped = currentPath.value.replace(/^\/files\/?/, "");
  if (stripped === "") return [];
  const parts = stripped.split("/").filter(Boolean);
  let acc = "/files/";
  return parts.map((name) => {
    acc += name + "/";
    return { name: decodeURIComponent(name), url: acc };
  });
});

const navigate = async (path: string) => {
  if (abortCtrl) abortCtrl.abort();
  abortCtrl = new AbortController();
  loading.value = true;
  try {
    const req = await api.fetch(path, abortCtrl.signal);
    currentPath.value = req.url;
    folders.value = (req.items ?? [])
      .filter((i: any) => i.isDir)
      .filter((i: any) => !props.exclude?.includes(i.url))
      .map((i: any) => ({ name: i.name, url: i.url }));
    emit("update:path", currentPath.value);
  } catch (e) {
    if (e instanceof StatusError && e.is_canceled) return;
    folders.value = [];
  } finally {
    loading.value = false;
  }
};

const cancelCreate = () => {
  creating.value = false;
  newName.value = "";
};

// Blur tears the input down — but defer a tick so a click on a sibling button
// (e.g. the host's Cancel) can register first, and skip if a submit is in
// flight (Enter→blur fire together).
const onCreateBlur = () => {
  if (createSubmitting) return;
  setTimeout(() => {
    if (!createSubmitting) cancelCreate();
  }, 120);
};

const commitCreate = async () => {
  if (createSubmitting) return;
  const trimmed = newName.value.trim();
  if (trimmed === "") {
    cancelCreate();
    return;
  }
  createSubmitting = true;
  // currentPath is a `/files/...` URL ending in "/"; api.post strips the
  // `/files` prefix internally, so this targets the picker's CURRENT folder —
  // not the listing behind the panel.
  const uri = currentPath.value + encodeURIComponent(trimmed) + "/";
  try {
    await api.post(uri);
  } catch (e) {
    // Most likely a name collision — surface it and keep the input open so the
    // user can pick another name.
    if (e instanceof Error) $showError?.(e);
    createSubmitting = false;
    return;
  }
  creating.value = false;
  newName.value = "";
  // Drop into the freshly-made folder so it becomes the chosen destination
  // (navigating in is what makes `update:path` point at the new folder).
  await navigate(uri);
};

onMounted(() => {
  void navigate(props.initialPath);
});

// Allow callers to push a new initialPath after mount (e.g. after creating a
// folder inside the picker) — keep the picker in sync.
watch(
  () => props.initialPath,
  (next) => {
    if (next && next !== currentPath.value) void navigate(next);
  }
);

defineExpose({
  /** Open the inline "new folder" input, focused. The host panel's
   *  New-folder button calls this; creation happens entirely in the picker. */
  async startCreate() {
    creating.value = true;
    newName.value = "";
    createSubmitting = false;
    await nextTick();
    createInputEl.value?.focus();
  },
  refresh() {
    void navigate(currentPath.value);
  },
  /** Walk up one level. No-op at root. */
  goUp() {
    if (currentPath.value === "/files/" || currentPath.value === "/files")
      return;
    void navigate(url.removeLastDir(currentPath.value) + "/");
  },
  currentPath,
});
</script>

<style scoped>
.folder-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.folder-picker__breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  font-size: 12px;
  color: var(--color-ink-2, #52525b);
  padding: 6px 8px;
  background: var(--color-canvas, #fafaf9);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
}

.folder-picker__crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  background: transparent;
  border: 0;
  font: inherit;
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  white-space: nowrap;
}

.folder-picker__crumb:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
  color: var(--color-ink-1, #18181b);
}

.folder-picker__crumb.is-current {
  color: var(--color-ink-1, #18181b);
  font-weight: 600;
  cursor: default;
}

.folder-picker__crumb-sep {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.folder-picker__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.folder-picker__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  background: transparent;
  border: 0;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.08s ease;
}

.folder-picker__row:hover {
  background: var(--color-elevated, #f4f4f5);
}

/* Inline "new folder" input row — accent ring so it reads as an active field. */
.folder-picker__create {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--color-accent, #6e72d9);
  background: var(--color-surface, #fff);
}

.folder-picker__create-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  padding: 0;
}

.folder-picker__create-input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
  font-weight: 400;
}

.folder-picker__create-kbd {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.folder-picker__icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  /* Color comes from the bg-amber-50 / text-amber-500 utilities on the
     element (RC-22) so the global dark-icon-colors.css remap applies and
     this matches the listing's folder icons in both themes — the
     hardcoded amber hex here stayed bright in dark mode. */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.folder-picker__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-picker__chevron {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

/* States */
.folder-picker__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 12.5px;
  text-align: center;
}

.folder-picker__state--empty {
  border: 1px dashed var(--color-line, #ececec);
  border-radius: 10px;
  background: var(--color-canvas, #fafaf9);
}

.folder-picker__state-hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  max-width: 240px;
}

.folder-picker__spin {
  animation: folder-picker-spin 0.9s linear infinite;
}

@keyframes folder-picker-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
