import { fetchURL, fetchJSON, removePrefix, createURL } from "./utils";

export async function list() {
  return fetchJSON<Share[]>("/api/shares");
}

export async function get(url: string) {
  url = removePrefix(url);
  return fetchJSON<Share>(`/api/share${url}`);
}

export async function remove(hash: string) {
  await fetchURL(`/api/share/${hash}`, {
    method: "DELETE",
  });
}

export async function create(
  url: string,
  password = "",
  expires = "",
  unit = "hours",
  maxDownloads = 0
) {
  url = removePrefix(url);
  url = `/api/share${url}`;
  if (expires !== "") {
    url += `?expires=${expires}&unit=${unit}`;
  }
  let body = "{}";
  if (
    password != "" ||
    expires !== "" ||
    unit !== "hours" ||
    maxDownloads > 0
  ) {
    body = JSON.stringify({
      password: password,
      expires: expires.toString(), // backend expects string not number
      unit: unit,
      maxDownloads,
    });
  }
  return fetchJSON(url, {
    method: "POST",
    body: body,
  });
}

/** "3 views · 1 download · last opened 2 hours ago" for a share link. */
export function usageSummary(
  s: Pick<Share, "views" | "downloads" | "lastAccessAt" | "maxDownloads">,
  fromNow: (unixSeconds: number) => string
): string {
  const v = s.views ?? 0;
  const d = s.downloads ?? 0;
  const parts = [
    `${v} view${v === 1 ? "" : "s"}`,
    s.maxDownloads
      ? `${d} of ${s.maxDownloads} download${s.maxDownloads === 1 ? "" : "s"}`
      : `${d} download${d === 1 ? "" : "s"}`,
  ];
  if (s.lastAccessAt) parts.push(`last opened ${fromNow(s.lastAccessAt)}`);
  return parts.join(" · ");
}

/** A download-limited link with nothing left. */
export function isExhausted(
  s: Pick<Share, "downloads" | "maxDownloads">
): boolean {
  return !!s.maxDownloads && (s.downloads ?? 0) >= s.maxDownloads;
}

export function getShareURL(share: Share) {
  return createURL("share/" + share.hash, {});
}
