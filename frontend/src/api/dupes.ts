import { fetchJSON, fetchURL, StatusError } from "./utils";

/** Duplicate finder (4.0 Phase 5.2). */
export interface DupeCopy {
  path: string;
  name: string;
  modified: string;
}

export interface DupeGroup {
  size: number;
  hash: string;
  files: DupeCopy[];
}

export interface DupeScanOptions {
  path: string;
  minSize: number;
  includeHidden: boolean;
  exclude: string[];
}

export interface DupeScan {
  id: string;
  path: string;
  options: DupeScanOptions;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  error?: string;
  progress: {
    phase: "listing" | "hashing" | "done";
    filesSeen: number;
    candidates: number;
    hashed: number;
    bytesRead: number;
  };
  startedAt: string;
  finishedAt?: string;
  result?: {
    groups: DupeGroup[] | null;
    reclaimable: number;
    filesSeen: number;
  };
}

export function startScan(opts: DupeScanOptions): Promise<DupeScan> {
  return fetchJSON<DupeScan>("/api/dupes/scan", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

/** The current scan, or null when there's none. */
export async function getScan(): Promise<DupeScan | null> {
  try {
    return await fetchJSON<DupeScan>("/api/dupes/scan");
  } catch (e) {
    if (e instanceof StatusError && e.status === 404) return null;
    throw e;
  }
}

export async function stopScan(): Promise<void> {
  await fetchURL("/api/dupes/scan", { method: "DELETE" });
}
