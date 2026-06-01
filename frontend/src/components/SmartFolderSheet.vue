<template>
  <SlideOver
    :open="open"
    :title="isEditing ? 'Edit smart folder' : 'New smart folder'"
    eyebrow="Smart folder"
    @cancel="onCancel"
  >
    <form class="sf-sheet" @submit.prevent="onSave">
      <label class="sf-sheet__field">
        <span class="sf-sheet__label">Name</span>
        <input
          ref="nameInputEl"
          v-model.trim="draft.name"
          type="text"
          class="sf-sheet__input"
          placeholder="e.g. Urgent work files"
          required
        />
      </label>

      <label class="sf-sheet__field">
        <span class="sf-sheet__label">Query</span>
        <input
          v-model="draft.query"
          type="text"
          class="sf-sheet__input sf-sheet__input--mono"
          placeholder="tag:work ext:pdf draft"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="sf-sheet__hint">
          Use <code>tag:name</code> for tags, <code>ext:pdf</code> for
          extensions. Plain text matches filenames.
        </span>
      </label>

      <div class="sf-sheet__field">
        <span class="sf-sheet__label">Color</span>
        <div class="sf-sheet__swatches">
          <button
            v-for="c in palette"
            :key="c"
            type="button"
            class="sf-sheet__swatch"
            :class="[
              `sf-sheet__swatch--${c}`,
              { 'sf-sheet__swatch--selected': draft.color === c },
            ]"
            :aria-label="`Color ${c}`"
            :title="c"
            @click="draft.color = c"
          />
        </div>
      </div>

      <!-- Live preview of how the saved folder will be presented in
           the sidebar. Tiny but it answers "what will this look like?"
           without forcing a save+navigate. -->
      <div class="sf-sheet__preview">
        <span class="sf-sheet__preview-label">Preview</span>
        <div class="sf-sheet__preview-row">
          <span
            class="sf-sheet__preview-dot"
            :class="`sf-sheet__swatch--${draft.color}`"
          />
          <span class="sf-sheet__preview-name">
            {{ draft.name || "Untitled" }}
          </span>
        </div>
      </div>
    </form>

    <template #footer>
      <button
        v-if="isEditing"
        type="button"
        class="sf-sheet__delete"
        @click="onDelete"
      >
        Delete
      </button>
      <div class="sf-sheet__footer-spacer" />
      <button type="button" class="sf-sheet__cancel" @click="onCancel">
        Cancel
      </button>
      <button
        type="button"
        class="sf-sheet__save"
        :disabled="saving || !draft.name.trim()"
        @click="onSave"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
/**
 * SmartFolderSheet — create / edit / delete a saved smart folder
 * (v1.3 S2-6).
 *
 * Two modes, distinguished by whether `folder` is provided:
 *   - Create: blank draft, "Save" appends to user.preferences.smartFolders
 *   - Edit:   pre-filled from folder, "Save" replaces by id; "Delete"
 *             removes from the array
 *
 * Persistence is via usePreferences (S1-2) so the optimistic +
 * debounced + rollback semantics are inherited automatically — the
 * sidebar reflects the new state immediately without waiting for the
 * server round-trip.
 */
import { inject, ref, watch } from "vue";
import SlideOver from "@/components/SlideOver.vue";
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "smartFolders";

const palette: TagColor[] = [
  "lilac",
  "blue",
  "green",
  "amber",
  "red",
  "pink",
  "slate",
  "teal",
];

const props = defineProps<{
  open: boolean;
  /** When provided, the sheet opens in edit mode for this folder. */
  folder?: SmartFolder | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved", folder: SmartFolder): void;
  (e: "deleted", id: string): void;
}>();

const prefs = usePreferences();
const $showError = inject<IToastError>("$showError")!;

const nameInputEl = ref<HTMLInputElement | null>(null);
const saving = ref(false);

const draft = ref<SmartFolder>({
  id: "",
  name: "",
  color: "lilac",
  query: "",
});

const isEditing = ref(false);

