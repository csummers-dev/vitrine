<template>
  <Transition name="transfer-dock">
    <section
      v-if="visibleJobs.length > 0"
      class="transfer-dock"
      :style="{ bottom: dockBottom + 'px' }"
      role="region"
      aria-label="File transfers"
    >
      <header class="transfer-dock__head">
        <div class="transfer-dock__icon" :class="{ 'is-done': allDone }">
          <Icon v-if="allDone" name="check" :size="15" :stroke-width="2.5" />
          <Icon v-else name="arrow-right" :size="15" :stroke-width="2" />
        </div>
        <div class="transfer-dock__summary">
          <div class="transfer-dock__title">{{ headTitle }}</div>
          <div class="transfer-dock__head-meta">{{ headMeta }}</div>
        </div>
        <button
          type="button"
          class="transfer-dock__collapse"
          :class="{ 'is-collapsed': collapsed }"
          :aria-label="collapsed ? 'Expand transfers' : 'Collapse transfers'"
          @click="collapsed = !collapsed"
        >
          <Icon name="chevron-down" :size="16" :stroke-width="2" />
        </button>
      </header>

      <ul v-show="!collapsed" class="transfer-dock__list" role="list">
        <li
          v-for="job in visibleJobs"
          :key="job.id"
          class="transfer-dock__row"
          :class="rowClass(job)"
        >
          <div class="transfer-dock__row-head">
            <span class="transfer-dock__name" :title="rowName(job)">{{
              rowName(job)
            }}</span>
            <span class="transfer-dock__pct tabular">{{ rowRight(job) }}</span>
            <button
              v-if="job.retryable"
              type="button"
              class="transfer-dock__btn transfer-dock__btn--retry"
              :class="{ 'is-busy': isRetrying(job.id) }"
              :disabled="isRetrying(job.id)"
              aria-label="Retry transfer"
              title="Retry"
              @click="onRetry(job.id)"
            >
              <Icon name="rotate-cw" :size="13" :stroke-width="2" />
            </button>
            <button
              type="button"
              class="transfer-dock__btn"
              :aria-label="isActive(job) ? 'Cancel transfer' : 'Dismiss'"
              :title="isActive(job) ? 'Cancel' : 'Dismiss'"
              @click="isActive(job) ? cancel(job.id) : dismiss(job.id)"
            >
              <Icon name="x" :size="13" :stroke-width="2" />
            </button>
          </div>

          <div
            v-if="destLabel(job)"
            class="transfer-dock__path"
            :title="destLabel(job)"
          >
            {{ destLabel(job) }}
          </div>

          <div
            v-if="job.status === 'failed'"
            class="transfer-dock__note is-error"
          >
            {{ job.error || "Transfer failed" }}
          </div>
          <div
            v-else-if="job.status === 'canceled'"
            class="transfer-dock__note is-muted"
          >
            Canceled
          </div>
          <div
            v-else-if="job.status === 'interrupted'"
            class="transfer-dock__note is-muted"
          >
            Interrupted — server restarted
          </div>
          <div v-else class="transfer-dock__note">{{ subLabel(job) }}</div>

          <div
            class="transfer-dock__bar"
            role="progressbar"
            :aria-valuenow="percent(job)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="transfer-dock__bar-fill"
              :style="{ width: percent(job) + '%' }"
            />
          </div>
        </li>
      </ul>
    </section>
  </Transition>
</template>

