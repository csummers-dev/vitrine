/**
 * useTransfers — singleton store for background move/copy jobs.
 *
 * Mirrors the server's per-user job list (active + recently-finished) and keeps
 * it fresh with a ~1s poll loop that runs ONLY while something is active. The
 * list is the source of truth for the floating transfer dock; because it's
 * rebuilt from the server on `bootstrap()` (app mount), in-progress transfers
 * survive a browser reload.
 *
 * Singleton (module-level state) so every surface — the dock, the trigger
 * buttons — shares one list and one poll loop.
 */
import { ref, computed } from "vue";
import * as jobsApi from "@/api/jobs";
import type { TransferJob, TransferItem, TransferKind } from "@/api/jobs";

const POLL_MS = 1000;

const jobs = ref<TransferJob[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let bootstrapped = false;

const isActiveStatus = (s: TransferJob["status"]): boolean =>
  s === "queued" || s === "running";

const hasActive = computed<boolean>(() =>
  jobs.value.some((j) => isActiveStatus(j.status))
);

function upsert(job: TransferJob): void {
  const i = jobs.value.findIndex((j) => j.id === job.id);
  if (i === -1) jobs.value.push(job);
  else jobs.value[i] = job;
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Start the poll loop when there's live work, stop it when there isn't — so an
// idle dock (only completed rows lingering) costs nothing.
function ensurePolling(): void {
  if (hasActive.value && pollTimer === null) {
    pollTimer = setInterval(() => void refresh(), POLL_MS);
  } else if (!hasActive.value) {
    stopPolling();
  }
}

async function refresh(): Promise<void> {
  try {
    jobs.value = await jobsApi.listJobs();
  } catch {
    // Network blip (or a 401, which fetchURL handles by logging out) — keep the
    // last snapshot; the next tick, if any, retries.
  }
  ensurePolling();
}

/**
 * Call once on app mount: rehydrate the dock from the server (so a transfer
 * survives a reload) and resume polling if anything is still running.
 */
async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  await refresh();
}

/** Start a transfer and show it immediately. Throws on rejection (perm /
 *  conflict) so the caller can surface it like any failed action. */
async function start(
  kind: TransferKind,
  items: TransferItem[]
): Promise<TransferJob> {
  const job = await jobsApi.startJob(kind, items);
  upsert(job);
  ensurePolling();
  return job;
}

/** Cancel an in-progress transfer (server cleans up the partial destination). */
async function cancel(id: string): Promise<void> {
  try {
    await jobsApi.cancelJob(id);
  } catch {
    /* already gone / not ours — refresh reconciles below */
  }
  await refresh();
}

/** Remove a finished transfer from the dock (and the server registry). */
async function dismiss(id: string): Promise<void> {
  // Optimistic: drop it locally so the row vanishes instantly.
  jobs.value = jobs.value.filter((j) => j.id !== id);
  ensurePolling();
  try {
    await jobsApi.dismissJob(id);
  } catch {
    /* terminal job already swept server-side — fine */
  }
}

export function useTransfers() {
  return { jobs, hasActive, bootstrap, start, cancel, dismiss, refresh };
}

/** Test helper: reset module-level state + stop the poll loop between tests. */
export function __resetTransfersForTests(): void {
  stopPolling();
  jobs.value = [];
  bootstrapped = false;
}
