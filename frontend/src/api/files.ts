import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { baseURL } from "@/utils/constants";
import {
  upload as postTus,
  useTus,
  abortUpload as abortTus,
  type UploadProgress,
} from "./tus";
import { createURL, fetchURL, removePrefix, StatusError } from "./utils";
import { isEncodableResponse, makeRawResource } from "@/utils/encodings";

export async function fetch(url: string, signal?: AbortSignal) {
  const encoding = isEncodableResponse(url);
  url = removePrefix(url);
  const res = await fetchURL(`/api/resources${url}`, {
    signal,
    headers: {
      "X-Encoding": encoding ? "true" : "false",
    },
  });

  let data: Resource;
  try {
    if (res.headers.get("Content-Type") == "application/octet-stream") {
      data = await makeRawResource(res, url);
    } else {
      data = (await res.json()) as Resource;
    }
  } catch (e) {
    // Check if the error is an intentional cancellation
    if (e instanceof Error && e.name === "AbortError") {
      throw new StatusError("000 No connection", 0, true);
    }
    throw e;
  }
  data.url = `/files${url}`;

  if (data.isDir) {
    if (!data.url.endsWith("/")) data.url += "/";
    data.items = data.items.map((item: ResourceItem, index: number) => {
      item.index = index;
      item.url = `${data.url}${encodeURIComponent(item.name)}`;

      if (item.isDir) {
        item.url += "/";
      }

      return item;
    });
  }

  return data;
}

export async function fetchAll(url: string): Promise<RecursiveEntry[]> {
  url = removePrefix(url);
  const res = await fetchURL(`/api/resources/recursive${url}`, {});
  return (await res.json()) as RecursiveEntry[];
}

async function resourceAction(
  url: string,
  method: ApiMethod,
  content?: BodyInit
) {
  url = removePrefix(url);

  const opts: ApiOpts = {
    method,
  };

  if (content) {
    opts.body = content;
  }

  const res = await fetchURL(`/api/resources${url}`, opts);

  return res;
}

/**
 * Delete a resource. By default the backend MOVES it to the trash (2.4.0
 * Stage 2) and answers `{ trashId }` — returned here so the undo toast can
 * restore it. With `permanent: true` (Shift+Delete, the Trash view) the item
 * is removed for good and the result is null (204, no body).
 */
export async function remove(
  url: string,
  permanent = false
): Promise<{ trashId: string } | null> {
  const res = await resourceAction(
    permanent ? `${url}?permanent=true` : url,
    "DELETE"
  );
  try {
    const body = await res.json();
    return body && typeof body.trashId === "string" ? body : null;
  } catch {
    return null;
  }
}

export async function put(url: string, content = "") {
  return resourceAction(url, "PUT", content);
}

export function download(format: DownloadFormat, ...files: string[]) {
  let url = `${baseURL}/api/raw`;

  if (files.length === 1) {
    url += removePrefix(files[0]) + "?";
  } else {
    let arg = "";

    for (const file of files) {
      arg += removePrefix(file) + ",";
    }

    arg = arg.substring(0, arg.length - 1);
    arg = encodeURIComponent(arg);
    url += `/?files=${arg}&`;
  }

  if (format) {
    url += `algo=${format}&`;
  }

  // window.open() navigates the browser, which can't send the X-Auth header,
  // so the JWT has to ride along as ?auth= (same as the media URLs — see
  // authParam / RC-18). Without it the raw endpoint 401s — most visibly on the
  // multi-file zip path, where there's no per-file cookie scope to fall back on.
  const jwt = useAuthStore().jwt;
  if (jwt) url += `auth=${jwt}`;

  window.open(url);
}

export async function post(
  url: string,
  content: ApiContent = "",
  overwrite = false,
  onupload: UploadProgress = () => {}
) {
  // Use the pre-existing API if:
  const useResourcesApi =
    // a folder is being created
    url.endsWith("/") ||
    // We're not using http(s)
    (content instanceof Blob &&
      !["http:", "https:"].includes(window.location.protocol)) ||
    // Tus is disabled / not applicable
    !(await useTus(content));
  return useResourcesApi
    ? postResources(url, content, overwrite, onupload)
    : postTus(url, content, overwrite, onupload);
}

// v1.3 H13: registry of in-flight non-TUS (XHR) uploads, keyed by the
// prefix-stripped path, so a single upload can be aborted by path
// (the dock's per-row cancel). TUS uploads have their own registry in
// tus.ts; `cancelUpload` below tries both.
const CURRENT_XHR_LIST: Record<string, XMLHttpRequest> = {};

