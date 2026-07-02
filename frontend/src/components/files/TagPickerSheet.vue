<template>
  <SlideOver :open="open" :title="sheetTitle" eyebrow="Tags" @cancel="onCancel">
    <div class="tag-picker">
      <!-- Search + create combo. Typing filters the list AND surfaces
           a "Create tag: <query>" CTA when no exact match exists. -->
      <div class="tag-picker__search">
        <Icon
          name="search"
          :size="14"
          :stroke-width="1.8"
          class="tag-picker__search-icon"
        />
        <input
          ref="searchInputEl"
          v-model="searchQuery"
          type="text"
          class="tag-picker__search-input"
          placeholder="Search or create…"
          autocomplete="off"
          @keydown.enter.prevent="onSearchEnter"
        />
      </div>

      <div v-if="loading" class="tag-picker__loading">Loading…</div>

      <ul v-else class="tag-picker__list">
        <li
          v-for="tag in filteredTags"
          :key="tag.id"
          class="tag-picker__row"
          :class="{ 'tag-picker__row--selected': selectedIds.has(tag.id) }"
        >
          <label class="tag-picker__row-label">
            <input
              type="checkbox"
              :checked="selectedIds.has(tag.id)"
              :indeterminate.prop="indeterminateIds.has(tag.id)"
              @change="toggleTag(tag)"
            />
            <TagChip :tag="tag" size="md" />
            <!-- Color swatch trigger. Click pops the 8-swatch picker
                 right below; selecting a swatch commits via PATCH with
                 an optimistic store update. -->
            <button
              type="button"
              class="tag-picker__color-btn"
              :class="`tag-picker__color-btn--${tag.color}`"
              :title="`Change color (currently ${tag.color})`"
              :aria-label="`Change color, currently ${tag.color}`"
              @click.stop.prevent="openColorPicker(tag)"
            />
          </label>
          <!-- The picker anchors below the row when this tag is the
               active target. Positioned absolutely so it doesn't
               displace neighboring rows. -->
          <div
            v-if="colorPickerTarget?.id === tag.id"
            class="tag-picker__color-wrap"
          >
            <TagColorPicker
              :open="true"
              :current="tag.color"
              @pick="(c) => onColorPick(tag, c)"
              @close="colorPickerTarget = null"
            />
          </div>
        </li>

        <!-- "Create tag: foo" CTA. Visible when the user has typed
             something AND no tag with that exact name exists yet. -->
        <li
          v-if="showCreateCTA"
          class="tag-picker__row tag-picker__row--create"
        >
          <button
            type="button"
            class="tag-picker__create-btn"
            :disabled="creating"
            @click="onCreate"
          >
            <Icon name="plus" :size="14" />
            <span>
              {{ creating ? "Creating…" : `Create tag: ${searchQuery.trim()}` }}
            </span>
          </button>
        </li>

        <li
          v-if="filteredTags.length === 0 && !showCreateCTA"
          class="tag-picker__empty"
        >
          No tags yet. Type a name above to create one.
        </li>
      </ul>
    </div>

    <template #footer>
      <button type="button" class="tag-picker__cancel" @click="onCancel">
        Cancel
      </button>
      <button
        type="button"
        class="tag-picker__save"
        :disabled="saving || !hasChanges"
        @click="onSave"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
/**
 * TagPickerSheet — SlideOver for attaching / detaching / creating tags
 * on a single file (S2-5).
 *
 * The sheet starts with the file's current tags pre-checked. Users
 * toggle the set; on Save we compute the diff (additions + removals)
 * and call the API in parallel — much faster than re-PUTting the full
 * set, and lets the optimistic store update reflect each delta as it
 * lands.
 *
 * Create-on-the-fly: typing a name that doesn't match an existing tag
 * surfaces a "Create tag: <name>" CTA. Clicking it creates the tag
 * AND immediately checks it (so the user doesn't have to think about
 * the two-step "create then select" flow).
 */
