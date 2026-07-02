/**
 * Type-filter categories for the listing's filter chips (v2.7).
 *
 * Buckets are COARSER than file-icon types on purpose — the chips are for
 * "show me the photos in this mess", not a taxonomy. Extension checks win
 * over the server-detected `type` so archives and comics (which detect as
 * `blob`/`archive`-ish) land in their own buckets, mirroring how
 * utils/fileIcon.ts gives them their own identity.
 */

export type TypeFilterKey =
  | "images"
  | "videos"
  | "audio"
  | "comics"
  | "documents"
  | "archives"
  | "other";

export const TYPE_FILTER_LABELS: Record<TypeFilterKey, string> = {
  images: "Images",
  videos: "Videos",
  audio: "Audio",
  comics: "Comics",
  documents: "Documents",
  archives: "Archives",
  other: "Other",
};

/** Chip display order (only categories present in the folder render). */
export const TYPE_FILTER_ORDER: TypeFilterKey[] = [
  "images",
  "videos",
  "audio",
  "comics",
  "documents",
  "archives",
  "other",
];

const COMIC_EXTS = new Set([".cbz", ".cbr", ".cb7", ".cbt"]);

const ARCHIVE_EXTS = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".zst",
  ".lz4",
  ".tgz",
  ".iso",
]);

// Office / book formats the server types as `blob` but read as documents.
const DOC_EXTS = new Set([
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".xls",
  ".xlsx",
  ".ods",
  ".csv",
  ".ppt",
  ".pptx",
  ".odp",
  ".epub",
  ".md",
]);

interface TypeFilterSubject {
  isDir?: boolean;
  type?: string;
  extension?: string;
}

/**
 * The chip bucket for a listing item, or null for folders (folders are never
 * filtered — hiding the way forward while hunting for a file type would turn
 * the filter into a trap).
 */
export function typeFilterCategory(
  item: TypeFilterSubject
): TypeFilterKey | null {
  if (item.isDir) return null;
  const ext = (item.extension ?? "").toLowerCase();
  if (COMIC_EXTS.has(ext)) return "comics";
  if (ARCHIVE_EXTS.has(ext)) return "archives";
  switch (item.type) {
    case "image":
      return "images";
    case "video":
      return "videos";
    case "audio":
      return "audio";
    case "pdf":
    case "text":
    case "textImmutable":
      return "documents";
  }
  if (DOC_EXTS.has(ext)) return "documents";
  return "other";
}
