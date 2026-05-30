<template>
  <div class="info-prompt" @click.stop>
    <div class="info-prompt__header">
      <div class="info-prompt__icon" :class="iconColorClass">
        <Icon
          :name="iconName"
          :size="22"
          :stroke-width="1.5"
          style="fill: currentColor"
        />
      </div>
      <div class="info-prompt__title-block">
        <div class="info-prompt__eyebrow">
          {{
            selected.length > 1
              ? $t("prompts.filesSelected", { count: selected.length })
              : dir
                ? "Folder"
                : "File"
          }}
        </div>
        <h2 class="info-prompt__title" :title="name">{{ name }}</h2>
      </div>
    </div>

    <div class="info-prompt__body">
      <!-- Properties -->
      <div class="info-prompt__section">
        <div class="info-prompt__section-title">Properties</div>
        <dl class="info-prompt__list">
          <div v-if="!dir || selected.length > 1" class="info-prompt__row">
            <dt>{{ $t("prompts.size") }}</dt>
            <dd class="tabular">{{ humanSize }}</dd>
          </div>
          <div v-if="resolution" class="info-prompt__row">
            <dt>{{ $t("prompts.resolution") }}</dt>
            <dd class="tabular">
              {{ resolution.width }} × {{ resolution.height }}
            </dd>
          </div>
          <div
            v-if="selected.length < 2"
            class="info-prompt__row"
            :title="modTime"
          >
            <dt>{{ $t("prompts.lastModified") }}</dt>
            <dd class="tabular">{{ humanTime }}</dd>
          </div>
          <template v-if="dir && selected.length === 0">
            <div class="info-prompt__row">
              <dt>{{ $t("prompts.numberFiles") }}</dt>
              <dd class="tabular">{{ req.numFiles }}</dd>
            </div>
            <div class="info-prompt__row">
              <dt>{{ $t("prompts.numberDirs") }}</dt>
              <dd class="tabular">{{ req.numDirs }}</dd>
            </div>
          </template>
        </dl>
      </div>

      <!-- Checksums (files only) -->
      <div v-if="!dir" class="info-prompt__section">
        <div class="info-prompt__section-title">Checksums</div>
        <dl class="info-prompt__list">
          <div
            v-for="algo in CHECKSUM_ALGOS"
            :key="algo"
            class="info-prompt__row info-prompt__row--checksum"
          >
            <dt>{{ algo.toUpperCase() }}</dt>
            <dd>
              <button
                v-if="!checksums[algo] && !loadingAlgo[algo]"
                type="button"
                class="info-prompt__show-btn"
                @click="loadChecksum(algo)"
              >
                {{ $t("prompts.show") }}
              </button>
              <span v-else-if="loadingAlgo[algo]" class="info-prompt__loading">
                <Icon
                  name="loader-circle"
                  :size="12"
                  class="info-prompt__spin"
                />
                Computing…
              </span>
              <code
                v-else
                class="info-prompt__hash"
                :title="checksums[algo]"
                @click="copyChecksum(checksums[algo])"
              >
                {{ checksums[algo] }}
              </code>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="info-prompt__actions">
      <button
        id="focus-prompt"
        type="button"
        class="info-prompt__btn info-prompt__btn--primary"
        @click="layoutStore.closeHovers"
      >
        {{ $t("buttons.ok") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, reactive } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { filesize } from "@/utils";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";
import { copy } from "@/utils/clipboard";
import dayjs from "dayjs";
import { files as api } from "@/api";
import Icon from "@/components/Icon.vue";

const { t } = useI18n();
void t;
const fileStore = useFileStore();
const layoutStore = useLayoutStore();
const route = useRoute();

const $showError = inject<IToastError>("$showError")!;
const $showSuccess = inject<IToastSuccess>("$showSuccess")!;

const CHECKSUM_ALGOS = ["md5", "sha1", "sha256", "sha512"] as const;
type ChecksumAlgo = (typeof CHECKSUM_ALGOS)[number];

const checksums = reactive<Record<ChecksumAlgo, string>>({
  md5: "",
  sha1: "",
  sha256: "",
  sha512: "",
});
const loadingAlgo = reactive<Record<ChecksumAlgo, boolean>>({
  md5: false,
  sha1: false,
  sha256: false,
  sha512: false,
});

const req = computed(() => fileStore.req!);
const selected = computed(() => fileStore.selected);
const selectedCount = computed(() => fileStore.selectedCount);
const isListing = computed(() => fileStore.isListing);

const dir = computed(() => {
  if (selectedCount.value > 1) return true;
  if (selectedCount.value === 0) return !!req.value?.isDir;
  return !!req.value?.items[selected.value[0]]?.isDir;
});

const name = computed(() =>
  selectedCount.value === 0
    ? (req.value?.name ?? "")
    : (req.value?.items[selected.value[0]]?.name ?? "")
);

const itemType = computed(() => {
  if (selectedCount.value === 0) return req.value?.type;
  return req.value?.items[selected.value[0]]?.type;
});

const iconName = computed(() =>
  fileIcon({ isDir: dir.value, type: itemType.value, name: name.value })
);
const iconColorClass = computed(() =>
  fileIconColor({ isDir: dir.value, type: itemType.value, name: name.value })
);

const humanSize = computed(() => {
  if (selectedCount.value === 0 || !isListing.value) {
    return filesize(req.value?.size ?? 0);
  }
  let sum = 0;
  for (const i of selected.value) sum += req.value?.items[i]?.size ?? 0;
  return filesize(sum);
});

const humanTime = computed(() => {
  const modified =
    selectedCount.value === 0
      ? req.value?.modified
      : req.value?.items[selected.value[0]]?.modified;
  return dayjs(modified).fromNow();
});

const modTime = computed(() => {
  const modified =
    selectedCount.value === 0
      ? req.value?.modified
      : req.value?.items[selected.value[0]]?.modified;
  return modified ? new Date(Date.parse(modified)).toLocaleString() : "";
});

const resolution = computed<{ width: number; height: number } | null>(() => {
  if (selectedCount.value === 1) {
    const item = req.value?.items[selected.value[0]];
    if (item?.type === "image") return (item as any).resolution ?? null;
  } else if (req.value?.type === "image") {
    return (req.value as any).resolution ?? null;
  }
  return null;
});

const loadChecksum = async (algo: ChecksumAlgo) => {
  loadingAlgo[algo] = true;
  const link =
    selectedCount.value > 0
      ? req.value?.items[selected.value[0]]?.url
      : route.path;
  try {
    const hash = await api.checksum(link, algo);
    checksums[algo] = hash;
  } catch (e) {
    if (e instanceof Error) $showError(e);
  } finally {
    loadingAlgo[algo] = false;
  }
};

const copyChecksum = async (text: string) => {
  if (!text) return;
  try {
    await copy({ text });
    $showSuccess("Checksum copied to clipboard");
  } catch {
    /* swallow — user can select+copy manually */
  }
};
</script>

<style scoped>
.info-prompt {
  width: 100%;
  max-width: 480px;
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
  max-height: min(620px, 85vh);
}

.info-prompt__header {
  display: flex;
  gap: 14px;
  padding: 18px 18px 14px;
}

.info-prompt__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.info-prompt__title-block {
  flex: 1;
  min-width: 0;
}

.info-prompt__eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 2px;
}

