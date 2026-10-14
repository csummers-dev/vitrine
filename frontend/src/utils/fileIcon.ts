// Maps a file type / extension to a Lucide icon name and a Tailwind color class.
// Used by ListingItem (Stage 3) and any other component that renders a file glyph.
// Single source of truth — replaces the old CSS::before material-icons lookup.

const BY_TYPE: Record<string, string> = {
  audio: "music",
  blob: "file",
  image: "image",
  pdf: "file-text",
  text: "file-text",
  video: "video",
  invalid_link: "unlink",
};

const BY_EXT: Record<string, string> = {
  // Image
  ".ai": "image",
  ".odg": "image",
  ".xcf": "image",

  // Presentation
  ".odp": "presentation",
  ".ppt": "presentation",
  ".pptx": "presentation",

  // Spreadsheet / Database
  ".csv": "sheet",
  ".db": "sheet",
  ".odb": "sheet",
  ".ods": "sheet",
  ".xls": "sheet",
  ".xlsx": "sheet",

  // Document
  ".doc": "file-text",
  ".docx": "file-text",
  ".log": "file-text",
  ".odt": "file-text",
  ".rtf": "file-text",

  // Code
  ".c": "code",
  ".cpp": "code",
  ".cs": "code",
  ".css": "code",
  ".go": "code",
  ".h": "code",
  ".html": "code",
  ".java": "code",
  ".js": "code",
  ".json": "code",
  ".kt": "code",
  ".php": "code",
  ".py": "code",
  ".rb": "code",
  ".rs": "code",
  ".ts": "code",
  ".tsx": "code",
  ".vue": "code",
  ".xml": "code",
  ".yml": "code",
  ".yaml": "code",

  // Executable
  ".apk": "terminal",
  ".bat": "terminal",
  ".exe": "terminal",
  ".jar": "terminal",
  ".ps1": "terminal",
  ".sh": "terminal",

  // Installer
  ".deb": "package",
  ".msi": "package",
  ".pkg": "package",
  ".rpm": "package",

  // Compressed
  ".7z": "file-archive",
  ".bz2": "file-archive",
  ".cab": "file-archive",
  ".gz": "file-archive",
  ".rar": "file-archive",
  ".tar": "file-archive",
  ".tgz": "file-archive",
  ".xz": "file-archive",
  ".zip": "file-archive",
  ".zst": "file-archive",

  // Disk image
  ".ccd": "disc",
  ".dmg": "disc",
  ".iso": "disc",
  ".mdf": "disc",
  ".vdi": "disc",
  ".vhd": "disc",
  ".vmdk": "disc",
  ".wim": "disc",

  // Font
  ".otf": "type",
  ".ttf": "type",
  ".woff": "type",
  ".woff2": "type",

  // Markdown
  ".md": "file-pen-line",
  ".markdown": "file-pen-line",

  // Comic books
  ".cbz": "book-open",
  ".cbr": "book-open",
};

// Tailwind class pairs (bg + text) — written as literals so the v4 scanner picks them up.
// Calm Minimal: folders are navigation targets, so the one squircle that keeps
// color is the accent (was a loud amber that dominated every row). Files stay
// neutral grey — the folder/file split now reads accent-vs-ink and the tile
// recolors with the user's accent pick. `--color-on-accent` keeps the glyph
// legible on the light accents (cyan/amber).
const FOLDER_COLOR = "bg-[var(--color-accent)] text-[var(--color-on-accent)]";
const DEFAULT_COLOR = "kind-other";

const COLOR_BY_TYPE: Record<string, string> = {
  audio: "kind-audio",
  blob: "kind-other",
  image: "kind-image",
  pdf: "kind-pdf",
  text: "kind-text",
  video: "kind-video",
  invalid_link: "kind-error",
};

