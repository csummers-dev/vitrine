<template>
  <SlideOver :open="open" eyebrow="Extract" :title="title" @cancel="onCancel">
    <div class="extract-body">
      <!-- Source meta card — matches the file-type squircle treatment used
         throughout the listing / info pane for visual continuity. -->
      <div class="extract-source">
        <span class="extract-source__icon">
          <Icon name="package" :size="16" :stroke-width="1.6" />
        </span>
        <div class="extract-source__text">
          <div class="extract-source__name">{{ snapshot?.name ?? "" }}</div>
          <div class="extract-source__meta">
            {{ snapshot ? filesize(snapshot.size) : "" }}
          </div>
        </div>
      </div>

      <p class="extract-instructions">Choose where to extract.</p>

      <FolderPicker
        ref="pickerRef"
        :initial-path="initialPath"
        @update:path="onPathChange"
      />

      <!-- Options row. The subfolder toggle defaults ON so we don't litter
         the current directory with the archive's contents. When ON, the
         overwrite toggle is irrelevant (a fresh folder has no collisions)
         so we explicitly grey it out with a helper tooltip. -->
      <div class="extract-options">
        <label class="extract-option">
          <Toggle v-model="newSubfolder" />
          <span class="extract-option__text">
            <span class="extract-option__label">Extract into new folder</span>
            <span class="extract-option__hint">
              {{
                newSubfolder
                  ? "Contents extract into a new folder you name below."
                  : "Files extract into the current location."
              }}
            </span>
          </span>
        </label>
        <!-- WS9: editable destination folder name — shown only while the
             "new folder" toggle is on; seeded from the archive's name. -->
        <div v-if="newSubfolder" class="extract-folder-name">
          <label class="extract-folder-name__label" for="extract-folder-input">
            Folder name
          </label>
          <input
            id="extract-folder-input"
            v-model="folderName"
            type="text"
            class="extract-folder-name__input"
            placeholder="New folder name"
            spellcheck="false"
            autocomplete="off"
            @keydown.enter.prevent="canSubmit && onSubmit()"
          />
        </div>
        <label
          class="extract-option"
          :class="{ 'is-disabled': newSubfolder }"
          :title="
            newSubfolder ? 'Not applicable — extracting into a new folder' : ''
          "
        >
          <Toggle v-model="overwrite" :disabled="newSubfolder" />
          <span class="extract-option__text">
            <span class="extract-option__label"
              >Overwrite conflicting files</span
            >
            <span class="extract-option__hint">
              Existing files in the destination will be replaced.
            </span>
          </span>
        </label>

        <!-- F7: Optionally delete the source archive after a successful
             extraction. Skipped on failure (the source stays intact so
             the user can retry). Off by default — the conservative
             choice; users opt in explicitly. -->
        <label class="extract-option">
          <Toggle v-model="deleteOriginal" />
          <span class="extract-option__text">
            <span class="extract-option__label"
              >Delete original after extraction</span
            >
            <span class="extract-option__hint">
              The .zip is removed only if extraction succeeds.
            </span>
          </span>
        </label>

        <!-- RC-8: Optionally jump into the extracted folder when done.
             Off by default (stay where you are); the choice is remembered
             across sessions via user prefs. -->
        <label class="extract-option">
          <Toggle v-model="openFolder" />
          <span class="extract-option__text">
            <span class="extract-option__label">Open extracted folder</span>
            <span class="extract-option__hint">
              Navigate into the new folder once extraction finishes.
            </span>
          </span>
        </label>
      </div>

      <p class="extract-hint">
        <Icon name="info" :size="11" />
        <span
          >Extraction runs in the background — you can keep browsing while a
          large archive unpacks.</span
        >
      </p>
    </div>

    <template #footer>
      <button
        type="button"
        class="extract-btn extract-btn--ghost"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="extract-btn extract-btn--primary"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        <span>Extract</span>
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useFileStore } from "@/stores/file";
import { usePreferences } from "@/composables/usePreferences";
import { useExtractIndicator } from "@/composables/useExtractIndicator";
import { filesize } from "@/utils";
import { deriveSubfolderName } from "@/utils/unzipErrors";
import SlideOver from "@/components/SlideOver.vue";
import FolderPicker from "@/components/files/FolderPicker.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  open: boolean;
  /** Dual-pane: when the second pane opens Extract, it passes its own archive
   *  (+ default destination base) here instead of pane A's fileStore selection. */
  override?: { url: string; name: string; size?: number; base?: string };
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "done"): void;
}>();

const route = useRoute();
const fileStore = useFileStore();
const prefs = usePreferences();
const { runExtract } = useExtractIndicator();

const pickerRef = ref<InstanceType<typeof FolderPicker> | null>(null);
const destPath = ref<string>("");
const newSubfolder = ref<boolean>(true);
// WS9: the editable name for the "extract into new folder" destination. Seeded
// from the archive's derived name on open; the user can rename it. Only used
// (and only shown) while `newSubfolder` is on.
const folderName = ref<string>("");
const overwrite = ref<boolean>(false);
// F7: Off by default. When on, the source .zip is removed AFTER a
// successful extraction. Failed extractions never trigger the delete
// so the user can retry with the archive still in place.
const deleteOriginal = ref<boolean>(false);
// RC-8: Navigate into the extracted folder when done. Off by default and
// remembered across sessions in the prefs bag (unlike the per-open
// toggles above) — "keep persistent whenever updated".
const openFolder = ref<boolean>(false);

// Persist the toggle the moment it changes. The redundant write when the
// open-watch seeds it from prefs is harmless (optimistic + debounced).
watch(openFolder, (v) => {
  void prefs.set("extractOpenFolder", v);
});

