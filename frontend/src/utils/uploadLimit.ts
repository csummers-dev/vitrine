/**
 * Upload concurrency (4.0 Phase 5.4): each user picks how many files upload
 * at once (1–10, default 5) in Settings → Profile; an admin can cap it for
 * everyone in Global settings, so one user can't saturate a small NAS.
 */
export const UPLOAD_LIMIT_DEFAULT = 5;
export const UPLOAD_LIMIT_MAX = 10;
export const UPLOAD_LIMIT_PREF = "upload.concurrency";

/** The limit to use: the user's choice, clamped to 1..10 and the admin cap. */
export function effectiveUploadLimit(
  preference: unknown,
  adminCeiling: unknown
): number {
  const clamp = (v: unknown, fallback: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1
      ? Math.min(n, UPLOAD_LIMIT_MAX)
      : fallback;
  };
  return Math.min(
    clamp(preference, UPLOAD_LIMIT_DEFAULT),
    clamp(adminCeiling, UPLOAD_LIMIT_MAX)
  );
}
