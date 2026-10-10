/**
 * Webhooks API client (v1.3 S8-2). Admin-only CRUD + test over the
 * admin-global webhook endpoints. The server fires deliveries from its
 * events-bus subscriber; this client only manages config.
 */
import { fetchJSON, fetchURL } from "./utils";

export interface WebhookEndpoint {
  id: string;
  url: string;
  enabled: boolean;
  /** Per-endpoint event-type filter; empty = all file events. */
  events: string[];
  /** "" (generic POST) or "jellyfin" (library refresh). 4.0 4.3. */
  kind?: string;
  /** Only changes in these folders; empty = everywhere. */
  paths?: string[];
  /** May reach private / loopback addresses (LAN services). */
  allowLocal?: boolean;
  /** Deliveries are signed (X-Vitrine-Signature). */
  hasSecret?: boolean;
  /** A Jellyfin API key is saved. */
  hasApiKey?: boolean;
  lastStatus?: string; // "" | "success" | "failed"
  lastCode?: number;
  lastError?: string;
  lastAt?: string;
}

export interface WebhookListResponse {
  endpoints: WebhookEndpoint[];
  eventTypes: string[];
}

export interface WebhookInput {
  url: string;
  enabled: boolean;
  events: string[];
  kind?: string;
  paths?: string[];
  allowLocal?: boolean;
  /** Jellyfin API key; omit or "" to keep the saved one. */
  apiKey?: string;
}

/** The editable part of a saved endpoint, for updates that change one
 *  field (e.g. the enabled toggle) without dropping the rest. */
export function inputOf(ep: WebhookEndpoint): WebhookInput {
  return {
    url: ep.url,
    enabled: ep.enabled,
    events: ep.events ?? [],
    kind: ep.kind ?? "",
    paths: ep.paths ?? [],
    allowLocal: !!ep.allowLocal,
  };
}

export interface WebhookTestResult {
  ok: boolean;
  code: number;
  error?: string;
}

export async function list(): Promise<WebhookListResponse> {
  return fetchJSON<WebhookListResponse>("/api/webhooks", {});
}

export async function create(input: WebhookInput): Promise<WebhookEndpoint> {
  return fetchJSON<WebhookEndpoint>("/api/webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function update(
  id: string,
  input: WebhookInput
): Promise<WebhookEndpoint> {
  return fetchJSON<WebhookEndpoint>(`/api/webhooks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function remove(id: string): Promise<void> {
  await fetchURL(`/api/webhooks/${id}`, { method: "DELETE" });
}

export async function test(id: string): Promise<WebhookTestResult> {
  return fetchJSON<WebhookTestResult>(`/api/webhooks/${id}/test`, {
    method: "POST",
  });
}

/** Create or rotate the signing secret; it is returned only this once. */
export async function rotateSecret(id: string): Promise<string> {
  const res = await fetchJSON<{ secret: string }>(
    `/api/webhooks/${id}/secret`,
    { method: "POST" }
  );
  return res.secret;
}

/** Stop signing deliveries. */
export async function removeSecret(id: string): Promise<void> {
  await fetchURL(`/api/webhooks/${id}/secret`, { method: "DELETE" });
}
