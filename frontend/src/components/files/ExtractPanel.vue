<template>
  <SlideOver
    :open="open"
    eyebrow="Extract zip"
    :title="title"
    :close-on-scrim-click="!loading"
    @cancel="onCancel"
  >
    <!-- Positioning context for the loading overlay (covers everything
         inside the body slot but not the SlideOver header / footer, so
         the disabled-state Close X and Cancel button stay reachable for
         screen-reader exploration even while extraction blocks input). -->
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
          <Toggle v-model="newSubfolder" :disabled="loading" />
          <span class="extract-option__text">
            <span class="extract-option__label">Extract into new folder</span>
            <span class="extract-option__hint">
              <code v-if="newSubfolder && subfolderName">{{
                subfolderName
              }}</code>
              <span v-else>Files extract into the current location.</span>
            </span>
          </span>
        </label>
        <label
          class="extract-option"
          :class="{ 'is-disabled': newSubfolder }"
          :title="
            newSubfolder ? 'Not applicable — extracting into a new folder' : ''
          "
        >
          <Toggle v-model="overwrite" :disabled="newSubfolder || loading" />
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
          <Toggle v-model="deleteOriginal" :disabled="loading" />
          <span class="extract-option__text">
            <span class="extract-option__label"
              >Delete original after extraction</span
            >
            <span class="extract-option__hint">
              The .zip is removed only if extraction succeeds.
            </span>
          </span>
        </label>
      </div>

      <p class="extract-hint">
        <Icon name="info" :size="11" />
        <span
          >Large archives may take a few minutes. Don't close this tab.</span
        >
      </p>

      <!-- Error banner — keeps panel open so the user can retry / cancel. -->
      <Transition name="extract-error">
        <div v-if="errorMessage" class="extract-error" role="alert">
          <Icon name="triangle-alert" :size="13" />
          <span>{{ errorMessage }}</span>
        </div>
      </Transition>

      <!-- Loading overlay — covers the body during extraction. Footer
         buttons are disabled separately; this just blocks accidental
         input on the picker while the server works. -->
      <Transition name="extract-loading">
        <div
          v-if="loading"
          class="extract-loading"
          aria-busy="true"
          aria-live="polite"
        >
          <Icon name="loader-circle" :size="22" class="extract-spin" />
          <div class="extract-loading__text">Extracting…</div>
          <div class="extract-loading__sub">{{ snapshot?.name ?? "" }}</div>
        </div>
      </Transition>
    </div>

    <template #footer>
      <button
        type="button"
        class="extract-btn extract-btn--ghost"
        :disabled="loading"
        :title="loading ? 'Extraction can’t be cancelled mid-flight' : ''"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="extract-btn extract-btn--primary"
        :disabled="!canSubmit || loading"
        @click="onSubmit"
      >
        <Icon
          v-if="loading"
          name="loader-circle"
          :size="13"
          class="extract-spin"
        />
        <span>{{ loading ? "Extracting…" : "Extract" }}</span>
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { files as api } from "@/api";
import { filesize } from "@/utils";
import { mapUnzipError, deriveSubfolderName } from "@/utils/unzipErrors";
import { useToast } from "vue-toastification";
import SlideOver from "@/components/SlideOver.vue";
import FolderPicker from "@/components/files/FolderPicker.vue";
import Toggle from "@/components/settings/Toggle.vue";
import Icon from "@/components/Icon.vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "done"): void;
}>();

const $showError = inject<IToastError>("$showError")!;

const route = useRoute();
const router = useRouter();
const fileStore = useFileStore();
const toast = useToast();

const pickerRef = ref<InstanceType<typeof FolderPicker> | null>(null);
const destPath = ref<string>("");
const newSubfolder = ref<boolean>(true);
const overwrite = ref<boolean>(false);
// F7: Off by default. When on, the source .zip is removed AFTER a
// successful extraction. Failed extractions never trigger the delete
// so the user can retry with the archive still in place.
const deleteOriginal = ref<boolean>(false);
const loading = ref<boolean>(false);
const errorMessage = ref<string>("");

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

const initialPath = computed(() =>
  fileStore.isFiles ? route.path.replace(/\/?$/, "/") : "/files/"
);

const subfolderName = computed(() =>
  snapshot.value ? deriveSubfolderName(snapshot.value.name) : ""
);

/**
 * Final destination path the backend receives. When the "new subfolder"
 * toggle is on, we append the derived folder name to whatever the user
 * picked in the picker.
 */
