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

// Client-only "pending" rows (id-prefixed) shown the instant a transfer is
// initiated — before the POST that enqueues it even resolves — so the dock
// never waits on a round-trip. Swapped for the real server job once enqueued.
const PENDING_PREFIX = "pending:";
let pendingSeq = 0;

const jobs = ref<TransferJob[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let bootstrapped = false;

const isPending = (id: string): boolean => id.startsWith(PENDING_PREFIX);

function removeJob(id: string): void {
  jobs.value = jobs.value.filter((j) => j.id !== id);
}

/** A placeholder "running" row for the dock to show immediately, before the
 *  server assigns a real job. Progress fields are zeroed; it's replaced by the
 *  real job as soon as the enqueue POST returns. */
function makePending(kind: TransferKind, items: TransferItem[]): TransferJob {
  const to = items[0]?.to ?? "";
  const slash = to.lastIndexOf("/");
  return {
    id: PENDING_PREFIX + ++pendingSeq,
    kind,
    status: "running",
    name: items.length === 1 ? (to.split("/").pop() ?? "") : "",
    dest: slash > 0 ? to.slice(0, slash) : "",
    toPaths: [],
    // Carry the source paths even on the placeholder so the listing can shimmer
    // the moved item's name the instant the action starts (before the enqueue
    // POST returns) — items[].from is already scope-relative + decoded.
    fromPaths: items.map((it) => it.from),
    itemCount: items.length,
    totalBytes: 0,
    doneBytes: 0,
    fileCount: 0,
    filesDone: 0,
    currentName: "",
    currentTo: "",
    createdAt: new Date().toISOString(),
  };
}

const isActiveStatus = (s: TransferJob["status"]): boolean =>
  s === "queued" || s === "running";

const hasActive = computed<boolean>(() =>
  jobs.value.some((j) => isActiveStatus(j.status))
);

// Scope-relative source paths of every in-flight (queued/running) MOVE job, so
// the listing can mark the names of items currently being moved away with a
// shimmer. Copies are intentionally excluded — the user asked to flag in-flight
// moves, and a copy's source isn't going anywhere. This holds only the move's
// OWN source paths (a folder move lists the folder, not its contents); matching
// a row to it — exact OR descendant-of-a-moved-folder, so browsing into a moving
// folder lights up its subtree — is done by isPathInMove in utils/transfers.
// The Set recomputes only when the job list changes, and drops a job the moment
// it leaves the active set (settles, fails, or is canceled), stopping the
// shimmer on completion.
const movingPaths = computed<Set<string>>(() => {
  const set = new Set<string>();
  for (const j of jobs.value) {
    if (j.kind !== "move" || !isActiveStatus(j.status)) continue;
    for (const p of j.fromPaths ?? []) set.add(p);
  }
  return set;
});

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
    const server = await jobsApi.listJobs();
    // Keep any client-side pending placeholders the server doesn't know about
    // yet (their enqueue POST is still in flight) so a poll can't wipe them.
    const pending = jobs.value.filter((j) => isPending(j.id));
    jobs.value = [...pending, ...server];
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
  // Show a placeholder row IMMEDIATELY — synchronously, before the enqueue POST
  // round-trips — so the dock appears the instant the user acts, no matter how
  // long the request or the transfer takes.
  const pending = makePending(kind, items);
  upsert(pending);
  ensurePolling();
  try {
    const job = await jobsApi.startJob(kind, items);
    removeJob(pending.id);
    upsert(job);
    ensurePolling();
    // The enqueue snapshot is "queued" with no progress; pull the running
    // status + first bytes promptly (one quick refresh) instead of waiting a
    // whole poll interval, so the dock shows live progress right away.
    setTimeout(() => void refresh(), 150);
    return job;
  } catch (e) {
    removeJob(pending.id);
    ensurePolling();
    throw e;
  }
}

/** Cancel an in-progress transfer (server cleans up the partial destination). */
async function cancel(id: string): Promise<void> {
  // A pending placeholder has no server job yet — just drop it locally.
  if (isPending(id)) {
    removeJob(id);
    ensurePolling();
    return;
  }
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
  return {
    jobs,
    hasActive,
    movingPaths,
    bootstrap,
    start,
    cancel,
    dismiss,
    refresh,
  };
}

/** Test helper: reset module-level state + stop the poll loop between tests. */
export function __resetTransfersForTests(): void {
  stopPolling();
  jobs.value = [];
  bootstrapped = false;
}
