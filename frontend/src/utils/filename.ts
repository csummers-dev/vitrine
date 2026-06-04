/**
 * Filename helpers for the show/hide-extensions preference (WS8).
 *
 * Kept pure + dependency-free so they're trivially unit-testable and shared
 * between the listing row display and the inline rename flow.
 */

/**
 * Split a filename into its base and trailing extension (the extension keeps
 * its leading dot). The extension is empty — i.e. the whole name is the base —
 * when there's no usable split point:
 *   - no dot at all            ("Makefile"      → { "Makefile", "" })
 *   - a leading dot, no other  (".env"          → { ".env", "" })       (dotfile)
 *   - a trailing dot           ("weird."        → { "weird.", "" })
 * Only the LAST dot splits, so multi-part names keep the inner dots in the base
 * ("archive.tar.gz" → { "archive.tar", ".gz" }).
 */
export function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * The name to display for a listing entry given the show-extensions preference.
 * Folders are always shown in full; extensionless names and dotfiles are
 * unaffected (their `ext` is empty). With extensions hidden, files show only
 * their base.
 */
export function displayName(
  name: string,
  isDir: boolean,
  showExt: boolean
): string {
  if (isDir || showExt) return name;
  return splitExtension(name).base;
}
