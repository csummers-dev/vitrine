<template>
  <SlideOver
    :open="open"
    eyebrow="Edit tags"
    :title="headerTitle"
    @cancel="onCancel"
  >
    <div class="atag-body">
      <!-- Loading -->
      <div v-if="loading" class="atag-state">
        <Icon name="loader-circle" :size="18" class="atag-spin" />
        <span>Reading tags…</span>
      </div>

      <!-- Load error -->
      <div v-else-if="loadError" class="atag-state atag-state--error">
        <Icon name="triangle-alert" :size="18" />
        <span>{{ loadError }}</span>
      </div>

      <template v-else-if="targets.length > 0">
        <!-- Batch banner — apply-only-touched semantics across the selection -->
        <div v-if="isBatch" class="atag-batch-note">
          <Icon name="layers" :size="14" />
          <span>
            Editing {{ targets.length }} files — only fields you change are
            applied to all of them.
          </span>
        </div>

        <!-- Cover art -->
        <div class="atag-cover">
          <div class="atag-cover__frame">
            <img v-if="coverPreview" :src="coverPreview" alt="Cover art" />
            <div v-else class="atag-cover__empty">
              <Icon name="disc-3" :size="28" :stroke-width="1.5" />
              <span>{{ coverEmptyText }}</span>
            </div>
          </div>
          <div class="atag-cover__actions">
            <button type="button" class="atag-cover__btn" @click="pickCover">
              <Icon name="image-plus" :size="13" />
              <span>{{ coverPrimaryLabel }}</span>
            </button>
            <button
              v-if="showRemoveCover"
              type="button"
              class="atag-cover__btn atag-cover__btn--danger"
              @click="removeCover"
            >
              <Icon name="trash-2" :size="13" />
              <span>{{ isBatch ? "Remove from all" : "Remove" }}</span>
            </button>
            <input
              ref="coverInput"
              type="file"
              accept="image/*"
              class="atag-hidden-input"
              @change="onCoverPicked"
            />
          </div>
        </div>

        <!-- Fields -->
        <div class="atag-fields">
          <label class="atag-field">
            <span class="atag-field__label">Title</span>
            <input v-model="form.title" class="atag-input" type="text" />
          </label>
          <label class="atag-field">
            <span class="atag-field__label">Artist</span>
            <input v-model="form.artist" class="atag-input" type="text" />
          </label>
          <label class="atag-field">
            <span class="atag-field__label">Album</span>
            <input v-model="form.album" class="atag-input" type="text" />
          </label>
          <label class="atag-field">
            <span class="atag-field__label">Album artist</span>
            <input v-model="form.albumArtist" class="atag-input" type="text" />
          </label>

          <div class="atag-row">
            <label class="atag-field">
              <span class="atag-field__label">Year</span>
              <input
                v-model="form.year"
                class="atag-input"
                type="text"
                inputmode="numeric"
              />
            </label>
            <label class="atag-field">
              <span class="atag-field__label">Track</span>
              <div class="atag-numtotal">
                <input
                  v-model="form.track"
                  class="atag-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Track number"
                />
                <span class="atag-numtotal__sep">/</span>
                <input
                  v-model="form.trackTotal"
                  class="atag-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Total tracks"
                />
              </div>
            </label>
            <label class="atag-field">
              <span class="atag-field__label">Disc</span>
              <div class="atag-numtotal">
                <input
                  v-model="form.disc"
                  class="atag-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Disc number"
                />
                <span class="atag-numtotal__sep">/</span>
                <input
                  v-model="form.discTotal"
                  class="atag-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Total discs"
                />
              </div>
            </label>
          </div>

          <label class="atag-field">
            <span class="atag-field__label">Genre</span>
            <input
              v-model="form.genres"
              class="atag-input"
              type="text"
              placeholder="Separate multiple with ; "
            />
          </label>
          <label class="atag-field">
            <span class="atag-field__label">Composer</span>
            <input v-model="form.composer" class="atag-input" type="text" />
          </label>
          <label class="atag-field">
            <span class="atag-field__label">Comment</span>
            <textarea
              v-model="form.comment"
              class="atag-input atag-textarea"
              rows="2"
            ></textarea>
          </label>
        </div>
      </template>
    </div>

    <template #footer>
      <button type="button" class="atag-btn atag-btn--ghost" @click="onCancel">
        Cancel
      </button>
      <button
        type="button"
        class="atag-btn atag-btn--primary"
        :disabled="!canSave"
        @click="onSave"
      >
        <Icon v-if="saving" name="loader-circle" :size="13" class="atag-spin" />
        <span>{{ saving ? "Saving…" : "Save" }}</span>
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useToast } from "vue-toastification";
import { useFileStore } from "@/stores/file";
import { audiotags as audioTagsApi, files as filesApi } from "@/api";
import type { AudioTagSet, ArtworkAction } from "@/api/audiotags";
import { isAudioTaggable } from "@/utils/audio";
import SlideOver from "@/components/SlideOver.vue";
import Icon from "@/components/Icon.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "cancel"): void; (e: "done"): void }>();

