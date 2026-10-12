import { fetchJSON } from "./utils";
import { encodePath } from "@/utils/url";

/** A block in the Storage treemap (4.0 Phase 5.1). */
export interface UsageNode {
  name: string;
  /** Scope-relative path ("/Movies/Extras"). */
  path: string;
  size: number;
  files: number;
  isDir: boolean;
  /** image | video | audio | pdf | text | archive; for folders the kind
   *  holding over half the bytes. Absent when mixed or unknown. */
  kind?: string;
  /** The smallest children merged into one block. */
  other?: boolean;
  children?: UsageNode[];
}

export interface UsageFile {
  path: string;
  name: string;
  size: number;
  modified: string;
  kind?: string;
}

export interface UsageTree {
  root: UsageNode;
  largest: UsageFile[];
  computedAt: string;
  disk?: { total: number; used: number };
}

/** What uses space under `path` (scope-relative, decoded). */
export function usageTree(
  path: string,
  opts: { depth?: number; refresh?: boolean; signal?: AbortSignal } = {}
): Promise<UsageTree> {
  const params = new URLSearchParams();
  params.set("depth", String(opts.depth ?? 2));
  if (opts.refresh) params.set("refresh", "1");
  const p = path === "/" || path === "" ? "/" : encodePath(path);
  return fetchJSON<UsageTree>(
    `/api/usage/tree${p}?${params}`,
    opts.signal ? { signal: opts.signal } : {}
  );
}
