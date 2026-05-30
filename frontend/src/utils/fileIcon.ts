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
};

// Tailwind class pairs (bg + text) — written as literals so the v4 scanner picks them up.
const FOLDER_COLOR = "bg-amber-50 text-amber-500";
const DEFAULT_COLOR = "bg-zinc-100 text-zinc-600";

const COLOR_BY_TYPE: Record<string, string> = {
  audio: "bg-yellow-50 text-yellow-700",
  blob: "bg-zinc-100 text-zinc-600",
  image: "bg-pink-50 text-pink-600",
  pdf: "bg-rose-50 text-rose-600",
  text: "bg-zinc-100 text-zinc-600",
  video: "bg-indigo-50 text-indigo-600",
  invalid_link: "bg-red-50 text-red-500",
};

const COLOR_BY_EXT: Record<string, string> = {
  // Image
  ".ai": "bg-pink-50 text-pink-600",
  ".odg": "bg-pink-50 text-pink-600",
  ".xcf": "bg-pink-50 text-pink-600",

  // Presentation
  ".odp": "bg-orange-50 text-orange-600",
  ".ppt": "bg-orange-50 text-orange-600",
  ".pptx": "bg-orange-50 text-orange-600",

  // Spreadsheet / Database
  ".csv": "bg-green-50 text-green-600",
  ".db": "bg-green-50 text-green-600",
  ".odb": "bg-green-50 text-green-600",
  ".ods": "bg-green-50 text-green-600",
  ".xls": "bg-green-50 text-green-600",
  ".xlsx": "bg-green-50 text-green-600",

  // Document
  ".doc": "bg-rose-50 text-rose-600",
  ".docx": "bg-rose-50 text-rose-600",
  ".log": "bg-zinc-100 text-zinc-600",
  ".odt": "bg-rose-50 text-rose-600",
  ".rtf": "bg-rose-50 text-rose-600",

  // Code (teal)
  ".c": "bg-teal-50 text-teal-600",
  ".cpp": "bg-teal-50 text-teal-600",
  ".cs": "bg-teal-50 text-teal-600",
  ".css": "bg-teal-50 text-teal-600",
  ".go": "bg-teal-50 text-teal-600",
  ".h": "bg-teal-50 text-teal-600",
  ".html": "bg-teal-50 text-teal-600",
  ".java": "bg-teal-50 text-teal-600",
  ".js": "bg-teal-50 text-teal-600",
  ".json": "bg-teal-50 text-teal-600",
  ".kt": "bg-teal-50 text-teal-600",
  ".php": "bg-teal-50 text-teal-600",
  ".py": "bg-teal-50 text-teal-600",
  ".rb": "bg-teal-50 text-teal-600",
  ".rs": "bg-teal-50 text-teal-600",
  ".ts": "bg-teal-50 text-teal-600",
  ".tsx": "bg-teal-50 text-teal-600",
  ".vue": "bg-teal-50 text-teal-600",
  ".xml": "bg-teal-50 text-teal-600",
  ".yml": "bg-teal-50 text-teal-600",
  ".yaml": "bg-teal-50 text-teal-600",

  // Executable (slate)
  ".apk": "bg-slate-100 text-slate-700",
  ".bat": "bg-slate-100 text-slate-700",
  ".exe": "bg-slate-100 text-slate-700",
  ".jar": "bg-slate-100 text-slate-700",
  ".ps1": "bg-slate-100 text-slate-700",
  ".sh": "bg-slate-100 text-slate-700",

  // Installer (amber)
  ".deb": "bg-amber-50 text-amber-700",
  ".msi": "bg-amber-50 text-amber-700",
  ".pkg": "bg-amber-50 text-amber-700",
  ".rpm": "bg-amber-50 text-amber-700",

  // Compressed (orange)
  ".7z": "bg-orange-50 text-orange-600",
  ".bz2": "bg-orange-50 text-orange-600",
  ".cab": "bg-orange-50 text-orange-600",
  ".gz": "bg-orange-50 text-orange-600",
  ".rar": "bg-orange-50 text-orange-600",
  ".tar": "bg-orange-50 text-orange-600",
  ".xz": "bg-orange-50 text-orange-600",
  ".zip": "bg-orange-50 text-orange-600",
  ".zst": "bg-orange-50 text-orange-600",

  // Disk image (violet)
  ".ccd": "bg-violet-50 text-violet-600",
  ".dmg": "bg-violet-50 text-violet-600",
  ".iso": "bg-violet-50 text-violet-600",
  ".mdf": "bg-violet-50 text-violet-600",
  ".vdi": "bg-violet-50 text-violet-600",
  ".vhd": "bg-violet-50 text-violet-600",
  ".vmdk": "bg-violet-50 text-violet-600",
  ".wim": "bg-violet-50 text-violet-600",

  // Font (purple)
  ".otf": "bg-purple-50 text-purple-600",
  ".ttf": "bg-purple-50 text-purple-600",
  ".woff": "bg-purple-50 text-purple-600",
  ".woff2": "bg-purple-50 text-purple-600",

  // Markdown
  ".md": "bg-slate-100 text-slate-600",
  ".markdown": "bg-slate-100 text-slate-600",
};

function getExt(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return name.substring(dot).toLowerCase();
}

export function fileIcon(opts: {
  isDir?: boolean;
  type?: string;
  name?: string;
}): string {
  if (opts.isDir) return "folder";
  if (opts.name) {
    const ext = getExt(opts.name);
    if (ext && BY_EXT[ext]) return BY_EXT[ext];
  }
  if (opts.type && BY_TYPE[opts.type]) return BY_TYPE[opts.type];
  return "file";
}

export function fileIconColor(opts: {
  isDir?: boolean;
  type?: string;
  name?: string;
}): string {
  if (opts.isDir) return FOLDER_COLOR;
  if (opts.name) {
    const ext = getExt(opts.name);
    if (ext && COLOR_BY_EXT[ext]) return COLOR_BY_EXT[ext];
  }
  if (opts.type && COLOR_BY_TYPE[opts.type]) return COLOR_BY_TYPE[opts.type];
  return DEFAULT_COLOR;
}
