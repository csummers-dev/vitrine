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
