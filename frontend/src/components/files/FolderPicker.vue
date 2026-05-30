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
        <Icon name="house" :size="13" />
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
          <span class="folder-picker__icon">
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
import { computed, onMounted, ref, watch } from "vue";
import { files as api } from "@/api";
import { StatusError } from "@/api/utils";
import url from "@/utils/url";
import Icon from "@/components/Icon.vue";

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

/** Public method (used via template ref) to add a freshly-created folder to
 * the current view without a full re-fetch. */
defineExpose({
  appendFolder(folder: Folder) {
    folders.value = [...folders.value, folder];
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

.folder-picker__icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #fef3c7; /* amber-50 */
  color: #f59e0b; /* amber-500 */
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
