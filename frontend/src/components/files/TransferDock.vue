<template>
  <Transition name="transfer-dock">
    <section
      v-if="visibleJobs.length > 0"
      class="transfer-dock"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import { filesize } from "@/utils";
import { transferPercent, type TransferJob } from "@/api/jobs";
import { useTransfers } from "@/composables/useTransfers";
import { isTransferRowVisible } from "@/utils/transfers";
import { useFileStore } from "@/stores/file";

const { jobs, bootstrap, cancel, dismiss } = useTransfers();
const fileStore = useFileStore();
const collapsed = ref(false);

onMounted(() => void bootstrap());

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

const visibleJobs = computed(() => {
  const now = Date.now();
  return jobs.value.filter((j) =>
    isTransferRowVisible(j, firstSeenAt.get(j.id), now)
  );
});

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
  return parts.join(" · ");
};

const rowClass = (j: TransferJob) => ({
  "is-done": j.status === "completed",
  "is-error": j.status === "failed",
  "is-canceled": j.status === "canceled",
});

// Auto-clear completed rows a few seconds after they finish (so the dock
// doesn't accumulate). Failed/canceled rows LINGER until the user dismisses
// them, so an error is never missed.
const prevStatus = new Map<string, TransferJob["status"]>();
const scheduled = new Set<string>();
const timers: number[] = [];
watch(
  jobs,
  (list) => {
    for (const j of list) {
      const prev = prevStatus.get(j.id);
      if (prev !== undefined && !isTerminal(prev) && isTerminal(j.status)) {
        // Select the items this transfer produced (its resolved destinations)
        // so a completed copy/move selects the new files the moment it settles
        // — whether you stayed put, used "open destination", or navigated to
        // the target folder and pasted. Queued via setPreselect; the reload
        // below consumes it. If you're viewing a different folder none of the
        // paths match and the current selection is left intact (see
        // applyPreSelection). Only a SUCCESSFUL transfer produced files.
        if (j.status === "completed" && j.toPaths?.length) {
          fileStore.setPreselect(j.toPaths);
        }
        // A job that just reached a terminal state moved/copied files — refresh
        // the current listing so the change settles (source + destination).
        fileStore.reload = true;
      }
      prevStatus.set(j.id, j.status);

      if (j.status === "completed" && !scheduled.has(j.id)) {
        scheduled.add(j.id);
        timers.push(
          window.setTimeout(() => {
            void dismiss(j.id);
            scheduled.delete(j.id);
            prevStatus.delete(j.id);
          }, 4000)
        );
      }
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  for (const t of timers) window.clearTimeout(t);
});
</script>

<style scoped>
.transfer-dock {
  position: fixed;
  left: 20px;
  bottom: 20px;
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
.transfer-dock__row.is-canceled .transfer-dock__bar-fill {
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
