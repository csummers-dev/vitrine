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

/**
 * The name a clipboard-pasted file should upload under (v2.7 paste-to-upload).
 *
 * Screenshots and copied images land on the OS clipboard under a generic name
 * (macOS/Chrome: "image.png") — every paste would collide with the last one
 * and drag the user through the conflict dialog. Those get a timestamped name
 * instead ("Pasted 2026-07-01 at 22.41.03.png"); anything with a real name
 * (a file copied in Finder keeps its own name) passes through untouched.
 */
export function pastedFileName(name: string, when: Date): string {
  if (!/^image\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(name)) return name;
  const { ext } = splitExtension(name);
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}`;
  const time = `${p(when.getHours())}.${p(when.getMinutes())}.${p(when.getSeconds())}`;
  return `Pasted ${day} at ${time}${ext}`;
}
