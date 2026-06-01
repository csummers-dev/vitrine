/**
 * Bulk-rename pattern expansion (v1.3 S4-2).
 *
 * Pure transformer: takes a pattern string + per-item context and
 * returns the new filename. Lives in `utils/` (not inside the
 * BulkRenamePanel component) so the placeholder grammar is testable
 * in isolation — every supported placeholder gets exercised in the
 * vitest suite alongside the SlideOver flow.
 *
 * Locked placeholder set (see docs/roadmap-v1.3-stages-4-9.md §S4-2):
 *
 *   {n}        — 1-based index (1, 2, 3 …)
 *   {N}        — 1-based index, zero-padded to the digit count of the
 *                total (e.g. 5 items → 01, 02, …, 05; 100 items → 001 …)
 *   {###…}     — N-digit zero-padded sequence; {####} = 4 digits per
 *                spec, but any 2+ count of `#` works the same way for
 *                flexibility ({##}, {#####}, etc.)
 *   {ext}      — original lowercase extension, *without* leading dot
 *                (e.g. "txt", "pdf"). Empty string for ext-less files.
 *   {name}     — original basename minus extension (e.g. "draft" for
 *                "draft.txt"). For ext-less files, equals the full name.
 *   {original} — the full original filename (e.g. "draft.txt")
 *
 * Unknown placeholders are left as literal text — easier to debug than
 * silently dropping a typo'd placeholder. The user sees their mistake
 * in the preview list.
 */

/** Per-item context the caller supplies for each filename being renamed. */
export interface PatternContext {
  /** 0-based index of this item within the current selection (sequence
   *  order — matches the selection's display order, which is the
   *  user's current primary sort). */
  index: number;
  /** Total items being renamed. Drives the {N} pad width. */
  total: number;
  /** Original full filename including extension (e.g. "draft.txt"). */
  original: string;
}

/** Result of splitting a filename into basename + extension. Exported
 *  so callers (preview rendering) can show the parts independently. */
export interface SplitName {
  /** Basename minus extension (e.g. "draft"). */
  name: string;
  /** Extension WITHOUT leading dot, lowercased (e.g. "txt"). Empty
   *  string if the filename has no extension or is dotfile-only. */
  ext: string;
}

/**
 * Split a filename into `{name, ext}`. Mirrors how the listing renders
 * basename + ext separately. Edge cases handled:
 *   - "README"          → { name: "README", ext: "" }
 *   - "archive.tar.gz"  → { name: "archive.tar", ext: "gz" }
 *   - ".env"            → { name: ".env",        ext: "" }  (dotfile)
 *   - "trailing."       → { name: "trailing",    ext: "" }
 *
 * The dotfile rule matches POSIX convention: a leading dot doesn't
 * count as an extension separator. Trailing-dot files normalize to
 * basename-only (the empty ext yields a no-op `{ext}` substitution).
 */
export function splitName(filename: string): SplitName {
  if (!filename) return { name: "", ext: "" };
  // Dotfile: starts with "." and no other dots → no extension.
  if (filename.startsWith(".") && filename.lastIndexOf(".") === 0) {
    return { name: filename, ext: "" };
  }
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    // No extension (no dot, leading-dot dotfile, or trailing-dot).
    return {
      name: dot === filename.length - 1 ? filename.slice(0, -1) : filename,
      ext: "",
    };
  }
  return {
    name: filename.slice(0, dot),
    ext: filename.slice(dot + 1).toLowerCase(),
  };
}

/**
 * Expand a pattern against a single item's context. See module header
 * for the full placeholder set.
 *
 * Substitution order matters when one placeholder's expansion could
 * accidentally contain another placeholder's syntax. We handle this
 * by replacing all placeholders in a single regex pass (alternation +
 * replace-callback) so a `{name}` whose original filename contains
 * literal `{n}` doesn't get re-expanded as a sequence number.
 */
export function expandPattern(pattern: string, ctx: PatternContext): string {
  const split = splitName(ctx.original);
  const oneBased = ctx.index + 1;
  const totalDigits = Math.max(1, String(ctx.total).length);

  // Single regex pass so expansions don't recursively re-expand. The
  // alternation covers every recognized placeholder; #-runs are
  // captured as a single group and the width is derived from match
  // length at substitution time.
  return pattern.replace(
    /\{(n|N|original|name|ext|#{2,})\}/g,
    (_match, token: string) => {
      if (token === "n") return String(oneBased);
      if (token === "N") return String(oneBased).padStart(totalDigits, "0");
      if (token.startsWith("#")) {
        return String(oneBased).padStart(token.length, "0");
      }
      if (token === "ext") return split.ext;
      if (token === "name") return split.name;
      if (token === "original") return ctx.original;
      // Defensive: unreachable given the regex alternation, but keep
      // literal text if the matcher ever lets something through.
      return `{${token}}`;
    }
  );
}

/**
 * Apply a literal find-and-replace pass to the original filename. The
 * alternative to pattern mode — used when the user toggles the
 * Find-and-Replace mode in the SlideOver. Regex toggle is deferred to
 * the backend bulk endpoint (Stage 6) where server-side validation
 * can sandbox malicious input safely.
 */
export function applyFindReplace(
  original: string,
  find: string,
  replace: string
): string {
  if (!find) return original;
  return original.split(find).join(replace);
}
