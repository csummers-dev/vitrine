<template>
  <SlideOver
    :open="open"
    eyebrow="Bulk rename"
    :title="title"
    :close-on-scrim-click="!applying"
    @cancel="onCancel"
  >
    <!-- ── Selection summary ──────────────────────────────────────── -->
    <div class="brp-summary">
      <Icon name="pencil" :size="14" :stroke-width="1.6" />
      <span>
        Renaming
        <strong>{{ selectedItems.length }}</strong>
        item{{ selectedItems.length === 1 ? "" : "s" }} in
        <strong>{{ folderLabel }}</strong>
      </span>
    </div>

    <!-- ── Mode switcher ─────────────────────────────────────────── -->
    <div class="brp-modes" role="tablist" aria-label="Rename mode">
      <button
        type="button"
        role="tab"
        :class="['brp-mode', mode === 'pattern' && 'brp-mode--active']"
        :aria-selected="mode === 'pattern'"
        :disabled="applying"
        @click="mode = 'pattern'"
      >
        <Icon name="braces" :size="12" />
        Pattern
      </button>
      <button
        type="button"
        role="tab"
        :class="['brp-mode', mode === 'findReplace' && 'brp-mode--active']"
        :aria-selected="mode === 'findReplace'"
        :disabled="applying"
        @click="mode = 'findReplace'"
      >
        <Icon name="replace" :size="12" />
        Find and replace
      </button>
    </div>

    <!-- ── Pattern mode inputs ───────────────────────────────────── -->
    <div v-if="mode === 'pattern'" class="brp-inputs">
      <label for="brp-pattern" class="brp-label">Pattern</label>
      <input
        id="brp-pattern"
        v-model="pattern"
        type="text"
        class="brp-input"
        placeholder="{name}-{####}.{ext}"
        autocomplete="off"
        spellcheck="false"
        :disabled="applying"
      />
      <p class="brp-help">
        Placeholders:
        <code>{n}</code>
        index ·
        <code>{N}</code>
        padded ·
        <code>{####}</code>
        4-digit ·
        <code>{name}</code>
        ·
        <code>{ext}</code>
        ·
        <code>{original}</code>
      </p>
    </div>

    <!-- ── Find / replace mode inputs ────────────────────────────── -->
    <div v-else class="brp-inputs">
      <label for="brp-find" class="brp-label">Find</label>
      <input
        id="brp-find"
        v-model="findText"
        type="text"
        class="brp-input"
        placeholder="Text to find"
        autocomplete="off"
        spellcheck="false"
        :disabled="applying"
      />
      <label for="brp-replace" class="brp-label">Replace with</label>
      <input
        id="brp-replace"
        v-model="replaceText"
        type="text"
        class="brp-input"
        placeholder="Replacement text (leave blank to delete)"
        autocomplete="off"
        spellcheck="false"
        :disabled="applying"
      />
      <p class="brp-help">
        Literal-string match (not regex). Empty
        <strong>Find</strong>
        leaves names unchanged.
      </p>
    </div>

    <!-- ── Live preview list ─────────────────────────────────────── -->
    <div class="brp-preview">
      <div class="brp-preview-header">
        <span>Preview</span>
        <span v-if="cleanCount > 0 || skipCount > 0" class="brp-preview-counts">
          <span class="brp-count brp-count--ok">{{ cleanCount }} ready</span>
          <span v-if="skipCount > 0" class="brp-count brp-count--skip">
            {{ skipCount }} skipped
          </span>
        </span>
      </div>
      <ul class="brp-preview-list">
        <li
          v-for="row in previewRows"
          :key="row.from"
          :class="[
            'brp-preview-row',
            row.conflict && 'brp-preview-row--conflict',
            row.unchanged && 'brp-preview-row--unchanged',
          ]"
          :title="row.conflict ? row.reason : undefined"
        >
          <span class="brp-from">{{ row.fromName }}</span>
          <Icon
            name="arrow-right"
            :size="11"
            :stroke-width="1.6"
            class="brp-arrow"
          />
          <span class="brp-to">{{ row.to }}</span>
          <span v-if="row.conflict" class="brp-reason">{{ row.reason }}</span>
          <span v-else-if="row.unchanged" class="brp-reason">unchanged</span>
        </li>
      </ul>
    </div>

    <template #footer>
      <!-- Progress lives on the left side of the footer during apply
           so the action button keeps its stable position on the right. -->
      <div v-if="applying" class="brp-progress" role="status">
        <Icon name="loader-circle" :size="13" class="brp-progress-spin" />
        Renaming {{ progress }} / {{ cleanCount }}…
      </div>
      <div v-else class="brp-spacer"></div>

      <button
        type="button"
        class="brp-btn brp-btn--ghost"
        :disabled="applying"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="brp-btn brp-btn--primary"
        :disabled="applying || cleanCount === 0"
        @click="onApply"
      >
        Rename {{ cleanCount }}
      </button>
    </template>
  </SlideOver>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { useFileStore } from "@/stores/file";