<script setup lang="ts">
/**
 * TransferDock — floating progress dock for background move/copy jobs.
 *
 * Reads the singleton useTransfers store (which polls the server + survives
 * reloads) and renders one row per transfer: name, target path, current file,
 * "X of N", a progress bar + %, and a Cancel (running) / dismiss (done) button.
 *
 * Mounted once in the app shell (Layout.vue). Calls bootstrap() on mount to
 * rehydrate from the server. Sits bottom-LEFT to avoid the upload dock
 * (bottom-right) and the multi-select pill (bottom-center).
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useToast } from "vue-toastification";
import Icon from "@/components/Icon.vue";
import { filesize } from "@/utils";
import { transferPercent, type TransferJob } from "@/api/jobs";
import { useTransfers } from "@/composables/useTransfers";
import {
  isTransferRowVisible,
  shouldAutoSelectTransfer,
  transferTouchesFolder,
  rollingRate,
  etaSeconds,
  formatRate,
  formatEta,
  type RateSample,
} from "@/utils/transfers";
import { useFileStore } from "@/stores/file";
import { useUploadStore } from "@/stores/upload";

const { jobs, bootstrap, cancel, dismiss, retry } = useTransfers();
const fileStore = useFileStore();
const uploadStore = useUploadStore();
const toast = useToast();
const collapsed = ref(false);

onMounted(() => void bootstrap());

// Ids with a retry POST in flight — gates the button so a fast double-click
// can't fire two retries (each would re-run the same items and race on the
// destination). The row is only swapped once the POST resolves, so without this
// the button stays clickable in between. Reassigned (not mutated) so the
// template re-evaluates.
const retrying = ref<Set<string>>(new Set());
const isRetrying = (id: string): boolean => retrying.value.has(id);

// Re-run a failed / canceled / interrupted transfer. The store swaps the old
// row for a fresh running job; surface a toast if the retry POST itself fails
// (perm change, the source went away) so the click isn't silently swallowed.
const onRetry = async (id: string): Promise<void> => {
  if (retrying.value.has(id)) return; // already in flight — ignore the re-click
  retrying.value = new Set(retrying.value).add(id);
  try {
    await retry(id);
  } catch (e) {
    toast.error((e as Error)?.message || "Couldn't retry the transfer");
  } finally {
    const next = new Set(retrying.value);
    next.delete(id);
    retrying.value = next;
  }
};

// Both this dock and the upload dock anchor to the bottom-right corner. When an
// upload is in progress, sit ABOVE the upload dock (measured from its real
// height — it grows with the number of files — plus a small gap) so the two
// never overlap. No upload → the normal corner offset.
const GAP = 12;
const BASE_BOTTOM = 20;
const dockBottom = ref(BASE_BOTTOM);
let uploadResize: ResizeObserver | null = null;

const measureUploadOffset = () => {
  const el = document.querySelector<HTMLElement>(".upload-dock");
  dockBottom.value = el ? BASE_BOTTOM + el.offsetHeight + GAP : BASE_BOTTOM;
};

watch(
  () => uploadStore.activeUploads.size > 0,
  async (uploading) => {
    uploadResize?.disconnect();
    uploadResize = null;
    if (!uploading) {
      dockBottom.value = BASE_BOTTOM;
      return;
    }
    await nextTick();
    measureUploadOffset();
    const el = document.querySelector<HTMLElement>(".upload-dock");
    if (el && typeof ResizeObserver !== "undefined") {
      uploadResize = new ResizeObserver(measureUploadOffset);
      uploadResize.observe(el);
    }
  },
  { immediate: true }
);

const isActive = (j: TransferJob): boolean =>
  j.status === "queued" || j.status === "running";
const isTerminal = (s: TransferJob["status"]): boolean =>
  s === "completed" || s === "failed" || s === "canceled";

// When THIS client first observed each job, by the browser's own clock — the
// reveal gate for a running transfer is measured against this (see
// isTransferRowVisible), never the server's `createdAt`, so it's immune to
// server/client clock skew. Pruned as jobs leave the list so it can't grow.
const firstSeenAt = new Map<string, number>();
watch(
  jobs,
  (list) => {
    const now = Date.now();
    const live = new Set(list.map((j) => j.id));
    for (const id of firstSeenAt.keys()) {
      if (!live.has(id)) firstSeenAt.delete(id);
    }
    for (const j of list) {
      if (!firstSeenAt.has(j.id)) firstSeenAt.set(j.id, now);
    }
  },
  { immediate: true, deep: true }
);

// Re-evaluate the reveal gate on a FAST cadence while a transfer is active —
// `visibleJobs` only recomputes when its reactive deps change, and the data
// poll is a full second apart, which would delay a real transfer's row by up to
// a poll. This ticking `now` makes the row appear within ~a reveal-threshold of
// the transfer starting (effectively immediately). It runs only while something
// is active, so an idle dock costs nothing.
const now = ref(Date.now());
let revealTick: number | null = null;
const stopRevealTick = () => {
  if (revealTick !== null) {
    clearInterval(revealTick);
    revealTick = null;
  }
};
watch(
  () => jobs.value.some(isActive),
  (active) => {
    if (active && revealTick === null) {
      now.value = Date.now();
      revealTick = window.setInterval(() => (now.value = Date.now()), 120);
    } else if (!active) {
      stopRevealTick();
    }
  },
  { immediate: true }
);

const visibleJobs = computed(() =>
  jobs.value.filter((j) =>
    isTransferRowVisible(j, firstSeenAt.get(j.id), now.value)
  )
);

const activeCount = computed(() => visibleJobs.value.filter(isActive).length);
const allDone = computed(
  () => visibleJobs.value.length > 0 && activeCount.value === 0
);

const headTitle = computed(() =>
  activeCount.value > 0 ? "Transferring…" : "Transfers complete"
);
const headMeta = computed(() => {
  const active = activeCount.value;
  const done = jobs.value.length - active;
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} in progress`);
  if (done > 0) parts.push(`${done} done`);
  return parts.join(" · ");
});

const percent = (j: TransferJob): number =>
  j.status === "completed" ? 100 : transferPercent(j);

const rowName = (j: TransferJob): string =>
  j.name || `${j.itemCount} item${j.itemCount === 1 ? "" : "s"}`;

const rowRight = (j: TransferJob): string => {
  switch (j.status) {
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "interrupted":
      return "Interrupted";
    case "queued":
      return "Queued";
    default:
      return `${percent(j)}%`;
  }
};

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const destLabel = (j: TransferJob): string =>
  j.dest ? `→ ${safeDecode(j.dest)}` : "";

const subLabel = (j: TransferJob): string => {
  if (j.status === "queued") return "Waiting…";
  const parts: string[] = [];
  if (j.currentName) parts.push(safeDecode(j.currentName));
  if (j.fileCount > 1) parts.push(`${j.filesDone} of ${j.fileCount}`);
  if (j.totalBytes > 0) {
    parts.push(`${filesize(j.doneBytes)} / ${filesize(j.totalBytes)}`);
  }
  // Live throughput + ETA, only while actively running and once there's enough
  // signal for a rate (rollingRate returns 0 on a stall / too-few samples).
  if (j.status === "running" && j.totalBytes > 0) {
    const rate = rollingRate(rateSamples.get(j.id) ?? []);
    if (rate > 0) {
      parts.push(formatRate(rate, filesize));
      const eta = etaSeconds(j.doneBytes, j.totalBytes, rate);
      if (eta !== null) parts.push(formatEta(eta));
    }
  }
  return parts.join(" · ");
};

const rowClass = (j: TransferJob) => ({
  "is-done": j.status === "completed",
  "is-error": j.status === "failed",
  "is-canceled": j.status === "canceled",
  "is-interrupted": j.status === "interrupted",
});

// Auto-clear completed rows a few seconds after they finish (so the dock
// doesn't accumulate). Failed/canceled rows LINGER until the user dismisses
// them, so an error is never missed.
const prevStatus = new Map<string, TransferJob["status"]>();
const scheduled = new Set<string>();
const timers: number[] = [];

// Per-job completed-file counter + a throttle, so a long transfer refreshes the
// listing each time it finishes another file — items appear/disappear as the
// batch progresses instead of all at once when the whole job ends (the pain
// point when moving/copying many large files). Covers BOTH the source folder
// (a move empties it) and the destination folder (move OR copy fills it). The
// throttle is a single shared timestamp, which is correct because the jobs
// worker is sequential — only one transfer is ever active at a time.
const prevFilesDone = new Map<string, number>();
let lastTransferReloadAt = 0;
const TRANSFER_RELOAD_THROTTLE_MS = 900;

// Rolling byte-progress samples per running job, feeding the live throughput +
// ETA shown in the dock's subLabel (2.4.0 Stage 3 / I). Pruned when a job leaves
// the list and trimmed to a small tail — the rate window is only a few seconds.
const rateSamples = new Map<string, RateSample[]>();
const MAX_RATE_SAMPLES = 24;

// The folder currently on screen, in the decoded scope-relative namespace the
// transfer paths use. Derive it from a visible row when possible (exact same
// namespace as toPaths/fromPaths); fall back to req.path (normalized) for an
// empty folder — e.g. a fresh destination folder receiving its first file.
const currentFolderPath = (): string | null => {
  const sample = (fileStore.req?.items ?? []).find((it) => !!it.path)?.path;
  if (sample) {
    const i = sample.lastIndexOf("/");
    return i <= 0 ? "/" : sample.slice(0, i);
  }
  const p = fileStore.req?.path;
  if (typeof p !== "string" || p === "") return null;
  let s = p;
  try {
    s = decodeURIComponent(p);
  } catch {
    /* malformed escape — use the raw value */
  }
  if (!s.startsWith("/")) s = "/" + s;
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
};
watch(
  jobs,
  (list) => {
    // Drop bookkeeping for jobs that have left the list (dismissed / swept) so
    // these maps can't grow across a session. firstSeenAt is pruned in its own
    // watcher; a failed/canceled row the user dismisses manually never reaches
    // the completed-auto-dismiss path below, so prune both maps here.
    const live = new Set(list.map((j) => j.id));
    for (const id of prevStatus.keys()) {
      if (!live.has(id)) {
        prevStatus.delete(id);
        prevFilesDone.delete(id);
        rateSamples.delete(id);
      }
    }

    for (const j of list) {
      const prev = prevStatus.get(j.id);
      if (prev !== undefined && !isTerminal(prev) && isTerminal(j.status)) {
        // Select the items this transfer produced (its resolved destinations)
        // so a completed copy/move selects the new files the moment it settles
        // — whether you stayed put, used "open destination", or navigated to
        // the target folder and pasted. Queued via setPreselect; the reload
        // below consumes it. Only a SUCCESSFUL transfer produced files.
        //
        // Auto-select is gated by two conditions, both handled by
        // shouldAutoSelectTransfer (+ applyPreSelection):
        //  1. You must be VIEWING THE DESTINATION. If you're looking at a
        //     different folder none of the produced toPaths match the listing,
        //     so applyPreSelection selects nothing and your current selection is
        //     left intact. This covers a cross-volume copy you kicked off and
        //     then navigated away from — the new copies land unselected.
        //  2. You must NOT have MOVED ON — i.e. selected different file(s) while
        //     the transfer ran. Yanking that away mid-task is the disruption
        //     we're avoiding. "Moved on" = a non-empty current selection that
        //     isn't the transfer's own source items (fromPaths).
        if (j.status === "completed" && j.toPaths?.length) {
          const curSel = fileStore.selected
            .map((i) => fileStore.req?.items[i]?.path)
            .filter((p): p is string => !!p);
          if (shouldAutoSelectTransfer(j, curSel)) {
            fileStore.setPreselect(j.toPaths);
          }
        }
        // A job that just reached a terminal state moved/copied files — refresh
        // the current listing so the change settles (source + destination).
        fileStore.reload = true;
      }
      prevStatus.set(j.id, j.status);

      // Incremental refresh: while a transfer is still running, each time it
      // finishes another file the current folder may have changed — a moved item
      // left its source folder, or a new copy/move landed in the destination
      // folder we're viewing. Reload so rows appear/disappear as the batch
      // progresses, but ONLY when this transfer actually touches the folder on
      // screen (transferTouchesFolder), so an unrelated folder isn't churned;
      // throttled so a folder of many small files can't trigger a reload storm.
      // Scroll position is preserved across the reload (folder scroll memory) and
      // the refresh is silent + deferred while the user is mid-action (Files.vue).
      // The final state is covered by the terminal reload above.
      const seenDone = prevFilesDone.get(j.id) ?? 0;
      if (!isTerminal(j.status) && j.filesDone > seenDone) {
        const nowMs = Date.now();
        const folder = currentFolderPath();
        if (
          folder !== null &&
          transferTouchesFolder(j, folder) &&
          nowMs - lastTransferReloadAt >= TRANSFER_RELOAD_THROTTLE_MS
        ) {
          lastTransferReloadAt = nowMs;
          fileStore.reload = true;
        }
      }
      prevFilesDone.set(j.id, j.filesDone);

      // Record a byte-progress sample for the live throughput/ETA estimate while
      // a transfer is actively running with a known total. Trimmed to a short
      // tail (the rate window is only a few seconds); samples drop entirely once
      // the job leaves the list (pruned above).
      if (j.status === "running" && j.totalBytes > 0) {
        const arr = rateSamples.get(j.id) ?? [];
        arr.push({ t: Date.now(), bytes: j.doneBytes });
        if (arr.length > MAX_RATE_SAMPLES)
          arr.splice(0, arr.length - MAX_RATE_SAMPLES);
        rateSamples.set(j.id, arr);
      }

      if (j.status === "completed" && !scheduled.has(j.id)) {
        scheduled.add(j.id);
        timers.push(
          window.setTimeout(() => {
            void dismiss(j.id);
            scheduled.delete(j.id);
            prevStatus.delete(j.id);
            prevFilesDone.delete(j.id);
          }, 4000)
        );
      }
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  for (const t of timers) window.clearTimeout(t);
  stopRevealTick();
  uploadResize?.disconnect();
});
</script>

<style scoped>
.transfer-dock {
  position: fixed;
  /* Anchored bottom-RIGHT so it never overlaps the left sidebar (favorites,
     storage meter, account row). `bottom` is set inline and slides up to sit
     above the upload dock when an upload is in progress. */
  right: 20px;
  bottom: 20px;
  transition: bottom 0.16s ease;
  z-index: 1000;
  width: min(340px, calc(100vw - 40px));
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
html.dark .transfer-dock {
  box-shadow:
    0 20px 50px -12px rgba(0, 0, 0, 0.6),
    0 6px 12px -4px rgba(0, 0, 0, 0.4);
}

.transfer-dock__head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 10px 11px 13px;
}
.transfer-dock__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}
.transfer-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}
html.dark .transfer-dock__icon.is-done {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}
.transfer-dock__summary {
  flex: 1;
  min-width: 0;
}
.transfer-dock__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.transfer-dock__head-meta {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  margin-top: 1px;
}
.transfer-dock__collapse {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 7px;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color 0.12s ease,
    transform 0.18s ease;
}
.transfer-dock__collapse:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.transfer-dock__collapse.is-collapsed {
  transform: rotate(180deg);
}