const finalDest = computed(() => {
  if (!destPath.value) return "";
  const base = destPath.value.replace(/\/?$/, "/");
  if (newSubfolder.value && subfolderName.value) {
    return base + encodeURIComponent(subfolderName.value);
  }
  return base;
});

const title = computed(() => snapshot.value?.name ?? "Extract zip");

const canSubmit = computed(() => {
  if (!snapshot.value) return false;
  if (!destPath.value) return false;
  if (newSubfolder.value && !subfolderName.value) return false;
  return true;
});

const onPathChange = (p: string) => {
  destPath.value = p;
  errorMessage.value = "";
};

const onCancel = () => {
  if (loading.value) return;
  emit("cancel");
};

/**
 * Block accidental page-unload while an extraction is in flight. Backend
 * has no abort; closing the tab would leave a partial state with no way
 * to know how far it got. Standard browser confirm dialog.
 */
const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!loading.value) return;
  event.preventDefault();
  // Required for the prompt to appear in some browsers (Chrome <= 119).
  event.returnValue = "";
};

const onSubmit = async () => {
  if (!canSubmit.value || !snapshot.value) return;
  errorMessage.value = "";
  loading.value = true;
  window.addEventListener("beforeunload", onBeforeUnload);

  const dest = finalDest.value;
  const sourceUrl = snapshot.value.url;
  try {
    await api.unzip(sourceUrl, dest, overwrite.value);

    // F7: Delete the source archive only on extract success. A failed
    // remove is surfaced as a toast but doesn't block the navigation —
    // the extraction itself worked, the user just has a stray .zip.
    if (deleteOriginal.value) {
      try {
        await api.remove(sourceUrl);
      } catch (delErr) {
        toast.warning(
          `Extracted, but couldn't delete the original .zip: ${
            delErr instanceof Error ? delErr.message : "unknown error"
          }`
        );
      }
    }

    // Success — close panel, toast, navigate.
    toast.success(`Extracted to ${decodeURIComponent(dest)}`);
    emit("done");
    // Land the user inside the destination so they see the new contents
    // animate in via the FileListing TransitionGroup.
    router.push({ path: dest.replace(/\/?$/, "/") });
  } catch (err) {
    errorMessage.value = mapUnzipError(err);
    // Also surface as a toast for users who closed the panel before
    // the response arrived (shouldn't happen since Cancel is disabled
    // during loading, but defensive — and the toast is the only signal
    // if the panel is auto-closing on success).
    if (err instanceof Error) $showError(err);
  } finally {
    loading.value = false;
    window.removeEventListener("beforeunload", onBeforeUnload);
  }
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
    errorMessage.value = "";
    overwrite.value = false;
    deleteOriginal.value = false;
    newSubfolder.value = true;
    destPath.value = initialPath.value;

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
  }
);

onUnmounted(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<style scoped>
/* Positioning context for the loading overlay. min-height pads the
   panel during loading so the spinner doesn't collapse on top of the
   FolderPicker's own state. */
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
  background: var(--color-orange-soft, rgba(251, 146, 60, 0.16));
  color: var(--color-orange-strong, #c2410c);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

html.dark .extract-source__icon {
  background: rgba(251, 146, 60, 0.22);
  color: #fdba74;
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
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  color: var(--color-accent, #5e6ad2);
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

.extract-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  cursor: pointer;
  transition: background-color 0.12s ease;
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

/* ── Error banner ────────────────────────────────────────────────────── */
.extract-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  margin-top: 14px;
}

html.dark .extract-error {
  background: rgba(127, 29, 29, 0.18);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
}

.extract-error-enter-active,
.extract-error-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.extract-error-enter-from,
.extract-error-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Loading overlay ─────────────────────────────────────────────────── */
.extract-loading {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-surface, #fff) 90%, transparent);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 5;
  pointer-events: auto;
}

.extract-loading__text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-1, #18181b);
  margin-top: 2px;
}

.extract-loading__sub {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  max-width: 260px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extract-loading-enter-active,
.extract-loading-leave-active {
  transition: opacity 0.18s ease;
}
.extract-loading-enter-from,
.extract-loading-leave-to {
  opacity: 0;
}

.extract-spin {
  animation: extract-spin 0.9s linear infinite;
  color: var(--color-accent, #5e6ad2);
}

@keyframes extract-spin {
  to {
    transform: rotate(360deg);
  }
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
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
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
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.extract-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.extract-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