async function postResources(
  url: string,
  content: ApiContent = "",
  overwrite = false,
  onupload: UploadProgress
) {
  url = removePrefix(url);

  let bufferContent: ArrayBuffer;
  if (
    content instanceof Blob &&
    !["http:", "https:"].includes(window.location.protocol)
  ) {
    bufferContent = await new Response(content).arrayBuffer();
  }

  const authStore = useAuthStore();
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `${baseURL}/api/resources${url}?override=${overwrite}`,
      true
    );
    request.setRequestHeader("X-Auth", authStore.jwt);

    if (typeof onupload === "function") {
      request.upload.onprogress = onupload;
    }

    CURRENT_XHR_LIST[url] = request;

    request.onload = () => {
      delete CURRENT_XHR_LIST[url];
      if (request.status === 200) {
        resolve(request.responseText);
      } else if (request.status === 409) {
        reject(new Error(request.status.toString()));
      } else {
        reject(new Error(request.responseText));
      }
    };

    request.onerror = () => {
      delete CURRENT_XHR_LIST[url];
      reject(new Error("001 Connection aborted"));
    };

    // request.abort() fires `onabort` (NOT `onerror`), so we reject
    // here with the same sentinel the store + tus path use so callers
    // can swallow user-initiated cancels uniformly.
    request.onabort = () => {
      delete CURRENT_XHR_LIST[url];
      reject(new Error("Upload aborted"));
    };

    request.send(bufferContent || content);
  });
}

/**
 * Cancel a single in-flight upload by path (v1.3 H13). Tries the TUS
 * registry first (the primary upload path on http/https), then the
 * XHR fallback. No-op if neither has a matching in-flight upload.
 */
export function cancelUpload(path: string) {
  if (abortTus(path)) return;
  const key = removePrefix(path);
  const req = CURRENT_XHR_LIST[key];
  if (req) req.abort();
}

interface MoveCopyItem {
  from: string;
  to?: string;
  name?: string;
  overwrite?: boolean;
  rename?: boolean;
}

function moveCopy(
  items: MoveCopyItem[],
  copy = false,
  overwrite = false,
  rename = false
) {
  const layoutStore = useLayoutStore();
  const promises = [];

  for (const item of items) {
    const from = item.from;
    const to = encodeURIComponent(removePrefix(item.to ?? ""));
    const finalOverwrite =
      item.overwrite == undefined ? overwrite : item.overwrite;
    const finalRename = item.rename == undefined ? rename : item.rename;
    const url = `${from}?action=${
      copy ? "copy" : "rename"
    }&destination=${to}&override=${finalOverwrite}&rename=${finalRename}`;
    promises.push(resourceAction(url, "PATCH"));
  }
  layoutStore.closeHovers();
  return Promise.all(promises);
}

export function move(items: MoveCopyItem[], overwrite = false, rename = false) {
  return moveCopy(items, false, overwrite, rename);
}

export function copy(items: MoveCopyItem[], overwrite = false, rename = false) {
  return moveCopy(items, true, overwrite, rename);
}

/**
 * Extract a `.zip` archive on the server.
 *
 * Adapted from upstream PR #5746 — rewritten to use `fetchURL` for
 * consistency with every other endpoint in this module (the upstream
 * implementation used a raw XMLHttpRequest). Throws `StatusError` on
 * non-2xx so callers can `try/catch` like every other API method.
 *
 * The response body for error statuses is the raw backend error string
 * (e.g. "the zip file is too large"); `utils/unzipErrors.ts` maps these
 * to user-facing copy. The full body is included in the thrown
 * StatusError so callers don't need a separate fetch to read it.
 */
export async function unzip(
  zipFilePath: string,
  destPath: string,
  overwrite = false,
  password?: string
): Promise<void> {
  const from = removePrefix(zipFilePath);
  const to = encodeURIComponent(removePrefix(destPath));
  const url = `${from}?destination=${to}&override=${overwrite}`;
  // The archive password rides in a header (never the URL, so it can't land in
  // an access log or the audit trail) and is base64(UTF-8)-encoded so non-ASCII
  // passwords stay valid as an HTTP header value. A wrong/missing password comes
  // back as 422 (see useExtractIndicator's prompt-and-retry loop).
  const headers = password
    ? { "X-Archive-Password": encodePasswordHeader(password) }
    : undefined;
  const res = await fetchURL(`/api/unzip${url}`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StatusError(body || res.statusText, res.status);
  }
}