.transfer-dock__list {
  list-style: none;
  margin: 0;
  padding: 0 12px 10px;
  max-height: 320px;
  overflow-y: auto;
}
.transfer-dock__row {
  padding: 9px 0;
  border-top: 1px solid var(--color-line, #ececec);
}
.transfer-dock__row:first-child {
  border-top: 0;
}
.transfer-dock__row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.transfer-dock__name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.transfer-dock__pct {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-ink-2, #52525b);
  flex-shrink: 0;
}
.transfer-dock__btn {
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  color: var(--color-ink-3, #a1a1aa);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}
.transfer-dock__btn:hover {
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
}
.transfer-dock__btn--retry {
  color: var(--color-accent, #5e6ad2);
}
.transfer-dock__btn--retry:hover {
  background: var(--color-accent-soft, rgba(94, 106, 210, 0.12));
  color: var(--color-accent, #5e6ad2);
}
.transfer-dock__btn--retry.is-busy {
  cursor: default;
  opacity: 0.55;
}
.transfer-dock__btn--retry.is-busy :deep(svg) {
  animation: transfer-retry-spin 0.7s linear infinite;
}
@keyframes transfer-retry-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .transfer-dock__btn--retry.is-busy :deep(svg) {
    animation: none;
  }
}
.transfer-dock__path {
  font-size: 11px;
  color: var(--color-accent, #5e6ad2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.transfer-dock__note {
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.transfer-dock__note.is-error {
  color: var(--color-danger, #dc2626);
}
.transfer-dock__note.is-muted {
  font-style: italic;
}

.transfer-dock__bar {
  height: 4px;
  margin-top: 7px;
  border-radius: 999px;
  background: var(--color-elevated, #f1f1f3);
  overflow: hidden;
}
.transfer-dock__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent, #5e6ad2);
  transition: width 0.3s ease;
}
.transfer-dock__row.is-done .transfer-dock__bar-fill {
  background: #10b981;
}
.transfer-dock__row.is-error .transfer-dock__bar-fill {
  background: var(--color-danger, #dc2626);
}
.transfer-dock__row.is-canceled .transfer-dock__bar-fill,
.transfer-dock__row.is-interrupted .transfer-dock__bar-fill {
  background: var(--color-ink-3, #a1a1aa);
}

/* Enter/leave */
.transfer-dock-enter-active,
.transfer-dock-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.transfer-dock-enter-from,
.transfer-dock-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (prefers-reduced-motion: reduce) {
  .transfer-dock__bar-fill,
  .transfer-dock__collapse,
  .transfer-dock-enter-active,
  .transfer-dock-leave-active {
    transition: none;
  }
}
</style>
