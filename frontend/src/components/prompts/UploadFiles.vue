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

      <!-- Don't-close-this-tab hint (H8). Proactive messaging because
           the browser-native beforeunload dialog has hardcoded text we
           can't customize — this is the only way to tell the user
           ahead of time what's at stake if they refresh. Only shown
           while uploads are still pending. -->
      <div v-if="!isComplete" class="upload-dock__hint" role="note">
        <Icon name="info" :size="11" :stroke-width="2" />
        <span>Keep this window open until uploads finish.</span>
      </div>

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
           bar tinted to the file-type accent.
           Iterates `visibleUploads` (H7): active + queued, not just the
           5 in-flight. Scrolling kicks in once the list exceeds 280px. -->
      <Transition name="upload-dock__list">
        <ul v-if="open" class="upload-dock__list" role="list">
          <li
            v-for="upload in uploadStore.visibleUploads"
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
              <!-- Per-row cancel / remove (v1.3 H13). Hover- (and
                   focus-) visible. Active uploads → cancel the transfer;
                   queued uploads → drop from the queue. The store
                   handles reversing an active upload's progress + filling
                   the freed concurrency slot from the queue. -->
              <button
                type="button"
                class="upload-dock__file-remove"
                :title="
                  isActive(upload) ? 'Cancel upload' : 'Remove from queue'
                "
                :aria-label="
                  isActive(upload) ? 'Cancel upload' : 'Remove from queue'
                "
                @click.stop="removeUpload(upload)"
              >
                <Icon name="x" :size="12" :stroke-width="2" />
              </button>
            </div>
            <!-- Destination folder for this file, in smaller muted text under
                 the name. Useful when uploading a folder tree where files land
                 in different sub-directories. -->
            <div class="upload-dock__file-path" :title="targetDir(upload)">
              {{ targetDir(upload) }}
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
import { removePrefix } from "@/api/utils";
import { useFileStore } from "@/stores/file";
import { useUploadStore } from "@/stores/upload";
import { useRootLabel } from "@/composables/useRootLabel";
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
const { rootLabel } = useRootLabel();

const { sentBytes, totalBytes } = storeToRefs(uploadStore);

const byteToMbyte = partial({ exponent: 2 });
const byteToKbyte = partial({ exponent: 1 });

// v1.3 H10: read displayedPercent from the store rather than
// recomputing locally. The store value is phantom-counter-backed
// so the % doesn't slide backward when files are added to an
// in-progress queue.
const sentPercentNum = computed(() => uploadStore.displayedPercent);
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

// Destination folder for a row — the upload's full (URL-encoded) target path
// with the trailing file/folder name stripped, decoded for display. Useful
// when uploading a folder tree where files land in different sub-directories.
// V3-G #18: the root alias ("My files", or the user's custom nav.rootLabel) so
// a file dropped at the top level reads as "My files/" rather than a bare "/".
const rootDisplay = computed(() => rootLabel.value || t("sidebar.myFiles"));

const targetDir = (upload: Upload): string => {
  try {
    const rel = decodeURIComponent(removePrefix(upload.path)).replace(
      /\/+$/,
      ""
    );
    const slash = rel.lastIndexOf("/");
    // `rel` already carries its leading "/" from removePrefix (which strips only
    // the API prefix, not the root slash). V2 #1: the old `"/" + rel` added a
    // SECOND slash → "//folder/sub". Slice to the parent, keeping the one slash.
    const parent = slash > 0 ? rel.slice(0, slash) : "/";
    // V3-G #18: name the destination. Root → "My files/"; nested → the root
    // alias + the sub-path (parent starts with "/"), so every row shows a real
    // location instead of "/".
    return parent === "/"
      ? `${rootDisplay.value}/`
      : `${rootDisplay.value}${parent}`;
  } catch {
    return `${rootDisplay.value}/`;
  }
};

