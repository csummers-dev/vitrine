import { fetchURL, removePrefix, createURL } from "./utils";
import { baseURL } from "@/utils/constants";

/** A drop-box (upload-only) share, as its public page sees it (4.1). */
export interface DropBoxInfo {
  mode: "upload";
  name: string;
  hash: string;
  token?: string;
  maxFileSize?: number;
  /** Bytes left under the link's total limit, when it has one. */
  remainingBytes?: number;
  allowedExtensions?: string[];
  perUploaderFolder?: boolean;
}

export async function fetch(
  url: string,
  password: string = ""
): Promise<Resource & { dropBox?: DropBoxInfo }> {
  url = removePrefix(url);

  const res = await fetchURL(
    `/api/public/share${url}`,
    {
      headers: { "X-SHARE-PASSWORD": encodeURIComponent(password) },
    },
    false
  );

  const raw = (await res.json()) as Record<string, unknown>;
  if (raw.mode === "upload") {
    // A drop-box has no listing: the page shows an upload form instead.
    return { dropBox: raw as unknown as DropBoxInfo } as Resource & {
      dropBox: DropBoxInfo;
    };
  }
  const data = raw as unknown as Resource;
  data.url = `/share${url}`;
  const left = res.headers.get("X-Share-Downloads-Left");
  if (left !== null && left !== "") data.downloadsLeft = Number(left);

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

export function download(
  format: DownloadFormat,
  hash: string,
  token: string,
  ...files: string[]
) {
  let url = `${baseURL}/api/public/dl/${hash}`;

  if (files.length === 1) {
    url += files[0] + "?";
  } else {
    let arg = "";

    for (const file of files) {
      arg += file + ",";
    }

    arg = arg.substring(0, arg.length - 1);
    arg = encodeURIComponent(arg);
    url += `/?files=${arg}&`;
  }

  if (format) {
    url += `algo=${format}&`;
  }

  if (token) {
    url += `token=${token}&`;
  }

  window.open(url);
}

export function getDownloadURL(res: Resource, inline = false) {
  const params = {
    ...(inline && { inline: "true" }),
    ...(res.token && { token: res.token }),
  };

  return createURL("api/public/dl/" + res.hash + res.path, params);
}

/** Why an upload was refused, in words for the visitor. */
export function uploadErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "That file name isn't allowed.";
    case 401:
      return "The password is no longer valid. Reload the page.";
    case 403:
      return "This link no longer accepts uploads.";
    case 404:
      return "This link no longer exists.";
    case 409:
      return "A file with that name arrived at the same moment. Try again.";
    case 411:
      return "Your browser didn't send the file size. Try another browser.";
    case 413:
      return "The file is larger than this link allows.";
    case 415:
      return "This type of file isn't accepted here.";
    case 429:
      return "Too many uploads right now. Wait a moment and try again.";
    default:
      return `Upload failed (${status || "network error"}).`;
  }
}

/** Send one file to a drop-box, reporting progress (0..1). Resolves with
 *  the name it was stored under. */
export function uploadToDropBox(
  info: Pick<DropBoxInfo, "hash" | "token">,
  file: File,
  opts: {
    uploader?: string;
    password?: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<string> {
  const params = new URLSearchParams({ name: file.name });
  if (opts.uploader) params.set("uploader", opts.uploader);
  if (info.token) params.set("token", info.token);
  const url = `${baseURL}/api/public/upload/${info.hash}?${params}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (opts.password)
      xhr.setRequestHeader(
        "X-SHARE-PASSWORD",
        encodeURIComponent(opts.password)
      );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { name: string }).name);
        } catch {
          resolve(file.name);
        }
      } else {
        reject(
          Object.assign(new Error(uploadErrorMessage(xhr.status)), {
            status: xhr.status,
          })
        );
      }
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.onabort = () => reject(new Error("Canceled"));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}
