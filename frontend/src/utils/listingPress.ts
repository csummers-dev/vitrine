/**
 * Whether a listing pointer press STARTED on empty space — i.e. not on a row
 * (`.item`), the inline rename input, or any control (v2.8.1).
 *
 * The "clear selection on empty click" handlers key off this. Without it, a
 * drag that begins inside a row or the rename input and releases on empty
 * space fires a `click` on the nearest common ancestor (a clear-on-click
 * container); treating that as an empty-space click wiped the selection, which
 * unmounted the in-progress rename input (`v-if="isRenaming"`) and destroyed
 * the text the user was selecting. Gating the clear on "the press also started
 * on empty space" fixes it while a genuine in-place empty click still clears.
 */
export function pressStartedOnEmptyListing(
  target: EventTarget | null
): boolean {
  const el = target as HTMLElement | null;
  return !el?.closest?.(".item, input, textarea, button, a");
}
