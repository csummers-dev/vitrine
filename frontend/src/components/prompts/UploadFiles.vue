<template>
  <Transition name="upload-dock">
    <div
      v-if="uploadStore.activeUploads.size > 0"
      class="upload-dock"
      :class="{ 'upload-dock--collapsed': !open }"
      role="region"
      aria-label="Upload progress"
    >
      <!-- Header: summary + transport controls. Clickable to toggle the
           file list — most of the time the user just wants the summary,
           so we collapse to a compact pill by default. -->
      <header class="upload-dock__head" @click="toggle">
        <div class="upload-dock__icon" :class="{ 'is-done': isComplete }">
          <Icon v-if="isComplete" name="check" :size="16" :stroke-width="2.5" />
          <Icon v-else name="upload" :size="14" :stroke-width="2" />
        </div>

        <div class="upload-dock__summary">
          <div class="upload-dock__title">
            <template v-if="isComplete">Upload complete</template>
            <template v-else>
              {{
                $t("prompts.uploadFiles", {
                  files: uploadStore.pendingUploadCount,
                })
              }}
            </template>
          </div>
          <div class="upload-dock__meta">
            <template v-if="!isComplete">
              <span class="tabular">{{ sentPercent }}%</span>
              <span class="upload-dock__dot" aria-hidden="true">·</span>
              <span class="tabular">{{ speedText }}/s</span>
              <span class="upload-dock__dot" aria-hidden="true">·</span>
              <span class="tabular">{{ formattedETA }} left</span>
            </template>
            <template v-else>
              <span class="tabular">{{ totalMbytes }} uploaded</span>
            </template>
          </div>
        </div>

        <div class="upload-dock__actions">
          <button
            v-if="!isComplete"
            type="button"
            class="upload-dock__btn upload-dock__btn--danger"
            @click.stop="abortAll"
            aria-label="Cancel all uploads"
            title="Cancel all uploads"
          >
            <Icon name="x" :size="14" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="upload-dock__btn"
            @click.stop="toggle"
            :aria-label="open ? 'Collapse file list' : 'Expand file list'"
            :title="open ? 'Collapse file list' : 'Expand file list'"
          >
            <Icon
              :name="open ? 'chevron-down' : 'chevron-up'"
              :size="14"
              :stroke-width="2"
            />
          </button>
        </div>
      </header>

      <!-- Aggregate progress bar — always visible across the bottom of
           the header even when collapsed, so the user always sees motion
           and can gauge progress at a glance. -->
      <div
        class="upload-dock__bar"
        :aria-valuenow="sentPercentNum"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="upload-dock__bar-fill"
          :class="{ 'is-done': isComplete }"
          :style="{ width: sentPercent + '%' }"
        ></div>
      </div>

      <!-- Per-file list — only rendered when expanded. Each file gets its
           own row with a name, percentage, and slim individual progress
           bar tinted to the file-type accent. -->
      <Transition name="upload-dock__list">
        <ul v-if="open" class="upload-dock__list" role="list">
          <li
            v-for="upload in uploadStore.activeUploads"
            :key="upload.path"
            class="upload-dock__file"
            :data-type="upload.type"
          >
            <div class="upload-dock__file-head">
              <Icon
                :name="upload.type === 'dir' ? 'folder' : 'file'"
                :size="13"
                class="upload-dock__file-icon"
              />
              <span class="upload-dock__file-name" :title="upload.name">
                {{ upload.name }}
              </span>
              <span class="upload-dock__file-pct tabular">
                {{ filePercent(upload) }}%
              </span>
            </div>
            <div class="upload-dock__file-bar">
              <div
                class="upload-dock__file-bar-fill"
                :style="{ width: filePercent(upload) + '%' }"
              ></div>
            </div>
          </li>
        </ul>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * Upload dock — floating bottom-right card that surfaces in-progress
 * uploads. Designed to live alongside Toast notifications without
 * fighting them for screen space.
 *
 * UX choices:
 *  - Collapsed by default (just the summary pill). The user almost
 *    never needs the per-file breakdown; we expose it only on demand
 *    via the chevron.
 *  - The aggregate progress bar lives at the bottom edge of the head
 *    so even in collapsed state the user sees motion + percentage.
 *  - On completion the icon flips to a checkmark + the bar tints green
 *    for ~3 seconds before the card dismisses itself (via uploadStore
 *    clearing `activeUploads`).
 *  - Abort uses a confirm() instead of an in-card prompt — small enough
 *    flow that an extra Slide-over would be overkill, and confirm()
 *    bubbles to the OS-native dialog which is unmistakable.
 *
 * Stats math (speed / ETA) is unchanged from the legacy version — only
 * the chrome was rebuilt.
 */
