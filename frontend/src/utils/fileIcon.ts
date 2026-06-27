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
const DEFAULT_COLOR = "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300";

const COLOR_BY_TYPE: Record<string, string> = {
  audio: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  blob: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  image: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  pdf: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  text: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  video: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  invalid_link: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const COLOR_BY_EXT: Record<string, string> = {
  // Image
  ".ai": "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  ".odg": "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  ".xcf": "bg-pink-500/15 text-pink-700 dark:text-pink-300",

  // Presentation
  ".odp": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".ppt": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".pptx": "bg-orange-500/15 text-orange-700 dark:text-orange-300",

  // Spreadsheet / Database
  ".csv": "bg-green-500/15 text-green-700 dark:text-green-300",
  ".db": "bg-green-500/15 text-green-700 dark:text-green-300",
  ".odb": "bg-green-500/15 text-green-700 dark:text-green-300",
  ".ods": "bg-green-500/15 text-green-700 dark:text-green-300",
  ".xls": "bg-green-500/15 text-green-700 dark:text-green-300",
  ".xlsx": "bg-green-500/15 text-green-700 dark:text-green-300",

  // Document
  ".doc": "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ".docx": "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ".log": "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  ".odt": "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ".rtf": "bg-rose-500/15 text-rose-700 dark:text-rose-300",

  // Code (teal)
  ".c": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".cpp": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".cs": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".css": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".go": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".h": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".html": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".java": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".js": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".json": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".kt": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".php": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".py": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".rb": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".rs": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".ts": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".tsx": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".vue": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".xml": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".yml": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  ".yaml": "bg-teal-500/15 text-teal-700 dark:text-teal-300",

  // Executable (slate)
  ".apk": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".bat": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".exe": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".jar": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".ps1": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".sh": "bg-slate-500/15 text-slate-700 dark:text-slate-300",

  // Installer (amber)
  ".deb": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ".msi": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ".pkg": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ".rpm": "bg-amber-500/15 text-amber-700 dark:text-amber-300",

  // Compressed (orange)
  ".7z": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".bz2": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".cab": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".gz": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".rar": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".tar": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".tgz": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".xz": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".zip": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ".zst": "bg-orange-500/15 text-orange-700 dark:text-orange-300",

  // Disk image (violet)
  ".ccd": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".dmg": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".iso": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".mdf": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".vdi": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".vhd": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".vmdk": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".wim": "bg-violet-500/15 text-violet-700 dark:text-violet-300",

  // Font (purple)
  ".otf": "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  ".ttf": "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  ".woff": "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  ".woff2": "bg-purple-500/15 text-purple-700 dark:text-purple-300",

  // Markdown
  ".md": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  ".markdown": "bg-slate-500/15 text-slate-700 dark:text-slate-300",

  // Comic books (violet, distinct from the orange archives)
  ".cbz": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  ".cbr": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
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
