<template>
  <div class="sub-upload">
    <div class="preview-info__label">Add subtitle</div>

    <!-- Drop zone / picker -->
    <div
      class="sub-upload__zone"
      :class="{ 'is-over': dragOver }"
      role="button"
      tabindex="0"
      @click="picker?.click()"
      @keydown.enter.prevent="picker?.click()"
      @keydown.space.prevent="picker?.click()"
      @dragover.prevent="dragOver = true"
      @dragenter.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <Icon
        :name="picked ? 'file-check-2' : 'upload'"
        :size="16"
        :stroke-width="1.7"
      />
      <span class="sub-upload__zone-text">
        <template v-if="picked">{{ picked.name }}</template>
        <template v-else>Drop a .srt / .vtt file or click to choose</template>
      </span>
    </div>
    <input
      ref="picker"
      type="file"
      class="sub-upload__input"
      accept=".srt,.vtt,.ass,.ssa"
      @change="onPick"
    />

    <!-- Language + save -->
    <div v-if="picked" class="sub-upload__row">
      <label class="sub-upload__lang">
        <span>Language</span>
        <input
          v-model.trim="lang"
          type="text"
          class="sub-upload__lang-input"
          placeholder="en"
          maxlength="8"
          autocomplete="off"
          spellcheck="false"
          :disabled="busy"
        />
      </label>
      <button
        type="button"
        class="sub-upload__btn"
        :disabled="busy"
        @click="upload"
      >
        <Icon
          v-if="busy"
          name="loader-circle"
          :size="13"
          class="sub-upload__spin"
        />
        <span>{{ busy ? "Uploading…" : "Save" }}</span>
      </button>
    </div>

    <p v-if="picked" class="sub-upload__hint">
      Saves as
      <code>{{ destName }}</code>
    </p>
    <p v-if="error" class="sub-upload__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Subtitle upload (v1.3 S5-7). A drop zone + picker in the video
 * info-rail. Writes the chosen subtitle next to the video via the
 * existing upload API, named to match the video's base so the
 * backend's auto-detection picks it up as a track (with an optional
 * language suffix driving the label). No dedicated backend endpoint —
 * the upload + detect + serve pipeline already exists.
 */
import { computed, ref } from "vue";
import Icon from "@/components/Icon.vue";
import { files as api } from "@/api";

const props = defineProps<{
  /** The video filename, e.g. "movie.mp4". */
  videoName: string;
  /** Parent directory route path where the subtitle is written, e.g.
   *  "/files/Movies/". */
  dir: string;
}>();

const emit = defineEmits<{
  /** Fires after a successful upload with the saved subtitle filename. */
  (e: "uploaded", name: string): void;
}>();

const picker = ref<HTMLInputElement | null>(null);
const picked = ref<File | null>(null);
const lang = ref<string>("");
const busy = ref<boolean>(false);
const error = ref<string>("");
const dragOver = ref<boolean>(false);

const ACCEPTED = [".srt", ".vtt", ".ass", ".ssa"];

const accept = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return ACCEPTED.some((ext) => name.endsWith(ext));
};

const setFile = (file: File | null) => {
  error.value = "";
  if (!file) {
    picked.value = null;
    return;
  }
  if (!accept(file)) {
    error.value = "Unsupported subtitle format.";
    picked.value = null;
    return;
  }
  picked.value = file;
};

const onPick = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  setFile(f);
};

const onDrop = (e: DragEvent) => {
  dragOver.value = false;
  const f = e.dataTransfer?.files?.[0] ?? null;
  setFile(f);
};

/** Base name of the video (no extension). */
const videoBase = computed(() => {
  const dot = props.videoName.lastIndexOf(".");
  return dot > 0 ? props.videoName.slice(0, dot) : props.videoName;
});

/** Extension of the picked subtitle (lowercased, with dot). */
const subExt = computed(() => {
  if (!picked.value) return "";
  const dot = picked.value.name.lastIndexOf(".");
  return dot >= 0 ? picked.value.name.slice(dot).toLowerCase() : "";
});

/** Destination filename: <base>[.<lang>].<ext>. Base-name match is
 *  what makes the backend detect it as a track for this video. */
const destName = computed(() => {
  const langPart = lang.value ? `.${lang.value}` : "";
  return `${videoBase.value}${langPart}${subExt.value}`;
});

const upload = async () => {
  if (!picked.value || busy.value) return;
  error.value = "";
  busy.value = true;
  try {
    const destPath =
      (props.dir.endsWith("/") ? props.dir : props.dir + "/") +
      encodeURIComponent(destName.value);
    // overwrite=true: re-uploading the same language replaces that
    // track — the intuitive "update this subtitle" behavior.
    await api.post(destPath, picked.value, true);
    const saved = destName.value;
    picked.value = null;
    lang.value = "";
    if (picker.value) picker.value.value = "";
    emit("uploaded", saved);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Upload failed.";
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.sub-upload {
  margin-top: 16px;
}

.sub-upload__zone {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1.5px dashed var(--color-line-strong, #d4d4d8);
  border-radius: 8px;
  background: var(--color-canvas, #fafaf9);
  color: var(--color-ink-3, #a1a1aa);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--dur-base) ease,
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.sub-upload__zone:hover,
.sub-upload__zone:focus-visible {
  border-color: var(--color-accent, #6e72d9);
  color: var(--color-ink-2, #52525b);
  outline: none;
}
.sub-upload__zone.is-over {
  border-color: var(--color-accent, #6e72d9);
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
  color: var(--color-accent, #6e72d9);
}
.sub-upload__zone-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub-upload__input {
  display: none;
}

.sub-upload__row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.sub-upload__lang {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.sub-upload__lang > span {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}
.sub-upload__lang-input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font-size: 12.5px;
  font-family: var(--font-mono, monospace);
  outline: none;
  transition:
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.sub-upload__lang-input:focus {
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.3));
}

.sub-upload__btn {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: var(--accent-gradient);
  color: white;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  transition: background-color var(--dur-base) ease;
}
.sub-upload__btn:hover:not(:disabled) {
  background: var(--color-accent-strong, #575cc7);
}
.sub-upload__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sub-upload__hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
}
.sub-upload__hint code {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
  word-break: break-all;
}
.sub-upload__error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--status-danger);
}
html.dark .sub-upload__error {
  color: var(--status-danger);
}

.sub-upload__spin {
  animation: sub-upload-spin 0.9s linear infinite;
}
@keyframes sub-upload-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sub-upload__spin {
    animation: none;
  }
}
</style>