// Base64(UTF-8) for the X-Archive-Password header. btoa can't take code points
// above 0xFF directly, so encode to UTF-8 bytes first. Built with a loop rather
// than String.fromCharCode(...bytes) so a long password can't blow the call
// stack via argument spread.
function encodePasswordHeader(password: string): string {
  const bytes = new TextEncoder().encode(password);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function checksum(url: string, algo: ChecksumAlg) {
  const data = await resourceAction(`${url}?checksum=${algo}`, "GET");
  return (await data.json()).checksums[algo];
}

// RC-18: <img>/<video>/<audio>/<track> tags can't send the X-Auth header,
// so these media URLs carry the live JWT as an `auth` query param. The
// backend extractor accepts ?auth on GET. This replaces sole reliance on
// the `auth` cookie, which could drift out of sync with the renewed token
// and then expire — 401-ing every thumbnail while the API kept working.
// Guarded on jwt presence so logged-out public-share viewers are
// unaffected (public shares use the pub.ts builders anyway).
function authParam(): { auth: string } | Record<string, never> {
  const jwt = useAuthStore().jwt;
  return jwt ? { auth: jwt } : {};
}

export function getDownloadURL(file: ResourceItem, inline: boolean) {
  const params = {
    ...(inline && { inline: "true" }),
    ...authParam(),
  };

  return createURL("api/raw" + file.path, params);
}

// #3: on-demand transcode endpoint. The <video> tag loads this (carrying
// ?auth like other media URLs) when native playback fails; the server
// remuxes/transcodes to a cached, seekable MP4.
export function getTranscodeURL(file: ResourceItem) {
  return createURL("api/transcode" + file.path, authParam());
}

export function getPreviewURL(file: ResourceItem, size: string) {
  const params = {
    inline: "true",
    key: Date.parse(file.modified),
    ...authParam(),
  };

  return createURL("api/preview/" + size + file.path, params);
}

// Comic reader (CBZ/CBR): the page count, then a per-page image URL. `<img>`
// can't send the X-Auth header, so the page URL carries ?auth (like the other
// media URLs); `key` (file mtime) busts the cache when the comic changes.
export async function getComicPageCount(path: string): Promise<number> {
  // NOTE: this module exports its own `fetch`, so call the global explicitly.
  const res = await window.fetch(
    createURL("api/comic/list" + path, authParam())
  );
  if (res.status < 200 || res.status > 299) {
    throw new StatusError(
      (await res.text()) || `${res.status} ${res.statusText}`,
      res.status
    );
  }
  const body = (await res.json()) as { pages?: number };
  return body.pages ?? 0;
}

export function getComicPageURL(
  path: string,
  modified: string,
  index: number
): string {
  return createURL("api/comic/page/" + index + path, {
    key: Date.parse(modified),
    ...authParam(),
  });
}

export function getSubtitlesURL(file: ResourceItem) {
  const params = {
    inline: "true",
    ...authParam(),
  };

  return file.subtitles?.map((d) => createURL("api/subtitle" + d, params));
}

/** Recursive size of a folder, computed (and cached) server-side (2.4.0 Stage
 *  4 / E). `computedAt` is when the figure was measured. Throws StatusError on a
 *  non-2xx (e.g. 400 for a file path, 403 out of scope) so callers can ignore it. */
export interface FolderSize {
  size: number;
  computedAt: string;
}
export async function folderSize(url: string): Promise<FolderSize> {
  url = removePrefix(url);
  const res = await fetchURL(`/api/folder-size${url}`, {});
  return res.json();
}

/** Force a rebuild of this user's in-memory search index (2.4.0 Stage 5 / H) —
 *  the manual "rebuild search index" action for when results look stale. */
export async function rebuildSearchIndex(): Promise<void> {
  await fetchURL(`/api/search/rebuild`, { method: "POST" });
}

export async function usage(url: string, signal: AbortSignal) {
  url = removePrefix(url);

  const res = await fetchURL(`/api/usage${url}`, { signal });

  try {
    return await res.json();
  } catch (e) {
    // Check if the error is an intentional cancellation
    if (e instanceof Error && e.name == "AbortError") {
      throw new StatusError("000 No connection", 0, true);
    }
    throw e;
  }
}