import { files as api } from "@/api";
import SlideOver from "@/components/SlideOver.vue";
import Icon from "@/components/Icon.vue";
import { useToast } from "vue-toastification";
import { applyFindReplace, expandPattern } from "@/utils/bulkRenamePattern";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "done"): void;
}>();

const $showError = inject<IToastError>("$showError")!;
const $toast = useToast();

const fileStore = useFileStore();

// ── Snapshot of the selection at open-time ──────────────────────────
// Pinned on open so layout-store changes (route nav, listing reload)
// don't pull the rug from under the preview / apply pipeline. Each
// entry carries everything `api.move` needs plus the rendered name.
interface RenameSource {
  /** Full URL of the item (the `from` arg api.move expects). */
  url: string;
  /** Bare filename (basename) — what we run the pattern against. */
  name: string;
  /** Selection-order index — drives {n}/{N}/{####} placeholders. */
  index: number;
}
const selectedItems = ref<RenameSource[]>([]);

// ── Mode + input state ──────────────────────────────────────────────
type Mode = "pattern" | "findReplace";
const mode = ref<Mode>("pattern");
const pattern = ref<string>("{name}.{ext}");
const findText = ref<string>("");
const replaceText = ref<string>("");

// ── Apply progress ──────────────────────────────────────────────────
const applying = ref<boolean>(false);
const progress = ref<number>(0);

// ── Snapshot when the panel opens; reset state when it closes ──────
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      // Don't reset mode/pattern — they persist across opens so a
      // user fine-tuning a pattern doesn't lose it on a stray Esc.
      // Just clear progress + the selection snapshot to release refs.
      applying.value = false;
      progress.value = 0;
      selectedItems.value = [];
      return;
    }
    if (!fileStore.req) return;
    selectedItems.value = fileStore.selected
      .map((idx, seqIdx) => {
        const item = fileStore.req!.items[idx];
        if (!item) return null;
        return { url: item.url, name: item.name, index: seqIdx };
      })
      .filter((x): x is RenameSource => x !== null);
  }
);

const title = computed(() => {
  const n = selectedItems.value.length;
  return n === 1 ? "Rename 1 item" : `Rename ${n} items`;
});

const folderLabel = computed<string>(() => {
  const req = fileStore.req;
  if (!req) return "this folder";
  return req.name || "root";
});

// ── Preview rows ────────────────────────────────────────────────────
// Each row carries the new name + a conflict flag with a human reason.
// `unchanged` rows (pattern produced same name) are flagged separately
// so they're visually distinct but DON'T count toward conflicts — we
// just skip them silently on apply (renaming to your own name is a
// no-op, not a failure).
interface PreviewRow {
  from: string; // url of source
  fromName: string; // basename for display
  to: string; // computed new name
  conflict: boolean;
  unchanged: boolean;
  reason: string;
}

/** Set of names that already exist in this folder but AREN'T part of
 *  the selection. Used to detect external-collision conflicts.
 *  Recomputed cheaply per preview since req.items is small. */
