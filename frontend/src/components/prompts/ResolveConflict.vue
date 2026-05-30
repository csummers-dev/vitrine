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
              : $t("prompts.fastConflictResolve", { count: conflict.length })
          }}
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
          <Icon name="check-check" :size="14" />
          <span>{{ $t("buttons.overrideAll") }}</span>
        </button>
        <button
          v-if="!isUploadAction"
          class="rc-quick__btn"
          @click="(e) => resolve(e, ['origin', 'dest'])"
        >
          <Icon name="copy" :size="14" />
          <span>{{ $t("buttons.renameAll") }}</span>
        </button>
        <button class="rc-quick__btn" @click="(e) => resolve(e, ['dest'])">
          <Icon name="undo-2" :size="14" />
          <span>{{ $t("buttons.skipAll") }}</span>
        </button>
        <button class="rc-quick__btn" @click="(e) => resume(e)">
          <Icon name="rotate-ccw" :size="14" />
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
import { filesize } from "@/utils";
import dayjs from "dayjs";

const layoutStore = useLayoutStore();
const { currentPrompt } = layoutStore;

const conflict = ref<ConflictingResource[]>(currentPrompt?.props.conflict);
const isUploadAction = ref<boolean | undefined>(
  currentPrompt?.props.isUploadAction
);
const personalized = ref(false);

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
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
  color: var(--color-accent, #5e6ad2);
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

.rc-quick__btn--accent {
  border-color: var(--color-line, #ececec);
  color: var(--color-accent, #5e6ad2);
}

.rc-quick__btn--accent:hover {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.08));
  border-color: var(--color-accent, #5e6ad2);
}

.rc-quick__btn :deep(svg) {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.rc-quick__btn--accent :deep(svg) {
  color: var(--color-accent, #5e6ad2);
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
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
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
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.rc-btn--primary:hover {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}
</style>
