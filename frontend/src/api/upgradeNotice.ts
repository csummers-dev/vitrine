import { fetchJSON, fetchURL } from "./utils";

/** A database upgrade, told to admins once (4.0 Phase 6, 5.7). */
export interface UpgradeNotice {
  /** Schema versions: 3 is vitrine 3.x, 4 is 4.0. */
  from: number;
  to: number;
  /** Where the copy of the old database was written. */
  backup: string;
  at: string;
}

/** The pending notice, or null. Admins only. */
export function get(): Promise<UpgradeNotice | null> {
  return fetchJSON<UpgradeNotice | null>("/api/upgrade-notice", {});
}

/** Dismiss it for good. */
export async function dismiss(): Promise<void> {
  await fetchURL("/api/upgrade-notice", { method: "DELETE" });
}
