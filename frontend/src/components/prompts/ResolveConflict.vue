<template>
  <div class="rc-prompt" @click.stop>
    <div class="rc-prompt__header">
      <div class="rc-prompt__icon">
        <Icon name="git-merge" :size="18" :stroke-width="1.6" />
      </div>
      <div class="rc-prompt__text">
        <h2 class="rc-prompt__title">
          {{
            personalized
              ? $t("prompts.resolveConflict")
              : $t("prompts.replaceOrSkip")
          }}
        </h2>
        <p class="rc-prompt__subtitle">
          {{
            personalized
              ? isUploadAction
                ? "Pick a resolution for each file."
                : $t("prompts.singleConflictResolve")
              : $t("prompts.fastConflictResolve", {
                  count: conflict.length,
                  noun: conflict.length === 1 ? "file" : "files",
                })
          }}
        </p>
        <!-- Source → destination context line. Only renders when the
             caller supplied `from`/`to`; the legacy upload path supplies
             only `to` (origin is the user's local filesystem). V2 #25: the
             leading arrow icon was removed — the "→" already lives inside the
             text between source and destination. -->
        <p v-if="contextLine" class="rc-prompt__context">
          <span v-text="contextLine"></span>
        </p>
        <!-- Inline filename preview so users in the quick-action view
             don't have to enter the personalized view just to see which
             files are colliding. -->
        <p v-if="!personalized" class="rc-prompt__files">
          {{ filePreview }}
        </p>
      </div>
    </div>

    <div class="rc-prompt__body">
      <!-- Per-item resolution view -->
      <div v-if="personalized" class="rc-list">
        <div class="rc-list__legend">
          <label class="rc-list__legend-cell">
            <input
              type="checkbox"
              :checked="originAllChecked"
              value="origin"
              @change="toogleCheckAll"
            />
            <span>
              {{
                isUploadAction
                  ? $t("prompts.uploadingFiles")
                  : $t("prompts.filesInOrigin")
              }}
            </span>
          </label>
          <label class="rc-list__legend-cell">
            <input
              type="checkbox"
              :checked="destAllChecked"
              value="dest"
              @change="toogleCheckAll"
            />
            <span>{{ $t("prompts.filesInDest") }}</span>
          </label>
        </div>

        <div v-for="(item, index) in conflict" :key="index" class="rc-item">
          <div class="rc-item__head">
            <span class="rc-item__name">{{ item.name }}</span>
            <span
              :class="['rc-chip', verdictTone(item)]"
              v-text="verdictLabel(item)"
            ></span>
          </div>
          <!-- J (2.4.0): when this row resolves to keep-both, show the exact
               name the kept copy will get (computed against the destination
               listing with the backend's suffix scheme) — so "Rename" isn't a
               mystery box. Move/copy/paste only; uploads have no rename. -->
          <p
            v-if="
              item.checked.length === 2 && !isUploadAction && item.keepBothName
            "
            class="rc-item__keep-both"
          >
            Incoming copy will be kept as “{{ item.keepBothName }}”
          </p>
          <div class="rc-item__cols">
            <label class="rc-item__col">
              <input v-model="item.checked" type="checkbox" value="origin" />
              <div class="rc-item__col-meta">
                <span>{{ humanTime(item.origin.lastModified) }}</span>
                <span class="rc-item__col-size">
                  {{ humanSize(item.origin.size) }}
                </span>
              </div>
            </label>
            <label class="rc-item__col">
              <input v-model="item.checked" type="checkbox" value="dest" />
              <div class="rc-item__col-meta">
                <span>{{ humanTime(item.dest.lastModified) }}</span>
                <span class="rc-item__col-size">
                  {{ humanSize(item.dest.size) }}
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Quick-action buttons -->
      <div v-else class="rc-quick">
        <button class="rc-quick__btn" @click="(e) => resolve(e, ['origin'])">
          <Icon
            name="check-check"
            :size="14"
            :style="{ color: 'var(--c-blue)' }"
          />
          <span>{{ $t("buttons.overrideAll") }}</span>
        </button>
        <button
          v-if="!isUploadAction"
          class="rc-quick__btn"
          @click="(e) => resolve(e, ['origin', 'dest'])"
        >
          <Icon name="copy" :size="14" :style="{ color: 'var(--c-teal)' }" />
          <span>{{ $t("buttons.renameAll") }}</span>
        </button>
        <button class="rc-quick__btn" @click="(e) => resolve(e, ['dest'])">
          <Icon name="undo-2" :size="14" :style="{ color: 'var(--c-green)' }" />
          <span>{{ $t("buttons.skipAll") }}</span>
        </button>
        <!-- Resume is upload-specific (H9). The isSmallerOnServer
             heuristic identifies likely-partial uploads on the server
             and re-uploads just those; for move/copy conflicts the
             same heuristic becomes a confusing "keep the larger file"
             rule that doesn't match the button's name. Hide for non-
             upload paths. -->
        <button
          v-if="isUploadAction"
          class="rc-quick__btn"
          @click="(e) => resume(e)"
        >
          <Icon
            name="rotate-ccw"
            :size="14"
            :style="{ color: 'var(--c-lilac)' }"
          />
          <span>{{ $t("buttons.resumeTransfer") }}</span>
          <span
            class="rc-quick__tip"
            :title="$t('buttons.resumeTransferTooltip')"
          >
            <Icon name="info" :size="11" />
          </span>
        </button>
        <button
          class="rc-quick__btn rc-quick__btn--accent"
          @click="personalized = true"
        >
          <Icon name="list-checks" :size="14" />
          <span>{{ $t("buttons.singleDecision") }}</span>
        </button>
      </div>
    </div>

    <div class="rc-prompt__actions">
      <!-- Back button (H9). Only visible in personalized mode.
           Returns to the quick-action view without losing per-row
           selections — the user's `conflict[].checked` state survives
           the toggle so re-entering personalized resumes where they
           left off. Reduces the friction of "I clicked Decide-for-
           each by mistake and now have to cancel + redo the whole
           action." Positioned left-aligned so it reads as navigation,
           separate from the destructive Cancel + commit OK. -->
      <button
        v-if="personalized"
        type="button"
        class="rc-btn rc-btn--ghost rc-btn--back"
        @click="personalized = false"
      >
        <Icon name="arrow-left" :size="13" :stroke-width="1.8" />
        <span>Back</span>
      </button>
      <div class="rc-prompt__actions-spacer" />
      <button type="button" class="rc-btn rc-btn--ghost" @click="close">
        {{ $t("buttons.cancel") }}
      </button>
      <button
        v-if="personalized"
        id="focus-prompt"
        type="button"
        class="rc-btn rc-btn--primary"
        @click="(event) => currentPrompt?.confirm(event, conflict)"
      >
        {{ $t("buttons.ok") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { computed, ref } from "vue";
import { useLayoutStore } from "@/stores/layout";
import { useRootLabel } from "@/composables/useRootLabel";
import { filesize } from "@/utils";
import dayjs from "dayjs";

const layoutStore = useLayoutStore();
// V2 #25: show the user's custom root label (e.g. "My files") instead of the
// generic "Root" when a conflict path resolves to the storage root.
const { rootLabel } = useRootLabel();
const { currentPrompt } = layoutStore;

const conflict = ref<ConflictingResource[]>(currentPrompt?.props.conflict);
const isUploadAction = ref<boolean | undefined>(
  currentPrompt?.props.isUploadAction
);
const personalized = ref(false);

// Source/destination context. `from` is omitted on uploads (the origin
// is the user's local filesystem, not a server path) — in that case we
// still show the "→ <dest>" half so users at least know WHERE files
// are landing.
const fromPath = computed<string | undefined>(() => currentPrompt?.props.from);
const toPath = computed<string | undefined>(() => currentPrompt?.props.to);

/**
 * Render a server URL as a user-readable path. Strips the API prefix
 * (`/files/`), the trailing slash, and decodes URI components.
 * Collapses to the last two segments so deep paths stay readable
 * (`/A/B/C/D/E/` → "D/E"). Returns "Root" for the storage root.
 */
const friendlyPath = (raw: string): string => {
  const trimmed = raw
    .replace(/^\/files\//, "")
    .replace(/^\/api\/resources\//, "")
    .replace(/\/$/, "");
  if (!trimmed) return rootLabel.value || "My files";
  const segments = trimmed.split("/");
  const tail = segments.slice(-2).join("/");
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
};

const contextLine = computed<string | null>(() => {
  if (!toPath.value) return null;
  if (fromPath.value) {
    return `${friendlyPath(fromPath.value)} → ${friendlyPath(toPath.value)}`;
  }
  // Upload path — only destination is known.
  return `Uploading to ${friendlyPath(toPath.value)}`;
});

/**
 * "draft.txt, notes.md, +N more" inline filename preview shown in the
 * quick-action view. Capped at 3 names so the header doesn't blow up
 * with a 50-file rename.
 */
const filePreview = computed<string>(() => {
  const names = conflict.value.map((c) => c.name);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, +${names.length - 3} more`;
});

const originAllChecked = computed(() =>
  conflict.value.every((it) => it.checked.includes("origin"))
);
const destAllChecked = computed(() =>
  conflict.value.every((it) => it.checked.includes("dest"))
);

const close = () => layoutStore.closeHovers();

const humanSize = (size: number | undefined) =>
  size == undefined ? "Unknown size" : filesize(size);

const humanTime = (modified: string | number | undefined) =>
  modified == undefined ? "Unknown date" : dayjs(modified).format("L LT");

const verdictLabel = (item: ConflictingResource) => {
  if (item.checked.length === 2) {
    return isUploadAction.value ? "Conflict" : "Rename";
  }
  if (item.checked.length === 1 && item.checked[0] === "origin") {
    return "Override";
  }
  return "Skip";
};

const verdictTone = (item: ConflictingResource) => {
  if (item.checked.length === 2) {
    return isUploadAction.value ? "is-error" : "is-warn";
  }
  if (item.checked.length === 1 && item.checked[0] === "origin") {
    return "is-override";
  }
  return "is-skip";
};

const resume = (event: Event) => {
  conflict.value.forEach((item) => {
    item.checked = item.isSmallerOnServer ? ["origin"] : ["dest"];
  });
  currentPrompt?.confirm(event, conflict.value);
};

const resolve = (event: Event, result: Array<"origin" | "dest">) => {
  for (const item of conflict.value) item.checked = result;
  currentPrompt?.confirm(event, conflict.value);
};

const toogleCheckAll = (e: Event) => {
  const target = e.currentTarget as HTMLInputElement;
  const value = target.value as "origin" | "dest" | "both";
  const checked = target.checked;
  for (const item of conflict.value) {
    if (value == "both") {
      item.checked = ["origin", "dest"];
    } else {
      if (!item.checked.includes(value)) {
        if (checked) item.checked.push(value);
      } else if (!checked) {
        item.checked = value == "dest" ? ["origin"] : ["dest"];
      }
    }
  }
};
</script>

<style scoped>
.rc-prompt {
  width: 100%;
  max-width: 520px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: var(--font-sans, system-ui);
  color: var(--color-ink-1, #18181b);
  display: flex;
  flex-direction: column;
  max-height: min(640px, 85vh);
}

.rc-prompt__header {
  display: flex;
  gap: 14px;
  padding: 18px 18px 14px;
}

.rc-prompt__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  /* V2 #26: a conflict needs attention → amber, not the neutral lilac accent. */
  background: color-mix(in srgb, var(--c-amber) 16%, transparent);
  color: var(--c-amber);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rc-prompt__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.005em;
}

.rc-prompt__subtitle {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--color-ink-2, #52525b);
}

/* "Downloads/completed → Movies" — surfaces the source + destination
   folders so the user knows what's about to move where, not just how
   many files are colliding. */
.rc-prompt__context {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-ink-2, #52525b);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--color-elevated, #f4f4f5);
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.rc-prompt__context :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

/* Inline filename preview ("draft.txt, notes.md, +2 more") shown only
   in the quick-action view — saves a click into the personalized view
   just to find out WHICH files are conflicting. */
.rc-prompt__files {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-ink-3, #a1a1aa);
  word-break: break-all;
}

.rc-prompt__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px;
}

/* ── Per-item resolution list ──────────────────────────────────────── */
.rc-list__legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  border-bottom: 1px solid var(--color-line, #ececec);
  margin-bottom: 8px;
}

.rc-list__legend-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.rc-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.rc-item:last-child {
  border-bottom: 0;
}

.rc-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.rc-item__name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-ink-1, #18181b);
  word-break: break-all;
}

.rc-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.rc-chip.is-override {
  background: rgba(4, 120, 87, 0.12);
  color: #047857;
}
.rc-chip.is-skip {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
}
.rc-chip.is-warn {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
}
.rc-chip.is-error {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

/* J (2.4.0): "will be kept as" preview under the filename when the row
   resolves to keep-both. Amber-tinted to pair with the Rename verdict chip. */
.rc-item__keep-both {
  margin: -4px 0 8px;
  font-size: 11.5px;
  line-height: 1.4;
  color: #d97706;
  word-break: break-all;
}

.rc-item__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.rc-item__col {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  cursor: pointer;
  background: var(--color-surface, #fff);
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.rc-item__col:has(input:checked) {
  border-color: var(--color-accent, #5e6ad2);
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.06));
}

.rc-item__col-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11.5px;
  color: var(--color-ink-2, #52525b);
  min-width: 0;
}

.rc-item__col-size {
  color: var(--color-ink-3, #a1a1aa);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

/* ── Quick action buttons ──────────────────────────────────────────── */
.rc-quick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0 16px;
}

.rc-quick__btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-ink-1, #18181b);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.rc-quick__btn:hover {
  background: var(--color-elevated, #f4f4f5);
}

/* The "Decide for each" CTA — a solid GREEN fill ("go / take action") that
   reads on either theme. The previous amber darkened on the light surface to an
   unpleasant brown; green keeps the positive-action read at full contrast.
   - Light: the green token deepened (toward black) so the WHITE label clears
     AA contrast (#fff on ~#12823b ≈ 4.9:1).
   - Dark: the bright green token with a NEAR-BLACK label (white-on-bright-green
     would fail), giving a high-contrast "primary green button" look.
   Each :hover RE-DECLARES its own background: the generic `.rc-quick__btn:hover`
   rule (class + pseudo) out-specifies the `.rc-quick__btn--accent` base class
   and fills near-white, so without an explicit accent-hover background the
   button would wash out to an unreadable white on hover (the old bug). */
.rc-quick__btn--accent {
  background: color-mix(in srgb, var(--c-green) 80%, #000);
  border-color: color-mix(in srgb, var(--c-green) 80%, #000);
  color: #fff;
  font-weight: 600;
}
html.dark .rc-quick__btn--accent {
  background: var(--c-green);
  border-color: var(--c-green);
  color: #06281a;
}

.rc-quick__btn--accent:hover {
  background: color-mix(in srgb, var(--c-green) 70%, #000);
  border-color: color-mix(in srgb, var(--c-green) 70%, #000);
}
html.dark .rc-quick__btn--accent:hover {
  background: color-mix(in srgb, var(--c-green) 82%, #fff);
  border-color: color-mix(in srgb, var(--c-green) 82%, #fff);
}

.rc-quick__btn :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

/* The Decide button's icon matches its label colour (white on light, near-black
   on dark) — placed AFTER the generic grey rule so it wins on source order. */
.rc-quick__btn--accent :deep(svg) {
  color: #fff;
}
html.dark .rc-quick__btn--accent :deep(svg) {
  color: #06281a;
}

.rc-quick__tip {
  margin-left: auto;
  display: inline-flex;
  color: var(--color-ink-3, #a1a1aa);
  cursor: help;
}

/* ── Footer ────────────────────────────────────────────────────────── */
.rc-prompt__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

/* H9: Spacer separates the left-aligned Back nav button from the
   right-aligned Cancel + OK pair. Pure visual grouping — Back is
   navigation (return to prior view), the right side is commit/
   abort. */
.rc-prompt__actions-spacer {
  flex: 1;
}

/* H9: Back button gets an icon + label + a slightly inset left edge
   so it reads as navigation rather than a primary action. Same ghost
   chrome as Cancel for consistency. */
.rc-btn--back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-left: 8px;
  padding-right: 10px;
}

.rc-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.rc-btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.rc-btn--ghost {
  background: var(--color-surface, #fff);
  border-color: var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
}

.rc-btn--ghost:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}

.rc-btn--primary {
  background: var(--accent-gradient);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.rc-btn--primary:hover {
  background: var(--accent-gradient-strong);
  border-color: var(--color-accent-strong, #4f5ac4);
}
</style>