import { computed, ref, watch } from "vue";
import { inject } from "vue";
import Icon from "@/components/Icon.vue";
import SlideOver from "@/components/SlideOver.vue";
import TagChip from "@/components/TagChip.vue";
import TagColorPicker from "@/components/TagColorPicker.vue";
import { tags as tagsApi } from "@/api";
import { useTagsStore } from "@/stores/tags";
import { tagTriState, tagBatchDelta } from "@/utils/tagBatch";

const props = defineProps<{
  /** Whether the sheet is open. Two-way via emit('cancel') on close. */
  open: boolean;
  /** Path of the file we're managing tags for (single-file mode). */
  path?: string;
  /** Paths for bulk mode (2.4.0 Stage 5 / K). When set, the sheet shows a
   *  tri-state list (on all / on some = indeterminate / on none) and applies
   *  add/remove deltas across every path via /api/tags/apply. */
  paths?: string[];
}>();

// Bulk mode whenever a `paths` array is supplied.
const isBatch = computed<boolean>(() => (props.paths?.length ?? 0) > 0);
const targetPaths = computed<string[]>(() =>
  props.paths?.length ? props.paths : props.path ? [props.path] : []
);
const sheetTitle = computed<string>(() =>
  isBatch.value ? `Tag ${targetPaths.value.length} items` : "Manage tags"
);

const emit = defineEmits<{
  (e: "cancel"): void;
  /** Fires after Save completes, carrying the final tag set so callers
   *  can update their UI without re-fetching. */
  (e: "saved", tags: Tag[]): void;
}>();

const tagsStore = useTagsStore();
const $showError = inject<IToastError>("$showError")!;

const searchInputEl = ref<HTMLInputElement | null>(null);
const searchQuery = ref("");
const loading = ref(false);
const saving = ref(false);
const creating = ref(false);

// IDs currently selected (checked in the picker). Mutated optimistically
// as the user toggles checkboxes; reconciled with the server on Save.
const selectedIds = ref<Set<number>>(new Set());
// Snapshot of selectedIds at open time, used to compute the single-file diff.
const initialIds = ref<Set<number>>(new Set());

// Bulk tri-state (Stage 5 / K). A tag on EVERY selected path starts checked
// (initialAllIds); a tag on SOME but not all starts INDETERMINATE — tracked in
// someIds (the original set) and indeterminateIds (those still untouched). The
// Save delta: a tag the user checked → add to all; a tag they unchecked that was
// present anywhere → remove from all; a tag left indeterminate → no change.
const initialAllIds = ref<Set<number>>(new Set());
const someIds = ref<Set<number>>(new Set());
const indeterminateIds = ref<Set<number>>(new Set());

const filteredTags = computed<Tag[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tagsStore.tags;
  return tagsStore.tags.filter((t) => t.name.toLowerCase().includes(q));
});

const showCreateCTA = computed<boolean>(() => {
  const q = searchQuery.value.trim();
  if (!q) return false;
  // Only offer "Create" when there's no exact (case-insensitive) match.
  return !tagsStore.hasName(q);
});

const hasChanges = computed<boolean>(() => {
  if (isBatch.value) {
    const { add, remove } = batchDelta.value;
    return add.length > 0 || remove.length > 0;
  }
  if (selectedIds.value.size !== initialIds.value.size) return true;
  for (const id of selectedIds.value) {
    if (!initialIds.value.has(id)) return true;
  }
  return false;
});

// Re-initialize whenever the sheet opens for a new file.
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    loading.value = true;
    searchQuery.value = "";
    indeterminateIds.value = new Set();
    try {
      await tagsStore.ensureLoaded();
      if (isBatch.value) {
        // Per-path tags → tri-state (on all / on some / on none).
        const byPath = await tagsApi.batchForFiles(targetPaths.value);
        const perPath = targetPaths.value.map((p) =>
          (byPath[p] ?? []).map((t) => t.id)
        );
        const { all, some } = tagTriState(perPath);
        initialAllIds.value = new Set(all);
        someIds.value = new Set(some);
        selectedIds.value = new Set(all); // checked = on-all
        indeterminateIds.value = new Set(some); // dashes = on-some
      } else {
        // Single-file: the file's current tags are pre-checked.
        const current = await tagsApi.forFile(targetPaths.value[0]);
        const ids = new Set(current.map((t) => t.id));
        selectedIds.value = new Set(ids);
        initialIds.value = new Set(ids);
      }
    } catch (e) {
      if (e instanceof Error) $showError(e);
    } finally {
      loading.value = false;
      // Focus the search input so type-to-filter works without
      // requiring a click first.
      setTimeout(() => searchInputEl.value?.focus(), 0);
    }
  }
);