const fileStore = useFileStore();
const toast = useToast();

type Target = { path: string; name: string; modified: string };
// The audio files being edited. One entry → single-file mode (loads existing
// tags + cover). More than one → batch mode (fields start blank; only the
// fields the user touches are applied across every file).
const targets = ref<Target[]>([]);
const isBatch = computed(() => targets.value.length > 1);
const headerTitle = computed(() =>
  isBatch.value
    ? `${targets.value.length} audio files`
    : (targets.value[0]?.name ?? "Edit tags")
);

const loading = ref(false);
const saving = ref(false);
const loadError = ref("");

// Editable text fields (genres is edited as one "; "-joined string).
const blankForm = () => ({
  title: "",
  artist: "",
  album: "",
  albumArtist: "",
  year: "",
  track: "",
  trackTotal: "",
  disc: "",
  discTotal: "",
  genres: "",
  composer: "",
  comment: "",
});
const form = reactive(blankForm());
// The values as loaded, for change detection (only changed fields are sent).
let loaded = blankForm();

// Cover-art state. `coverPreview` is what's shown; it's the existing embedded
// art (thumbnail endpoint) until the user replaces or removes it.
const coverPreview = ref<string>("");
const coverInput = ref<HTMLInputElement | null>(null);
const artworkAction = ref<ArtworkAction>("keep");
const artworkFile = ref<File | null>(null);
let objectURL = "";

/** Resolve the audio file(s) to edit:
 *  - preview view → the currently-previewed file (req is the file itself)
 *  - listing view → every selected taggable audio file (non-audio items in a
 *    mixed multi-selection are silently skipped). One match → single mode;
 *    several → batch mode. */
function resolveTargets(): Target[] {
  const req = fileStore.req;
  if (!req) return [];
  if (!req.isDir) {
    if (!req.path || !isAudioTaggable(req.name)) return [];
    return [{ path: req.path, name: req.name, modified: req.modified }];
  }
  const out: Target[] = [];
  for (const idx of fileStore.selected) {
    const item = req.items[idx];
    if (item && item.path && isAudioTaggable(item.name)) {
      out.push({ path: item.path, name: item.name, modified: item.modified });
    }
  }
  return out;
}

// ── Cover-art presentation (differs single vs batch) ───────────────────────
const coverPrimaryLabel = computed(() => {
  if (coverPreview.value) return "Replace";
  return isBatch.value ? "Set cover" : "Add";
});
const coverEmptyText = computed(() => {
  if (artworkAction.value === "remove") return "Will remove from all";
  return isBatch.value ? "Optional — applies to all" : "No cover art";
});
// In batch mode the Remove button stays available (to clear art on every file)
// until "remove" is already chosen; single mode only offers it when art exists.
const showRemoveCover = computed(() =>
  isBatch.value ? artworkAction.value !== "remove" : !!coverPreview.value
);

function revokeObjectURL() {
  if (objectURL) {
    URL.revokeObjectURL(objectURL);
    objectURL = "";
  }
}

async function load(target: Target) {
  loading.value = true;
  loadError.value = "";
  try {
    const results = await audioTagsApi.read([target.path]);
    const r = results[0];
    if (!r || r.error || !r.tags) {
      loadError.value = r?.error || "Couldn't read this file's tags.";
      return;
    }
    const t = r.tags;
    Object.assign(form, {
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumArtist: t.albumArtist,
      year: t.year,
      track: t.track,
      trackTotal: t.trackTotal,
      disc: t.disc,
      discTotal: t.discTotal,
      genres: (t.genres ?? []).join("; "),
      composer: t.composer,
      comment: t.comment,
    });
    loaded = { ...form };
    // Show the embedded cover via the thumbnail endpoint (cache-keyed on
    // modified time), if the file has one.
    coverPreview.value = t.hasPicture
      ? filesApi.getPreviewURL(
          { path: target.path, modified: target.modified } as Resource,
          "thumb"
        )
      : "";
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Failed to read tags.";
  } finally {
    loading.value = false;
  }
}

// Reset + load whenever the panel opens.
watch(
  () => props.open,
  (open) => {
    revokeObjectURL();
    artworkAction.value = "keep";
    artworkFile.value = null;
    Object.assign(form, blankForm());
    loaded = blankForm();
    loadError.value = "";
    coverPreview.value = "";
    if (!open) {
      targets.value = [];
      return;
    }
    const found = resolveTargets();
    targets.value = found;
    if (found.length === 0) {
      loadError.value = "Select one or more MP3 or FLAC files to edit.";
      return;
    }
    // Single file → load its existing tags + cover so they're pre-filled.
    // Batch (>1) → leave everything blank; only touched fields get applied.
    if (found.length === 1) void load(found[0]);
  }
);