import Icon from "@/components/Icon.vue";
import { useFileStore } from "@/stores/file";
import { useUploadStore } from "@/stores/upload";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import buttons from "@/utils/buttons";
import { useI18n } from "vue-i18n";
import { partial } from "filesize";

const { t } = useI18n({});

const open = ref<boolean>(false);
const speed = ref<number>(0);
const eta = ref<number>(Infinity);

const fileStore = useFileStore();
const uploadStore = useUploadStore();

const { sentBytes, totalBytes } = storeToRefs(uploadStore);

const byteToMbyte = partial({ exponent: 2 });
const byteToKbyte = partial({ exponent: 1 });

const sentPercentNum = computed(() => {
  if (!uploadStore.totalBytes) return 0;
  return (uploadStore.sentBytes / uploadStore.totalBytes) * 100;
});
const sentPercent = computed(() => sentPercentNum.value.toFixed(1));

const isComplete = computed(
  () =>
    uploadStore.totalBytes > 0 &&
    uploadStore.sentBytes >= uploadStore.totalBytes
);

const totalMbytes = computed(() => byteToMbyte(uploadStore.totalBytes));

const speedText = computed(() => {
  const bytes = speed.value;
  if (bytes < 1024 * 1024) {
    const kb = parseFloat(byteToKbyte(bytes));
    return `${kb.toFixed(1)} KB`;
  } else {
    const mb = parseFloat(byteToMbyte(bytes));
    return `${mb.toFixed(2)} MB`;
  }
});

const filePercent = (upload: { sentBytes: number; totalBytes: number }) => {
  if (!upload.totalBytes) return 0;
  return Math.min(100, (upload.sentBytes / upload.totalBytes) * 100).toFixed(0);
};

let lastSpeedUpdate: number = 0;
let recentSpeeds: number[] = [];
let lastThrottleTime = 0;

const throttledCalculateSpeed = (sentBytes: number, oldSentBytes: number) => {
  const now = Date.now();
  if (now - lastThrottleTime < 100) {
    return;
  }
  lastThrottleTime = now;
  calculateSpeed(sentBytes, oldSentBytes);
};

const calculateSpeed = (sentBytes: number, oldSentBytes: number) => {
  if (sentBytes === 0) {
    lastSpeedUpdate = 0;
    recentSpeeds = [];
    eta.value = Infinity;
    speed.value = 0;
    return;
  }

  const elapsedTime = (Date.now() - (lastSpeedUpdate ?? 0)) / 1000;
  const bytesSinceLastUpdate = sentBytes - oldSentBytes;
  const currentSpeed = bytesSinceLastUpdate / elapsedTime;

  recentSpeeds.push(currentSpeed);
  if (recentSpeeds.length > 5) {
    recentSpeeds.shift();
  }

  const recentSpeedsAverage =
    recentSpeeds.reduce((acc, curr) => acc + curr) / recentSpeeds.length;

  if (recentSpeeds.length === 1) {
    speed.value = currentSpeed;
  }

  speed.value = recentSpeedsAverage * 0.2 + speed.value * 0.8;
  lastSpeedUpdate = Date.now();
  calculateEta();
};

const calculateEta = () => {
  if (speed.value === 0) {
    eta.value = Infinity;
    return Infinity;
  }
  const remainingSize = uploadStore.totalBytes - uploadStore.sentBytes;
  eta.value = remainingSize / speed.value;
};

watch(sentBytes, throttledCalculateSpeed);

watch(totalBytes, (totalBytes, oldTotalBytes) => {
  if (oldTotalBytes !== 0) return;
  lastSpeedUpdate = Date.now();
});

const formattedETA = computed(() => {
  if (!eta.value || eta.value === Infinity) {
    return "--:--";
  }

  let totalSeconds = eta.value;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  // Drop the hours column when there are none — keeps the chip narrow
  // in the typical sub-hour case (most uploads finish in seconds-minutes).
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
});

const toggle = () => {
  open.value = !open.value;
};

const abortAll = () => {
  if (confirm(t("upload.abortUpload"))) {
    buttons.done("upload");
    open.value = false;
    uploadStore.abort();
    fileStore.reload = true;
  }
};
</script>