const toggleTag = (tag: Tag) => {
  const id = tag.id;
  // Tri-state cycle: indeterminate → checked → unchecked → checked.
  if (indeterminateIds.value.has(id)) {
    indeterminateIds.value.delete(id);
    selectedIds.value.add(id);
  } else if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

// Bulk Save delta (pure logic in utils/tagBatch).
const batchDelta = computed<{ add: number[]; remove: number[] }>(() =>
  tagBatchDelta(
    initialAllIds.value,
    someIds.value,
    selectedIds.value,
    indeterminateIds.value
  )
);

// ── Color picker integration (v1.3 S2-8) ────────────────────────────
// Tracks which tag the popover is anchored to (null = closed). Only
// one picker open at a time across the sheet — clicking another
// tag's swatch re-anchors rather than stacking.
const colorPickerTarget = ref<Tag | null>(null);

const openColorPicker = (tag: Tag) => {
  // Toggle off when clicking the already-open tag's swatch.
  if (colorPickerTarget.value?.id === tag.id) {
    colorPickerTarget.value = null;
    return;
  }
  colorPickerTarget.value = tag;
};

/** Commit a color change via PATCH. Optimistically updates the cached
 *  tag list immediately so the chip + swatch reflect the new color
 *  without waiting for the request, then refreshes on success or
 *  rolls back on failure. */
const onColorPick = async (tag: Tag, color: TagColor) => {
  const prevColor = tag.color;
  // Optimistic store update — patch the cached tag in place.
  const cached = tagsStore.tags.find((t) => t.id === tag.id);
  if (cached) cached.color = color;
  try {
    await tagsApi.update(tag.id, { color });
    // Refresh so any other consumers (listing rows, info pane) see
    // the new color authoritatively from the server.
    await tagsStore.refresh();
  } catch (e) {
    // Roll back the local mutation if the server rejected.
    if (cached) cached.color = prevColor;
    if (e instanceof Error) $showError(e);
  }
};

const onSearchEnter = () => {
  // Enter when no exact match → create + auto-check the new tag.
  if (showCreateCTA.value) {
    void onCreate();
    return;
  }
  // Enter when filter matches exactly one → toggle it.
  if (filteredTags.value.length === 1) {
    toggleTag(filteredTags.value[0]);
  }
};

const onCreate = async () => {
  const name = searchQuery.value.trim();
  if (!name) return;
  creating.value = true;
  try {
    const newTag = await tagsApi.create(name);
    // Refresh the cached list so the new tag appears in the picker.
    await tagsStore.refresh();
    // Auto-check the new tag — saves the user a second click.
    selectedIds.value.add(newTag.id);
    searchQuery.value = "";
    // Re-focus search so Tab/Enter keeps working naturally.
    searchInputEl.value?.focus();
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    creating.value = false;
  }
};

const onSave = async () => {
  saving.value = true;
  try {
    if (isBatch.value) {
      const { add, remove } = batchDelta.value;
      await tagsApi.applyBatch(targetPaths.value, add, remove);
      // Refresh the listing's cached chips for every affected path.
      try {
        await tagsStore.loadForPaths(targetPaths.value);
      } catch {
        /* chips just won't refresh — not worth failing the save */
      }
      emit("saved", []);
      emit("cancel");
      return;
    }
    // Single-file diff: additions = in new but not initial; removals = vice versa.
    const additions: number[] = [];
    const removals: number[] = [];
    for (const id of selectedIds.value) {
      if (!initialIds.value.has(id)) additions.push(id);
    }
    for (const id of initialIds.value) {
      if (!selectedIds.value.has(id)) removals.push(id);
    }
    const singlePath = targetPaths.value[0];
    // Dispatch in parallel — independent ops, no ordering constraints.
    await Promise.all([
      ...additions.map((id) => tagsApi.attach(singlePath, id)),
      ...removals.map((id) => tagsApi.detach(singlePath, id)),
    ]);
    // Build the final tag list from cache to emit upstream.
    const final = tagsStore.tags.filter((t) => selectedIds.value.has(t.id));
    tagsStore.setLocalForPath(singlePath, final);
    emit("saved", final);
    emit("cancel"); // close the sheet
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    saving.value = false;
  }
};

const onCancel = () => emit("cancel");
</script>

<style scoped>
.tag-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.tag-picker__search {
  position: relative;
  display: flex;
  align-items: center;
}

.tag-picker__search-icon {
  position: absolute;
  left: 10px;
  color: var(--color-ink-3, #a1a1aa);
  pointer-events: none;
}

.tag-picker__search-input {
  width: 100%;
  height: 34px;
  padding: 0 12px 0 32px;
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
}

.tag-picker__search-input:focus {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
  border-color: var(--color-accent, #6e72d9);
}

.tag-picker__loading,
.tag-picker__empty {
  font-size: 12.5px;
  color: var(--color-ink-3, #a1a1aa);
  text-align: center;
  padding: 16px 0;
}

.tag-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-picker__row {
  border-radius: 6px;
  transition: background-color 0.1s ease;
}

.tag-picker__row:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.045));
}

.tag-picker__row--selected {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
}

.tag-picker__row-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 13px;
}