// Reset / preload the draft each time the sheet opens.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    if (props.folder) {
      draft.value = { ...props.folder };
      isEditing.value = true;
    } else {
      draft.value = {
        id: cryptoUUID(),
        name: "",
        color: "lilac",
        query: "",
      };
      isEditing.value = false;
    }
    saving.value = false;
    setTimeout(() => nameInputEl.value?.focus(), 0);
  }
);

/** Browser UUID with a fallback for older Safari. Smart folder IDs
 *  are client-generated so the URL is stable from creation moment;
 *  doesn't need to survive collisions across users (per-user prefs). */
function cryptoUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sf-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

const onSave = async () => {
  if (!draft.value.name.trim()) return;
  saving.value = true;
  try {
    const list = prefs.get<SmartFolder[]>(PREF_KEY, []);
    let next: SmartFolder[];
    if (isEditing.value) {
      // Replace in place — preserves order.
      next = list.map((f) =>
        f.id === draft.value.id ? { ...draft.value } : f
      );
    } else {
      next = [...list, { ...draft.value }];
    }
    await prefs.set(PREF_KEY, next);
    emit("saved", { ...draft.value });
    emit("cancel");
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    saving.value = false;
  }
};

const onDelete = async () => {
  if (!isEditing.value) return;
  saving.value = true;
  try {
    const list = prefs.get<SmartFolder[]>(PREF_KEY, []);
    const next = list.filter((f) => f.id !== draft.value.id);
    await prefs.set(PREF_KEY, next);
    emit("deleted", draft.value.id);
    emit("cancel");
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    saving.value = false;
  }
};

const onCancel = () => emit("cancel");
</script>

<style scoped>
.sf-sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sf-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sf-sheet__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}

.sf-sheet__input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
}

.sf-sheet__input--mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12.5px;
}

.sf-sheet__input:focus {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
  border-color: var(--color-accent, #5e6ad2);
}

.sf-sheet__hint {
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.4;
}

.sf-sheet__hint code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  padding: 1px 4px;
  background: var(--color-elevated, #f4f4f5);
  border-radius: 3px;
  color: var(--color-ink-2, #52525b);
}

.sf-sheet__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sf-sheet__swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition:
    transform 0.1s ease,
    border-color 0.1s ease;
}

.sf-sheet__swatch:hover {
  transform: scale(1.1);
}

.sf-sheet__swatch--selected {
  border-color: var(--color-ink-1, #18181b);
}

.sf-sheet__swatch--lilac {
  background: var(--tag-color-lilac-fg);
}
.sf-sheet__swatch--blue {
  background: var(--tag-color-blue-fg);
}
.sf-sheet__swatch--green {
  background: var(--tag-color-green-fg);
}
.sf-sheet__swatch--amber {
  background: var(--tag-color-amber-fg);
}
.sf-sheet__swatch--red {
  background: var(--tag-color-red-fg);
}
.sf-sheet__swatch--pink {
  background: var(--tag-color-pink-fg);
}
.sf-sheet__swatch--slate {
  background: var(--tag-color-slate-fg);
}
.sf-sheet__swatch--teal {
  background: var(--tag-color-teal-fg);
}

.sf-sheet__preview {
  border-top: 1px solid var(--color-line, #ececec);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sf-sheet__preview-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}

.sf-sheet__preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--color-elevated, #f4f4f5);
  font-size: 13px;
  color: var(--color-ink-1, #18181b);
}

.sf-sheet__preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sf-sheet__footer-spacer {
  flex: 1;
}

.sf-sheet__delete,
.sf-sheet__cancel,
.sf-sheet__save {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.sf-sheet__delete {
  background: transparent;
  border-color: var(--color-line, #ececec);
  color: #b91c1c;
}

.sf-sheet__delete:hover {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.3);
}

.sf-sheet__cancel {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.sf-sheet__cancel:hover {
  background: var(--color-elevated, #f4f4f5);
}

.sf-sheet__save {
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.sf-sheet__save:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}

.sf-sheet__save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