<style scoped>
/* ── Dock container ──────────────────────────────────────────────── */
.upload-dock {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1000;
  width: min(380px, calc(100vw - 40px));
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 20px 50px -12px rgba(0, 0, 0, 0.22),
    0 6px 12px -4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  font-family: var(--font-sans, system-ui);
  color: var(--color-ink-1, #18181b);
}

html.dark .upload-dock {
  box-shadow:
    0 20px 50px -12px rgba(0, 0, 0, 0.6),
    0 6px 12px -4px rgba(0, 0, 0, 0.4);
}

/* ── Head (clickable to toggle) ──────────────────────────────────── */
.upload-dock__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 12px 14px;
  cursor: pointer;
  user-select: none;
  transition: background-color 120ms ease;
}
.upload-dock__head:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.03));
}

.upload-dock__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color 200ms ease,
    color 200ms ease;
}
.upload-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}
html.dark .upload-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.upload-dock__summary {
  flex: 1;
  min-width: 0;
}
.upload-dock__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upload-dock__meta {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
  overflow: hidden;
  white-space: nowrap;
}
.upload-dock__dot {
  opacity: 0.5;
}

.upload-dock__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.upload-dock__btn {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.upload-dock__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.upload-dock__btn--danger:hover {
  background: #fef2f2;
  color: #b91c1c;
}
html.dark .upload-dock__btn--danger:hover {
  background: rgba(127, 29, 29, 0.25);
  color: #fca5a5;
}
.upload-dock__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(94, 106, 210, 0.3));
  outline-offset: 1px;
}

/* ── Aggregate progress bar ──────────────────────────────────────── */
.upload-dock__bar {
  height: 3px;
  width: 100%;
  background: var(--color-elevated, #f4f4f5);
  position: relative;
  overflow: hidden;
}
.upload-dock__bar-fill {
  height: 100%;
  background: var(--color-accent, #5e6ad2);
  transition:
    width 200ms ease,
    background-color 200ms ease;
  border-radius: 0 999px 999px 0;
}
.upload-dock__bar-fill.is-done {
  background: #10b981;
}

/* ── Per-file list ───────────────────────────────────────────────── */
.upload-dock__list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  max-height: 280px;
  overflow-y: auto;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
}

/* Scrollbar — minimal */
.upload-dock__list::-webkit-scrollbar {
  width: 6px;
}
.upload-dock__list::-webkit-scrollbar-thumb {
  background: var(--color-line, #ececec);
  border-radius: 3px;
}
.upload-dock__list::-webkit-scrollbar-thumb:hover {
  background: var(--color-ink-3, #a1a1aa);
}

.upload-dock__file {
  padding: 8px 14px;
}
.upload-dock__file + .upload-dock__file {
  border-top: 1px dashed transparent; /* avoid visual stacking */
}

.upload-dock__file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.upload-dock__file-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.upload-dock__file[data-type="dir"] .upload-dock__file-icon {
  color: var(--color-accent, #5e6ad2);
}
.upload-dock__file-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-ink-1, #18181b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.upload-dock__file-pct {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
}

.upload-dock__file-bar {
  height: 2px;
  width: 100%;
  background: var(--color-line, #ececec);
  border-radius: 999px;
  overflow: hidden;
}
.upload-dock__file-bar-fill {
  height: 100%;
  background: var(--color-accent, #5e6ad2);
  transition: width 200ms ease;
  border-radius: 999px;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

/* ── Enter/leave transitions ─────────────────────────────────────── */
.upload-dock-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.upload-dock-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.4, 0, 1, 1);
}
.upload-dock-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}
.upload-dock-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

/* Inner list expand/collapse */
.upload-dock__list-enter-active,
.upload-dock__list-leave-active {
  transition:
    max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease;
  overflow: hidden;
}
.upload-dock__list-enter-from,
.upload-dock__list-leave-to {
  max-height: 0;
  opacity: 0;
}
.upload-dock__list-enter-to,
.upload-dock__list-leave-from {
  max-height: 280px;
  opacity: 1;
}

/* Mobile — go full-width across the bottom edge with safe-area padding */
@media (max-width: 540px) {
  .upload-dock {
    right: 12px;
    left: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: auto;
  }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .upload-dock-enter-active,
  .upload-dock-leave-active,
  .upload-dock__list-enter-active,
  .upload-dock__list-leave-active,
  .upload-dock__bar-fill,
  .upload-dock__file-bar-fill,
  .upload-dock__icon {
    transition: none !important;
  }
}
</style>