const COLOR_BY_EXT: Record<string, string> = {
  // Image
  ".ai": "kind-image",
  ".odg": "kind-image",
  ".xcf": "kind-image",

  // Presentation
  ".odp": "kind-archive",
  ".ppt": "kind-archive",
  ".pptx": "kind-archive",

  // Spreadsheet / Database
  ".csv": "kind-csv",
  ".db": "kind-csv",
  ".odb": "kind-csv",
  ".ods": "kind-csv",
  ".xls": "kind-csv",
  ".xlsx": "kind-csv",

  // Document
  ".doc": "kind-pdf",
  ".docx": "kind-pdf",
  ".log": "kind-text",
  ".odt": "kind-pdf",
  ".rtf": "kind-pdf",

  // Code (teal)
  ".c": "kind-code",
  ".cpp": "kind-code",
  ".cs": "kind-code",
  ".css": "kind-code",
  ".go": "kind-code",
  ".h": "kind-code",
  ".html": "kind-code",
  ".java": "kind-code",
  ".js": "kind-code",
  ".json": "kind-code",
  ".kt": "kind-code",
  ".php": "kind-code",
  ".py": "kind-code",
  ".rb": "kind-code",
  ".rs": "kind-code",
  ".ts": "kind-code",
  ".tsx": "kind-code",
  ".vue": "kind-code",
  ".xml": "kind-code",
  ".yml": "kind-code",
  ".yaml": "kind-code",

  // Executable (slate)
  ".apk": "kind-other",
  ".bat": "kind-other",
  ".exe": "kind-other",
  ".jar": "kind-other",
  ".ps1": "kind-other",
  ".sh": "kind-other",

  // Installer (amber)
  ".deb": "kind-archive",
  ".msi": "kind-archive",
  ".pkg": "kind-archive",
  ".rpm": "kind-archive",

  // Compressed (orange)
  ".7z": "kind-archive",
  ".bz2": "kind-archive",
  ".cab": "kind-archive",
  ".gz": "kind-archive",
  ".rar": "kind-archive",
  ".tar": "kind-archive",
  ".tgz": "kind-archive",
  ".xz": "kind-archive",
  ".zip": "kind-archive",
  ".zst": "kind-archive",

  // Disk image (violet)
  ".ccd": "kind-other",
  ".dmg": "kind-other",
  ".iso": "kind-other",
  ".mdf": "kind-other",
  ".vdi": "kind-other",
  ".vhd": "kind-other",
  ".vmdk": "kind-other",
  ".wim": "kind-other",

  // Font (purple)
  ".otf": "kind-other",
  ".ttf": "kind-other",
  ".woff": "kind-other",
  ".woff2": "kind-other",

  // Markdown
  ".md": "kind-text",
  ".markdown": "kind-text",

  // Comic books (violet, distinct from the orange archives)
  ".cbz": "kind-comic",
  ".cbr": "kind-comic",

  // EPUB
  ".epub": "kind-epub",
};

// Map common media extensions to the server's `type` buckets. The backend tags
// files with a `type` (image/audio/video/pdf/text) that drives the icon +
// colour above — but callers that only have a NAME (Trash entries, search hits,
// recents) get no `type`, and these extensions live in BY_TYPE, not BY_EXT.
// Inferring the bucket from the extension lets those name-only surfaces show the
// same coloured glyph as the main listing instead of a generic grey tile.
// (Extensions already covered by BY_EXT — e.g. ".ts" as TypeScript — are
// resolved there first and never reach this map.)
const EXT_TO_TYPE: Record<string, string> = {
  // Image
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".svg": "image",
  ".ico": "image",
  ".tif": "image",
  ".tiff": "image",
  ".heic": "image",
  ".heif": "image",
  ".avif": "image",

  // Audio
  ".mp3": "audio",
  ".m4a": "audio",
  ".aac": "audio",
  ".flac": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".oga": "audio",
  ".opus": "audio",
  ".wma": "audio",
  ".aiff": "audio",
  ".alac": "audio",

  // Video
  ".mp4": "video",
  ".m4v": "video",
  ".mkv": "video",
  ".mov": "video",
  ".avi": "video",
  ".webm": "video",
  ".wmv": "video",
  ".flv": "video",
  ".mpg": "video",
  ".mpeg": "video",
  ".3gp": "video",

  // PDF
  ".pdf": "pdf",

  // Plain text
  ".txt": "text",
  ".text": "text",
  ".nfo": "text",
};

function getExt(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return name.substring(dot).toLowerCase();
}

/** Resolve the effective `type` bucket: the explicit one if known, else
 *  inferred from a media extension. */
function resolveType(
  type: string | undefined,
  ext: string | null
): string | undefined {
  if (type && BY_TYPE[type]) return type;
  if (ext && EXT_TO_TYPE[ext]) return EXT_TO_TYPE[ext];
  return type;
}

export function fileIcon(opts: {
  isDir?: boolean;
  type?: string;
  name?: string;
}): string {
  if (opts.isDir) return "folder";
  const ext = opts.name ? getExt(opts.name) : null;
  // Specific extension icons (e.g. .zip → archive) win over the type bucket.
  if (ext && BY_EXT[ext]) return BY_EXT[ext];
  const type = resolveType(opts.type, ext);
  if (type && BY_TYPE[type]) return BY_TYPE[type];
  return "file";
}

export function fileIconColor(opts: {
  isDir?: boolean;
  type?: string;
  name?: string;
}): string {
  if (opts.isDir) return FOLDER_COLOR;
  const ext = opts.name ? getExt(opts.name) : null;
  if (ext && COLOR_BY_EXT[ext]) return COLOR_BY_EXT[ext];
  const type = resolveType(opts.type, ext);
  if (type && COLOR_BY_TYPE[type]) return COLOR_BY_TYPE[type];
  return DEFAULT_COLOR;
}
