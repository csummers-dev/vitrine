/**
 * Audit log API client (v1.3 S8-1). Read-only, admin-only — the log is
 * populated server-side by the S1-5 events-bus subscriber. Entries come
 * back newest-first and paged; a `users` map (id → username) rides along
 * so the UI can show names without a second request.
 */
import { fetchJSON } from "./utils";

export interface AuditEntry {
  seq: number;
  timestamp: string;
  userId: number;
  action: string;
  path?: string;
  ip?: string;
  payload?: unknown;
}

export interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  users: Record<number, string>;
}

export interface AuditQuery {
  userId?: number;
  action?: string;
  /** RFC3339 timestamp or YYYY-MM-DD. */
  since?: string;
  until?: string;
  pathPrefix?: string;
  limit?: number;
  offset?: number;
}

export async function get(q: AuditQuery = {}): Promise<AuditResponse> {
  const params = new URLSearchParams();
  if (q.userId) params.set("userId", String(q.userId));
  if (q.action) params.set("action", q.action);
  if (q.since) params.set("since", q.since);
  if (q.until) params.set("until", q.until);
  if (q.pathPrefix) params.set("pathPrefix", q.pathPrefix);
  if (q.limit) params.set("limit", String(q.limit));
  if (q.offset) params.set("offset", String(q.offset));
  const qs = params.toString();
  return fetchJSON<AuditResponse>(`/api/audit${qs ? `?${qs}` : ""}`);
}
