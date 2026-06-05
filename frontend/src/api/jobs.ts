/**
 * Background transfer (move/copy) jobs API — the client half of the job
 * subsystem (see docs/transfers-plan.md). A move/copy is started as a job that
 * runs server-side; the UI polls its progress and can cancel/dismiss it.
 */
import { fetchJSON, fetchURL } from "./utils";

export type TransferKind = "move" | "copy";
export type TransferStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** A server transfer job snapshot — mirrors the backend `jobs.JobView`. */
export interface TransferJob {
  id: string;
  kind: TransferKind;
  status: TransferStatus;
  /** Single-item base name, or "" for a batch (UI renders "N items"). */
  name: string;
  /** Destination directory shared by the items (for the "→ /Movies" hint). */
  dest: string;
  /** Resolved destination paths (scope-relative, decoded), with any "(1)"
   *  version suffix already applied — used to select the actual new copies. */
  toPaths?: string[];
  itemCount: number;
  totalBytes: number;
  doneBytes: number;
  fileCount: number;
  filesDone: number;
  currentName: string;
  currentTo: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

/** One source→destination pair. Paths are scope-relative + decoded; the caller
 *  is responsible for that formatting (this module only serializes). */
export interface TransferItem {
  from: string;
  to: string;
  overwrite?: boolean;
  rename?: boolean;
}

/** Start a background transfer; resolves with the job's initial snapshot. */
export async function startJob(
  kind: TransferKind,
  items: TransferItem[]
): Promise<TransferJob> {
  return fetchJSON<TransferJob>("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, items }),
  });
}

/** This user's active + recently-finished transfers (for reload rehydration). */
export async function listJobs(): Promise<TransferJob[]> {
  return fetchJSON<TransferJob[]>("/api/jobs");
}

// DELETE cancels an active transfer or dismisses a finished one — the server
// picks based on the job's state, so cancel + dismiss are the same call.
async function deleteJob(id: string): Promise<void> {
  await fetchURL(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export const cancelJob = deleteJob;
export const dismissJob = deleteJob;

/** Byte-based completion percentage (0–100). The dock treats a `completed`
 *  status as 100% regardless, to cover zero-byte / instant transfers. */
export function transferPercent(job: {
  totalBytes: number;
  doneBytes: number;
}): number {
  if (job.totalBytes <= 0) return job.doneBytes > 0 ? 100 : 0;
  return Math.min(100, Math.round((job.doneBytes / job.totalBytes) * 100));
}