// ── Cover actions ─────────────────────────────────────────────────────────
const pickCover = () => coverInput.value?.click();

const onCoverPicked = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-picking the same file
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast.error("Cover art must be an image.");
    return;
  }
  revokeObjectURL();
  objectURL = URL.createObjectURL(file);
  coverPreview.value = objectURL;
  artworkFile.value = file;
  artworkAction.value = "replace";
};

const removeCover = () => {
  revokeObjectURL();
  coverPreview.value = "";
  artworkFile.value = null;
  artworkAction.value = "remove";
};

// ── Dirty tracking + save ──────────────────────────────────────────────────
const TEXT_KEYS = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "year",
  "track",
  "trackTotal",
  "disc",
  "discTotal",
  "genres",
  "composer",
  "comment",
] as const;

const dirty = computed(() => {
  if (artworkAction.value !== "keep") return true;
  return TEXT_KEYS.some((k) => form[k] !== loaded[k]);
});

const canSave = computed(
  () =>
    targets.value.length > 0 && !loading.value && !saving.value && dirty.value
);

function buildSet(): AudioTagSet {
  const set: AudioTagSet = {};
  for (const k of TEXT_KEYS) {
    if (form[k] === loaded[k]) continue;
    if (k === "genres") {
      set.genres = form.genres
        .split(/[;,]/)
        .map((g) => g.trim())
        .filter(Boolean);
    } else {
      set[k] = form[k];
    }
  }
  return set;
}

const onCancel = () => emit("cancel");

const onSave = async () => {
  if (!canSave.value || targets.value.length === 0) return;
  saving.value = true;
  try {
    const paths = targets.value.map((t) => t.path);
    const results = await audioTagsApi.write(
      paths,
      buildSet(),
      artworkAction.value,
      artworkFile.value ?? undefined
    );
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    if (ok === 0) {
      // Surface the first error message; all files failed.
      toast.error(results.find((r) => r.error)?.error || "Couldn't save tags.");
      return;
    }
    if (failed > 0) {
      toast.warning(
        `Updated ${ok} of ${results.length} files — ${failed} couldn't be saved.`
      );
    } else {
      toast.success(
        isBatch.value ? `Tags applied to ${ok} files` : "Tags saved"
      );
    }
    // Re-fetch so the listing / preview + cover thumbnails reflect the change
    // (thumb URLs are keyed on each file's modified time, which just bumped).
    fileStore.reload = true;
    emit("done");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to save tags.");
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.atag-body {
  position: relative;
  min-height: 200px;
}

.atag-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 40px 8px;
  justify-content: center;
  color: var(--color-ink-2, #52525b);
  font-size: 13px;
}
.atag-state--error {
  color: var(--c-rose);
}

.atag-spin {
  animation: atag-spin 0.9s linear infinite;
}
@keyframes atag-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Batch banner ────────────────────────────────────────────────────── */
.atag-batch-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(
    --tint-lilac,
    color-mix(in srgb, var(--c-lilac) 10%, transparent)
  );
  color: var(--color-ink-2, #52525b);
  font-size: 12.5px;
  line-height: 1.4;
}
.atag-batch-note svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--c-lilac);
}

/* ── Cover art ───────────────────────────────────────────────────────── */
.atag-cover {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.atag-cover__frame {
  width: 104px;
  height: 104px;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  display: flex;
  align-items: center;
  justify-content: center;
}
.atag-cover__frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.atag-cover__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 10.5px;
}

.atag-cover__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-self: center;
}
.atag-cover__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  border: 1px solid var(--color-line, #ececec);
  background: var(--color-surface, #fff);
  color: var(--color-ink-2, #52525b);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.atag-cover__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.atag-cover__btn--danger {
  color: var(--c-rose);
}
.atag-cover__btn--danger:hover {
  background: color-mix(in srgb, var(--c-rose) 12%, transparent);
  color: var(--c-rose);
}
.atag-hidden-input {
  display: none;
}

/* ── Fields ──────────────────────────────────────────────────────────── */
.atag-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.atag-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.atag-field__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink-3, #a1a1aa);
}

.atag-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.atag-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--color-line-strong, #d4d4d8);
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  font: inherit;
  font-size: 13px;
  transition:
    border-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}
.atag-input:focus {
  outline: none;
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.25));
}
.atag-textarea {
  height: auto;
  padding: 8px 10px;
  line-height: 1.4;
  resize: vertical;
}

.atag-numtotal {
  display: flex;
  align-items: center;
  gap: 6px;
}
.atag-numtotal__sep {
  color: var(--color-ink-3, #a1a1aa);
}

/* ── Footer buttons (mirror ExtractPanel) ────────────────────────────── */
.atag-btn {
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
.atag-btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  margin-right: auto;
}
.atag-btn--ghost:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.atag-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}
.atag-btn--primary:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
}
.atag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