.info-prompt__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.005em;
  color: var(--color-ink-1, #18181b);
  word-break: break-word;
  line-height: 1.3;
}

/* ── Body ──────────────────────────────────────────────────────────── */
.info-prompt__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-prompt__section {
  padding-bottom: 4px;
}

.info-prompt__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
  margin-bottom: 6px;
}

.info-prompt__list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.info-prompt__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
  font-size: 12.5px;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.info-prompt__row:last-child {
  border-bottom: 0;
}

.info-prompt__row dt {
  color: var(--color-ink-3, #a1a1aa);
  font-weight: 500;
}

.info-prompt__row dd {
  margin: 0;
  color: var(--color-ink-1, #18181b);
  text-align: right;
  min-width: 0;
}

.info-prompt__row dd.tabular {
  font-variant-numeric: tabular-nums;
}

/* Checksum row needs more room since the hash is long */
.info-prompt__row--checksum {
  align-items: flex-start;
}

.info-prompt__row--checksum dt {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding-top: 2px;
}

.info-prompt__show-btn {
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-accent, #5e6ad2);
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.info-prompt__show-btn:hover {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.1));
}

.info-prompt__loading {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}

.info-prompt__spin {
  animation: info-spin 0.9s linear infinite;
}

@keyframes info-spin {
  to {
    transform: rotate(360deg);
  }
}

.info-prompt__hash {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--color-ink-2, #52525b);
  word-break: break-all;
  cursor: copy;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-canvas, #fafaf9);
  border: 1px solid var(--color-line, #ececec);
  line-height: 1.4;
  display: inline-block;
  max-width: 100%;
}

.info-prompt__hash:hover {
  background: var(--color-elevated, #f4f4f5);
}

/* ── Footer ────────────────────────────────────────────────────────── */
.info-prompt__actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

.info-prompt__btn {
  height: 30px;
  padding: 0 14px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.info-prompt__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

.info-prompt__btn--primary {
  background: var(--color-accent, #5e6ad2);
  border-color: var(--color-accent, #5e6ad2);
  color: white;
}

.info-prompt__btn--primary:hover {
  background: var(--color-accent-strong, #4f5ac4);
  border-color: var(--color-accent-strong, #4f5ac4);
}
</style>
