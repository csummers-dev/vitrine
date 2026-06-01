interface ResourceBase {
  path: string;
  name: string;
  size: number;
  extension: string;
  modified: string; // ISO 8601 datetime
  mode: number;
  isDir: boolean;
  isSymlink: boolean;
  type: ResourceType;
  url: string;
}

interface Resource extends ResourceBase {
  items: ResourceItem[];
  numDirs: number;
  numFiles: number;
  sorting: Sorting;
  hash?: string;
  token?: string;
  index: number;
  subtitles?: string[];
  content?: string;
  rawContent?: ArrayBuffer;
}

interface ResourceItem extends ResourceBase {
  index: number;
  subtitles?: string[];
}

type ResourceType =
  | "dir"
  | "video"
  | "audio"
  | "image"
  | "pdf"
  | "text"
  | "blob"
  | "textImmutable";

type DownloadFormat =
  | "zip"
  | "tar"
  | "targz"
  | "tarbz2"
  | "tarxz"
  | "tarlz4"
  | "tarsz"
  | null;

interface ClipItem {
  from: string;
  name: string;
  size?: number;
  modified?: string;
}

interface BreadCrumb {
  name: string;
  url: string;
}

interface ConflictingItem {
  lastModified: number | string | undefined;
  size: number | undefined;
}

interface ConflictingResource {
  index: number;
  name: string;
  origin: ConflictingItem;
  dest: ConflictingItem;
  checked: Array<"origin" | "dest", "origin-resume">;
  isSmallerOnServer?: boolean;
}

interface CsvData {
  headers: string[];
  rows: string[][];
}

interface RecursiveEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
  isDir: boolean;
}

/**
 * One of the 8 named colors in the v1.3 tag palette. The values match
 * the backend `tags.ValidColors` slice 1:1 — adding a color requires
 * bumping both this union and the Go constant.
 */
type TagColor =
  | "lilac"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "pink"
  | "slate"
  | "teal";

/**
 * Per-user tag, as returned by /api/tags. IDs are per-user (issued by
 * bbolt's NextSequence within the user's sub-bucket); never compare
 * IDs across users.
 */
interface Tag {
  id: number;
  name: string;
  color: TagColor;
  createdAt: string;
}

/**
 * Saved-search "smart folder" definition (v1.3 S2-6). Persisted in
 * `user.preferences["smartFolders"]` as an array — order is the
 * sidebar display order; clients should preserve insertion order on
 * write.
 *
 * `query` is a free-text string in the same syntax as the command
 * palette (`tag:work ext:pdf draft`). Parsed via parseQuery + dispatched
 * against /api/search/recursive on view.
 */
interface SmartFolder {
  /** Stable client-generated ID (UUID-ish; uses crypto.randomUUID).
   *  Used as the URL segment `/smart/:id`. */
  id: string;
  name: string;
  /** Optional chip color for the sidebar entry. Defaults to lilac. */
  color: TagColor;
  /** Free-text saved query, e.g. "tag:work ext:pdf". */
  query: string;
}
