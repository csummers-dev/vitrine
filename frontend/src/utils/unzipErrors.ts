import { StatusError } from "@/api/utils";

/**
 * Map a zip-extraction failure into a single line of user-facing copy.
 *
 * The backend (PR #5746, `http/unzip.go`) returns plain-text error bodies
 * pulled from `errors/errors.go` (e.g. "the zip file is too large"). We
 * match on those strings so the UI can surface something more meaningful
 * than the raw backend text. Falls back to a generic catch-all for
 * unknown payloads so a bug in the mapper can't silence the error
 * entirely.
 *
 * If the backend ever changes its error wording these mappings will
 * silently regress to the catch-all — keep this file in lockstep with
 * the package-level error vars in `errors/errors.go`.
 */
export function mapUnzipError(err: unknown): string {
  // Network / transport-level failures land here as plain Error.
  if (err instanceof StatusError) {
    const msg = (err.message ?? "").toLowerCase();

    if (msg.includes("the zip file is too large")) {
      return "Archive is too large to extract (server limit reached).";
    }
    if (msg.includes("too high a decompression rate")) {
      return "Possible zip bomb detected — extraction blocked.";
    }
    if (msg.includes("invalid path in some files")) {
      return "Archive contains unsafe file paths.";
    }
    if (msg.includes("too high a decompression size")) {
      return "Archive contents would exceed the server's size limit.";
    }
    if (msg.includes("some files are invalid in zip archive")) {
      return "Archive is corrupt or malformed.";
    }

    // Status-based fallbacks for non-text payloads.
    const status = err.status ?? 0;
    if (status === 403) {
      return "You don't have permission to extract here.";
    }
    if (status === 404) {
      return "Archive not found.";
    }
    if (status >= 500) {
      return "Extraction failed — check the server logs for details.";
    }
    if (status === 400) {
      return "The archive couldn't be extracted.";
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return "Extraction failed.";
}

/**
 * Strip a single trailing `.zip` (case-insensitive) from a filename to
 * derive the auto-named subfolder. Matches the "extract into a new
 * folder" default behavior every native file manager uses.
 *
 * `photos-2024.zip` → `photos-2024`
 * `Backup.ZIP`     → `Backup`
 * `weird.tar.zip`  → `weird.tar`  (strip only the outermost .zip)
 * `noext`          → `noext`      (unchanged)
 */
export function deriveSubfolderName(filename: string): string {
  return filename.replace(/\.zip$/i, "");
}