/**
 * Snapshot of the source archive — captured on `open` so layout-store
 * changes after submission (selection clears, route changes) don't pull
 * data out from under the panel mid-extraction.
 */
const snapshot = ref<{
  url: string;
  name: string;
  size: number;
} | null>(null);

const initialPath = computed(() => {
  if (props.override?.base) return props.override.base.replace(/\/?$/, "/");
  return fileStore.isFiles ? route.path.replace(/\/?$/, "/") : "/files/";
});

/**
 * Final destination path the backend receives. When the "new subfolder"
 * toggle is on, we append the derived folder name to whatever the user
 * picked in the picker.
 */
const finalDest = computed(() => {
  if (!destPath.value) return "";
  const base = destPath.value.replace(/\/?$/, "/");
  if (newSubfolder.value) {
    const fname = folderName.value.trim();
    if (!fname) return "";
    return base + encodeURIComponent(fname);
  }
  return base;
});

// WS9: re-seed the folder name from the archive whenever the toggle turns on
// and the field is empty, so flipping it back on never lands on a blank name.
watch(newSubfolder, (on) => {
  if (on && !folderName.value.trim() && snapshot.value) {
    folderName.value = deriveSubfolderName(snapshot.value.name);
  }
});

const title = computed(() => snapshot.value?.name ?? "Extract");

const canSubmit = computed(() => {
  if (!snapshot.value) return false;
  if (!destPath.value) return false;
  // WS9: a new-folder extraction needs a non-empty folder name.
  if (newSubfolder.value && !folderName.value.trim()) return false;
  return true;
});

const onPathChange = (p: string) => {
  destPath.value = p;
};

const onCancel = () => {
  emit("cancel");
};

/**
 * Kick off the extraction and immediately close the panel — the work runs
 * in the background (useExtractIndicator) with a floating toast, so the
 * user can keep navigating while a large archive extracts (mirrors the
 * move/copy transfer indicator). Errors surface as a toast, not in-panel.
 */
const onSubmit = () => {
  if (!canSubmit.value || !snapshot.value) return;
  const params = {
    sourceUrl: snapshot.value.url,
    name: snapshot.value.name,
    dest: finalDest.value,
    overwrite: overwrite.value,
    deleteOriginal: deleteOriginal.value,
    openFolder: openFolder.value,
  };
  emit("done");
  void runExtract(params);
};

/**
 * Snapshot the selection on open. Same pattern as MoveCopyPanel — we
 * decouple the panel from live store state once it's mounted so animations
 * and async work can't see a half-cleared selection.
 */
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    overwrite.value = false;
    deleteOriginal.value = false;
    newSubfolder.value = true;
    // RC-8: restore the remembered "open extracted folder" choice.
    openFolder.value = prefs.get<boolean>("extractOpenFolder", false);
    destPath.value = initialPath.value;

    // Dual-pane: the second pane passes its archive directly via `override`.
    if (props.override) {
      snapshot.value = {
        url: props.override.url,
        name: props.override.name,
        size: props.override.size ?? 0,
      };
      folderName.value = deriveSubfolderName(props.override.name);
      return;
    }

    const req = fileStore.req;
    if (!req || fileStore.selected.length !== 1) {
      snapshot.value = null;
      return;
    }
    const item = req.items[fileStore.selected[0]];
    if (!item) {
      snapshot.value = null;
      return;
    }
    snapshot.value = {
      url: item.url,
      name: item.name,
      size: item.size,
    };
    // WS9: seed the editable new-folder name from the archive.
    folderName.value = deriveSubfolderName(item.name);
  }
);
</script>

<style scoped>
/* Body wrapper. A min-height keeps the panel from collapsing while the
   FolderPicker loads its first listing. */
.extract-body {
  position: relative;
  min-height: 240px;
}

/* ── Source meta card ────────────────────────────────────────────────── */
.extract-source {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  margin-bottom: 10px;
}

.extract-source__icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: var(--tint-archive-bg);
  color: var(--tint-archive-fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

html.dark .extract-source__icon {
  background: var(--tint-archive-bg);
  color: var(--tint-archive-fg);
}

.extract-source__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.extract-source__name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extract-source__meta {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
}

/* ── Instructions + hint ─────────────────────────────────────────────── */
.extract-instructions {
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
  margin: 0 0 12px;
  line-height: 1.45;
}

.extract-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
  color: var(--color-accent, #6e72d9);
  font-size: 11.5px;
  line-height: 1.4;
}

/* ── Options ─────────────────────────────────────────────────────────── */
.extract-options {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* WS9: editable destination folder name (only shown with "new folder" on).
   Indented under its toggle so the relationship reads at a glance. */
.extract-folder-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: -2px 0 2px 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}
.extract-folder-name__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-3, #a1a1aa);
}
.extract-folder-name__input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--color-line-strong, #d4d4d8);
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font: inherit;
  font-size: 13px;
  transition:
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.extract-folder-name__input:focus {
  outline: none;
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.25));
}

.extract-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  cursor: pointer;
  transition: background-color var(--dur-base) ease;
}

.extract-option:hover {
  background: var(--color-elevated, #f4f4f5);
}

.extract-option.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.extract-option.is-disabled:hover {
  background: var(--color-surface, #fff);
}

.extract-option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.extract-option__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
}

.extract-option__hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extract-option__hint code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

/* ── Footer buttons (mirror MoveCopyPanel chrome) ────────────────────── */
.extract-btn {
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

.extract-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

.extract-btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  margin-right: auto;
}

.extract-btn--ghost:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.extract-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #6e72d9);
  color: white;
}

.extract-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #575cc7);
}

.extract-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
