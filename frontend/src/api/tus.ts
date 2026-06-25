import * as tus from "tus-js-client";
import { baseURL, tusEndpoint, tusSettings, origin } from "@/utils/constants";
import { useAuthStore } from "@/stores/auth";
import { removePrefix } from "@/api/utils";

const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 20000;
const CURRENT_UPLOAD_LIST: { [key: string]: tus.Upload } = {};

/** Upload progress callback. Both the XHR (`request.upload.onprogress`) and the
 *  TUS path invoke it with a ProgressEvent-shaped `{ loaded, total }` (bytes). */
export type UploadProgress = (event: { loaded: number; total: number }) => void;

export async function upload(
  filePath: string,
  content: ApiContent = "",
  overwrite = false,
  onupload: UploadProgress
) {
  if (!tusSettings) {
    // Shouldn't happen as we check for tus support before calling this function
    throw new Error("Tus.io settings are not defined");
  }

  filePath = removePrefix(filePath);
  const resourcePath = `${tusEndpoint}${filePath}?override=${overwrite}`;

  const authStore = useAuthStore();

  // Exit early because of typescript, tus content can't be a string
  if (content === "") {
    return false;
  }
  return new Promise<void | string>((resolve, reject) => {
    const upload = new tus.Upload(content, {
      endpoint: `${origin}${baseURL}${resourcePath}`,
      chunkSize: tusSettings.chunkSize,
      // `retryDelays` is what makes uploads RESUMABLE across a connection
      // drop: on a retryable failure the tus client waits the backoff,
      // re-HEADs the upload URL for the server's current `Upload-Offset`,
      // and continues the PATCH from there. Defaults: 5 retries, 10MB
      // chunks (settings/tus.go). The server's 3-min upload-cache TTL
      // comfortably outlasts the ~15s total backoff window.
      retryDelays: computeRetryDelays(tusSettings),
      parallelUploads: 1,
      // Resume is IN-SESSION only (a live drop → reconnect). We don't
      // persist the upload URL across reloads: the dock's queue state is
      // in-memory and lost on refresh, so there'd be nothing to resume
      // into. Keeping this false avoids leaving stale fingerprints in
      // localStorage. Cross-reload resume is a deferred feature, not a
      // hardening.
      storeFingerprintForResuming: false,
      headers: {
        "X-Auth": authStore.jwt,
      },
      onShouldRetry: function (err) {
        const status = err.originalResponse
          ? err.originalResponse.getStatus()
          : 0;

        // No HTTP response at all → a network drop / server unreachable.
        // THIS is the resume-on-reconnect path: keep retrying so the
        // client re-syncs the offset and continues when the link returns.
        if (status === 0) return true;

        // Terminal failures a retry can never fix — fail fast instead of
        // burning the full backoff budget (each delay up to 20s) before
        // surfacing the error:
        //   401 — token expired (this app renews only on load/login, not
        //         in the background, so a retry resends the same token)
        //   403 — permission denied
        //   404 — upload record gone (e.g. cache entry evicted)
        //   409 — conflict: file exists (POST) / offset mismatch (PATCH)
        //   413 — payload too large   415 — wrong content type
        const terminal = [401, 403, 404, 409, 413, 415];
        if (terminal.includes(status)) return false;

        // Everything else (5xx, 429, transient gateway errors) is exactly
        // what resumable uploads exist for — retry with backoff.
        return true;
      },
      onError: function (error: Error | tus.DetailedError) {
        delete CURRENT_UPLOAD_LIST[filePath];

        if (error.message === "Upload aborted") {
          return reject(error);
        }

        const message =
          error instanceof tus.DetailedError
            ? error.originalResponse === null
              ? "000 No connection"
              : error.originalResponse.getBody()
            : "Upload failed";

        console.error(error);

        reject(new Error(message));
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        if (typeof onupload === "function") {
          onupload({ loaded: bytesUploaded, total: bytesTotal });
        }
      },
      onSuccess: function () {
        delete CURRENT_UPLOAD_LIST[filePath];
        resolve();
      },
    });
    CURRENT_UPLOAD_LIST[filePath] = upload;
    upload.start();
  });
}

function computeRetryDelays(tusSettings: TusSettings): number[] | undefined {
  if (!tusSettings.retryCount || tusSettings.retryCount < 1) {
    // Disable retries altogether
    return undefined;
  }
  // The tus client expects our retries as an array with computed backoffs
  // E.g.: [0, 3000, 5000, 10000, 20000]
  const retryDelays = [];
  let delay = 0;

  for (let i = 0; i < tusSettings.retryCount; i++) {
    retryDelays.push(Math.min(delay, RETRY_MAX_DELAY));
    delay =
      delay === 0 ? RETRY_BASE_DELAY : Math.min(delay * 2, RETRY_MAX_DELAY);
  }

  return retryDelays;
}

export async function useTus(content: ApiContent) {
  return isTusSupported() && content instanceof Blob;
}

function isTusSupported() {
  return tus.isSupported === true;
}

export function abortAllUploads() {
  for (const filePath in CURRENT_UPLOAD_LIST) {
    if (CURRENT_UPLOAD_LIST[filePath]) {
      CURRENT_UPLOAD_LIST[filePath].abort(true);
      CURRENT_UPLOAD_LIST[filePath].options!.onError!(
        new Error("Upload aborted")
      );
    }
    delete CURRENT_UPLOAD_LIST[filePath];
  }
}

/**
 * Abort a single in-flight TUS upload by path (v1.3 H13). The key
 * matches the `CURRENT_UPLOAD_LIST` registry, which is keyed by the
 * prefix-stripped path (see `upload()` above). Returns true if a
 * matching upload was found + aborted. Mirrors abortAllUploads'
 * abort + manual onError so the awaiting `upload()` promise rejects
 * with "Upload aborted".
 */
export function abortUpload(filePath: string): boolean {
  const key = removePrefix(filePath);
  const up = CURRENT_UPLOAD_LIST[key];
  if (!up) return false;
  up.abort(true);
  up.options!.onError!(new Error("Upload aborted"));
  delete CURRENT_UPLOAD_LIST[key];
  return true;
}