// v1.3 H13: per-row cancel / remove. `isActive` distinguishes an
// in-flight upload (cancel) from a still-queued one (remove) for the
// button's label; the store action handles both cases.
const isActive = (upload: Upload) => uploadStore.activeUploads.has(upload);
const removeUpload = (upload: Upload) => uploadStore.removeUpload(upload);

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
  transition: background-color var(--dur-base) ease;
}
.upload-dock__head:hover {
  background: var(--color-hover, rgba(24, 24, 27, 0.03));
}

.upload-dock__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.12));
  color: var(--color-accent, #6e72d9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color var(--dur-slow) ease,
    color var(--dur-slow) ease;
}
.upload-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.16);
  color: var(--status-success);
}
html.dark .upload-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.2);
  color: var(--status-success);
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
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.upload-dock__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.upload-dock__btn--danger:hover {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}
html.dark .upload-dock__btn--danger:hover {
  background: rgba(127, 29, 29, 0.25);
  color: var(--status-danger);
}
.upload-dock__btn:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
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
  background: var(--accent-gradient);
  transition:
    width var(--dur-slow) ease,
    background-color var(--dur-slow) ease;
  border-radius: 0 999px 999px 0;
}
.upload-dock__bar-fill.is-done {
  background: var(--status-success-fill);
}

/* Don't-close-this-tab hint (H8). Sits between the head and the
   aggregate bar; subtle but legible. Amber tinted because it's
   advisory, not destructive — the user CAN navigate, they should
   just know what happens if they do. */
.upload-dock__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 8px;
  font-size: 11px;
  color: var(--tag-color-amber-fg, #8a6a32);
  background: var(--tag-color-amber-bg, rgba(160, 125, 63, 0.08));
  border-top: 1px solid var(--color-line, #ececec);
  border-bottom: 1px solid var(--color-line, #ececec);
}

.upload-dock__hint :deep(svg) {
  flex-shrink: 0;
}

/* ── Per-file list ───────────────────────────────────────────────── */
.upload-dock__list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  /* Cap height so the dock stays a "card" rather than dominating the
     viewport, but give plenty of room for a long queue before
     scrolling kicks in. Was 280px (≈5 rows) — too cramped for the
     "queued 30 uploads" case the H7 fix surfaces. min() lets small
     viewports shrink gracefully without forcing a fixed pixel cap. */
  max-height: min(60vh, 480px);
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
  margin-bottom: 2px;
}

/* Destination folder, smaller + muted, aligned under the name (clearing the
   13px icon + 8px gap). Truncates with an ellipsis on long paths. */
.upload-dock__file-path {
  margin: 0 0 6px;
  padding-left: 21px;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--color-ink-3, #a1a1aa);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upload-dock__file-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}
.upload-dock__file[data-type="dir"] .upload-dock__file-icon {
  color: var(--color-accent, #6e72d9);
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

/* Per-row cancel / remove (v1.3 H13). Hidden until the row is hovered
   (or the button itself is keyboard-focused), so the list stays clean
   at rest but the affordance is one hover away. */
.upload-dock__file-remove {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-left: 2px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--dur-base) ease,
    background-color var(--dur-base) ease,
    color var(--dur-base) ease;
}
.upload-dock__file:hover .upload-dock__file-remove,
.upload-dock__file-remove:focus-visible {
  opacity: 1;
}
.upload-dock__file-remove:hover {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}
html.dark .upload-dock__file-remove:hover {
  background: rgba(127, 29, 29, 0.25);
  color: var(--status-danger);
}
.upload-dock__file-remove:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}

/* Touch devices have no hover — keep the control always visible so it's
   reachable. */
@media (hover: none) {
  .upload-dock__file-remove {
    opacity: 1;
  }
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
  background: var(--accent-gradient);
  transition: width var(--dur-slow) ease;
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
  /* Must match the base .upload-dock__list max-height so the
     expand/collapse animation doesn't clip the final state when the
     list is long. */
  max-height: min(60vh, 480px);
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
