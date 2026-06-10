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
const FOLDER_COLOR = "bg-amber-500 text-white";
const DEFAULT_COLOR = "bg-zinc-500 text-white";

const COLOR_BY_TYPE: Record<string, string> = {
  audio: "bg-yellow-600 text-white",
  blob: "bg-zinc-500 text-white",
  image: "bg-pink-600 text-white",
  pdf: "bg-rose-600 text-white",
  text: "bg-zinc-500 text-white",
  video: "bg-indigo-500 text-white",
  invalid_link: "bg-red-500 text-white",
};

const COLOR_BY_EXT: Record<string, string> = {
  // Image
  ".ai": "bg-pink-600 text-white",
  ".odg": "bg-pink-600 text-white",
  ".xcf": "bg-pink-600 text-white",

  // Presentation
  ".odp": "bg-orange-600 text-white",
  ".ppt": "bg-orange-600 text-white",
  ".pptx": "bg-orange-600 text-white",

  // Spreadsheet / Database
  ".csv": "bg-green-600 text-white",
  ".db": "bg-green-600 text-white",
  ".odb": "bg-green-600 text-white",
  ".ods": "bg-green-600 text-white",
  ".xls": "bg-green-600 text-white",
  ".xlsx": "bg-green-600 text-white",

  // Document
  ".doc": "bg-rose-600 text-white",
  ".docx": "bg-rose-600 text-white",
  ".log": "bg-zinc-500 text-white",
  ".odt": "bg-rose-600 text-white",
  ".rtf": "bg-rose-600 text-white",

  // Code (teal)
  ".c": "bg-teal-600 text-white",
  ".cpp": "bg-teal-600 text-white",
  ".cs": "bg-teal-600 text-white",
  ".css": "bg-teal-600 text-white",
  ".go": "bg-teal-600 text-white",
  ".h": "bg-teal-600 text-white",
  ".html": "bg-teal-600 text-white",
  ".java": "bg-teal-600 text-white",
  ".js": "bg-teal-600 text-white",
  ".json": "bg-teal-600 text-white",
  ".kt": "bg-teal-600 text-white",
  ".php": "bg-teal-600 text-white",
  ".py": "bg-teal-600 text-white",
  ".rb": "bg-teal-600 text-white",
  ".rs": "bg-teal-600 text-white",
  ".ts": "bg-teal-600 text-white",
  ".tsx": "bg-teal-600 text-white",
  ".vue": "bg-teal-600 text-white",
  ".xml": "bg-teal-600 text-white",
  ".yml": "bg-teal-600 text-white",
  ".yaml": "bg-teal-600 text-white",

  // Executable (slate)
  ".apk": "bg-slate-600 text-white",
  ".bat": "bg-slate-600 text-white",
  ".exe": "bg-slate-600 text-white",
  ".jar": "bg-slate-600 text-white",
  ".ps1": "bg-slate-600 text-white",
  ".sh": "bg-slate-600 text-white",

  // Installer (amber)
  ".deb": "bg-amber-600 text-white",
  ".msi": "bg-amber-600 text-white",
  ".pkg": "bg-amber-600 text-white",
  ".rpm": "bg-amber-600 text-white",

  // Compressed (orange)
  ".7z": "bg-orange-600 text-white",
  ".bz2": "bg-orange-600 text-white",
  ".cab": "bg-orange-600 text-white",
  ".gz": "bg-orange-600 text-white",
  ".rar": "bg-orange-600 text-white",
  ".tar": "bg-orange-600 text-white",
  ".tgz": "bg-orange-600 text-white",
  ".xz": "bg-orange-600 text-white",
  ".zip": "bg-orange-600 text-white",
  ".zst": "bg-orange-600 text-white",

  // Disk image (violet)
  ".ccd": "bg-violet-600 text-white",
  ".dmg": "bg-violet-600 text-white",
  ".iso": "bg-violet-600 text-white",
  ".mdf": "bg-violet-600 text-white",
  ".vdi": "bg-violet-600 text-white",
  ".vhd": "bg-violet-600 text-white",
  ".vmdk": "bg-violet-600 text-white",
  ".wim": "bg-violet-600 text-white",

  // Font (purple)
  ".otf": "bg-purple-600 text-white",
  ".ttf": "bg-purple-600 text-white",
  ".woff": "bg-purple-600 text-white",
  ".woff2": "bg-purple-600 text-white",

  // Markdown
  ".md": "bg-slate-600 text-white",
  ".markdown": "bg-slate-600 text-white",

  // Comic books (violet, distinct from the orange archives)
  ".cbz": "bg-violet-600 text-white",
  ".cbr": "bg-violet-600 text-white",
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