const existingOutsideSelection = computed<Set<string>>(() => {
  const req = fileStore.req;
  if (!req) return new Set();
  const selectedUrls = new Set(selectedItems.value.map((i) => i.url));
  const out = new Set<string>();
  for (const item of req.items) {
    if (!selectedUrls.has(item.url)) out.add(item.name);
  }
  return out;
});

const previewRows = computed<PreviewRow[]>(() => {
  // First pass: compute the proposed `to` for each item.
  const sources = selectedItems.value;
  const total = sources.length;
  const proposals = sources.map<{ src: RenameSource; to: string }>((src) => {
    let to: string;
    if (mode.value === "pattern") {
      to = expandPattern(pattern.value, {
        index: src.index,
        total,
        original: src.name,
      });
    } else {
      to = applyFindReplace(src.name, findText.value, replaceText.value);
    }
    return { src, to };
  });

  // Second pass: detect duplicates within the proposed set so we can
  // mark every member of a collision as a conflict (not just the
  // second occurrence).
  const dupeCount = new Map<string, number>();
  for (const p of proposals) {
    dupeCount.set(p.to, (dupeCount.get(p.to) ?? 0) + 1);
  }

  // Third pass: build the rendered rows with conflict reasons.
  const existing = existingOutsideSelection.value;
  return proposals.map<PreviewRow>(({ src, to }) => {
    const row: PreviewRow = {
      from: src.url,
      fromName: src.name,
      to,
      conflict: false,
      unchanged: to === src.name,
      reason: "",
    };
    // Empty result — pattern produced nothing usable.
    if (!to.trim()) {
      row.conflict = true;
      row.reason = "Empty name";
      return row;
    }
    // Slash in result — would create a subfolder rather than renaming.
    if (to.includes("/")) {
      row.conflict = true;
      row.reason = "Contains slash";
      return row;
    }
    // Internal collision — two selection items proposed the same name.
    if ((dupeCount.get(to) ?? 0) > 1) {
      row.conflict = true;
      row.reason = "Duplicate within selection";
      return row;
    }
    // External collision — name already exists outside the selection.
    if (existing.has(to)) {
      row.conflict = true;
      row.reason = "Name already exists in folder";
      return row;
    }
    return row;
  });
});

const cleanCount = computed<number>(
  () => previewRows.value.filter((r) => !r.conflict && !r.unchanged).length
);
const skipCount = computed<number>(
  () => previewRows.value.filter((r) => r.conflict).length
);