.tag-picker__row-label input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

/* Color swatch trigger (v1.3 S2-8). Mini circle pushed to the right
   end of the row. Hover/focus lifts to make the affordance obvious. */
.tag-picker__color-btn {
  margin-left: auto;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.1s ease;
}

.tag-picker__color-btn:hover,
.tag-picker__color-btn:focus-visible {
  transform: scale(1.15);
  outline: none;
  border-color: var(--color-ink-3, #a1a1aa);
}

.tag-picker__color-btn--lilac {
  background: var(--tag-color-lilac-fg);
}
.tag-picker__color-btn--blue {
  background: var(--tag-color-blue-fg);
}
.tag-picker__color-btn--green {
  background: var(--tag-color-green-fg);
}
.tag-picker__color-btn--amber {
  background: var(--tag-color-amber-fg);
}
.tag-picker__color-btn--red {
  background: var(--tag-color-red-fg);
}
.tag-picker__color-btn--pink {
  background: var(--tag-color-pink-fg);
}
.tag-picker__color-btn--slate {
  background: var(--tag-color-slate-fg);
}
.tag-picker__color-btn--teal {
  background: var(--tag-color-teal-fg);
}

/* Anchor for the TagColorPicker popover. Sits inside the row, below
   the swatch button. Right-aligned so it doesn't overflow the sheet
   on narrow widths. Margin-top creates breathing room from the row. */
.tag-picker__color-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 6px 8px 8px;
  margin-top: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .tag-picker__color-btn {
    transition: none;
  }
}

.tag-picker__row--create {
  margin-top: 6px;
  border-top: 1px solid var(--color-line, #ececec);
  padding-top: 6px;
}

.tag-picker__create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: 1px dashed var(--color-line-strong, #d4d4d8);
  border-radius: 6px;
  color: var(--color-accent, #6e72d9);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.tag-picker__create-btn:hover:not(:disabled) {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
  border-color: var(--color-accent, #6e72d9);
}

.tag-picker__create-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tag-picker__cancel,
.tag-picker__save {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.tag-picker__cancel {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.tag-picker__cancel:hover {
  background: var(--color-elevated, #f4f4f5);
}

.tag-picker__save {
  background: var(--accent-gradient);
  border: 1px solid var(--color-accent, #6e72d9);
  color: white;
}

.tag-picker__save:hover:not(:disabled) {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #575cc7);
}

.tag-picker__save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
