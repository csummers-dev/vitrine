/**
 * Two-factor sign-in (4.0 Phase 4.4): TOTP setup and management for the
 * signed-in user, and the admin reset.
 */
import { fetchJSON, fetchURL } from "./utils";

export interface TwoFactorStatus {
  /** False when the server's sign-in method doesn't use passwords. */
  available: boolean;
  enabled: boolean;
  recoveryCodesLeft: number;
}

export function status(): Promise<TwoFactorStatus> {
  return fetchJSON<TwoFactorStatus>("/api/2fa");
}

/** Start setup: a new secret and its otpauth:// link for a QR code. */
export function setup(): Promise<{ secret: string; uri: string }> {
  return fetchJSON("/api/2fa/setup", { method: "POST" });
}

/** Confirm with a code; returns the recovery codes (shown once). */
export async function enable(code: string): Promise<string[]> {
  const res = await fetchJSON<{ recoveryCodes: string[] }>("/api/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res.recoveryCodes;
}

export async function disable(password: string): Promise<void> {
  await fetchURL("/api/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function newRecoveryCodes(password: string): Promise<string[]> {
  const res = await fetchJSON<{ recoveryCodes: string[] }>(
    "/api/2fa/recovery",
    { method: "POST", body: JSON.stringify({ password }) }
  );
  return res.recoveryCodes;
}

/** Admin: does this user have two-factor sign-in? */
export async function userStatus(id: number): Promise<boolean> {
  const res = await fetchJSON<{ enabled: boolean }>(`/api/users/${id}/2fa`);
  return res.enabled;
}

/** Admin: remove a user's second factor. */
export async function reset(id: number): Promise<void> {
  await fetchURL(`/api/users/${id}/2fa`, { method: "DELETE" });
}