// ── Apply ───────────────────────────────────────────────────────────
// Continue-on-error per the locked spec. Per-item serial loop so
// progress is real-time and one failure doesn't abort the batch.
const onApply = async () => {
  if (applying.value) return;
  // Only the clean (non-conflict, non-unchanged) rows are moved.
  const targets = previewRows.value.filter((r) => !r.conflict && !r.unchanged);
  if (targets.length === 0) return;

  applying.value = true;
  progress.value = 0;
  let renamed = 0;
  const failures: { from: string; to: string; reason: string }[] = [];

  // Resolve a destination URL by replacing the last path segment of
  // the source URL with the new name (URL-encoded). Mirrors the
  // single-file rename flow in ListingItem.submitRename.
  for (const row of targets) {
    const dest = row.from.replace(/[^/]+\/?$/, encodeURIComponent(row.to));
    try {
      await api.move(
        [{ from: row.from, to: dest, name: row.to }],
        false,
        false
      );
      renamed++;
    } catch (err) {
      failures.push({
        from: row.fromName,
        to: row.to,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    progress.value++;
  }

  applying.value = false;

  // Summary toast with details — counts both the conflict-skipped and
  // the runtime-failed entries so the user gets one honest tally.
  const skippedTotal = skipCount.value + failures.length;
  if (renamed > 0 && skippedTotal === 0) {
    $toast.success(
      renamed === 1 ? "Renamed 1 item" : `Renamed ${renamed} items`
    );
  } else if (renamed > 0) {
    $toast.info(
      `Renamed ${renamed} item${renamed === 1 ? "" : "s"}, skipped ${skippedTotal}`
    );
  } else if (skippedTotal > 0) {
    $showError(new Error(`No items renamed — skipped ${skippedTotal}`));
  }

  fileStore.reload = true;
  emit("done");
};

const onCancel = () => {
  if (applying.value) return; // hardened: don't bail out mid-apply
  emit("cancel");
};
</script>

<style scoped>
/* ── Summary chip ───────────────────────────────────────────────── */
.brp-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
  margin-bottom: 14px;
}
.brp-summary strong {
  color: var(--color-ink-1, #18181b);
  font-weight: 600;
}

/* ── Mode switcher (lightweight segmented control) ─────────────── */
.brp-modes {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  margin-bottom: 14px;
}
.brp-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
  font-weight: 500;
  border: 0;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  border-radius: 5px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.brp-mode:hover:not(:disabled) {
  color: var(--color-ink-1, #18181b);
}
.brp-mode--active {
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.brp-mode:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ── Inputs ────────────────────────────────────────────────────── */
.brp-inputs {
  margin-bottom: 14px;
}
.brp-label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-top: 10px;
  margin-bottom: 4px;
}
.brp-label:first-child {
  margin-top: 0;
}
.brp-input {
  width: 100%;
  padding: 7px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: var(--color-ink-1, #18181b);
  outline: none;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}
.brp-input:focus {
  border-color: var(--color-accent, #5e6ad2);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(94, 106, 210, 0.3));
}
.brp-input:disabled {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-3, #a1a1aa);
  cursor: not-allowed;
}
.brp-help {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  line-height: 1.5;
}
.brp-help code {
  display: inline-block;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-2, #52525b);
}

/* ── Preview list ──────────────────────────────────────────────── */
.brp-preview {
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  overflow: hidden;
}
.brp-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-elevated, #f4f4f5);
  border-bottom: 1px solid var(--color-line, #ececec);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}
.brp-preview-counts {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}
.brp-count {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
}
.brp-count--ok {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}
.brp-count--skip {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}
html.dark .brp-count--skip {
  background: rgba(127, 29, 29, 0.3);
  color: #fca5a5;
}
.brp-preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 360px;
  overflow-y: auto;
}
.brp-preview-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  border-bottom: 1px solid var(--color-line-soft, #f4f4f5);
  color: var(--color-ink-2, #52525b);
}
.brp-preview-row:last-child {
  border-bottom: none;
}
.brp-from,
.brp-to {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.brp-to {
  color: var(--color-ink-1, #18181b);
  font-weight: 500;
  text-align: left;
}
.brp-arrow {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.brp-preview-row--conflict {
  background: rgba(239, 68, 68, 0.05);
}
.brp-preview-row--conflict .brp-to {
  color: #b91c1c;
  text-decoration: line-through;
  text-decoration-color: rgba(185, 28, 28, 0.5);
}
html.dark .brp-preview-row--conflict {
  background: rgba(127, 29, 29, 0.15);
}
html.dark .brp-preview-row--conflict .brp-to {
  color: #fca5a5;
}
.brp-preview-row--unchanged .brp-to {
  color: var(--color-ink-3, #a1a1aa);
  font-style: italic;
}
.brp-reason {
  grid-column: 1 / -1;
  padding-top: 2px;
  font-family: var(--font-sans, system-ui);
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  font-style: italic;
}
.brp-preview-row--conflict .brp-reason {
  color: #b91c1c;
}
html.dark .brp-preview-row--conflict .brp-reason {
  color: #fca5a5;
}

/* ── Footer ────────────────────────────────────────────────────── */
.brp-progress {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--color-ink-2, #52525b);
}
.brp-progress-spin {
  color: var(--color-accent, #5e6ad2);
  animation: brp-spin 0.9s linear infinite;
}
@keyframes brp-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .brp-progress-spin {
    animation: none;
  }
}
.brp-spacer {
  flex: 1;
}
.brp-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}
.brp-btn--ghost {
  background: transparent;
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}
.brp-btn--ghost:hover:not(:disabled) {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.brp-btn--primary {
  background: var(--color-accent, #5e6ad2);
  color: white;
}
.brp-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong, #4f59c4);
}
.brp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
