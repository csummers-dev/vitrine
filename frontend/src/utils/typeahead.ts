// Finder-style type-ahead matching for the file listing.
//
// Behaviour (matches macOS Finder / Windows Explorer):
//   • Type DIFFERENT letters in quick succession → they build a prefix, and the
//     selection jumps to the first item whose name starts with that full prefix
//     ("ba" → "Banana"). Refining happens in place, starting at the cursor.
//   • Tap the SAME letter repeatedly → it CYCLES through every item beginning
//     with that one letter ("b" → "Billy" → "Banana" → "Bob" → wrap). This is
//     the common gesture for walking a long folder, and the previous
//     implementation broke it: it appended the repeat to the buffer ("b" → "bb"
//     → "bbb"), which matched nothing, so the selection got stuck on the first
//     hit and every further press appeared to do nothing.
//   • After an idle gap (`resetMs`) the next keystroke starts a fresh session.
//
// The session is intentionally a plain stateful class with an injectable clock
// so it can be unit-tested deterministically (no timers, no DOM).

export interface TypeaheadItem {
  /** Stable identity used by the caller's selection model. */
  index: number;
  /** Display name to match against (matched case-insensitively). */
  name: string;
}

export class TypeaheadSession {
  private buffer = "";
  private lastTs = 0;

  /** @param resetMs idle gap after which the buffer starts fresh. */
  constructor(private readonly resetMs = 900) {}

  /** Forget the in-progress buffer (e.g. on Escape or folder change). */
  reset(): void {
    this.buffer = "";
    this.lastTs = 0;
  }

  /**
   * Whether a prefix is currently being typed — a non-empty buffer that hasn't
   * idled out yet. Callers use this to decide whether a whitespace key should
   * extend the in-progress name (e.g. "My Doc") rather than start a session
   * (a leading space matches nothing and would be a confusing no-op).
   *
   * @param now current time in ms (injectable for tests)
   */
  isActive(now: number = Date.now()): boolean {
    return this.buffer.length > 0 && now - this.lastTs <= this.resetMs;
  }

  /**
   * Feed one printable character and return the `index` of the item that should
   * become active, or `-1` if nothing matches (caller leaves selection as-is).
   *
   * @param ch          the typed character (single printable char)
   * @param items       items in display order
   * @param activeIndex the currently-active item's `index`, or -1 if none
   * @param now         current time in ms (injectable for tests)
   */
  push(
    ch: string,
    items: TypeaheadItem[],
    activeIndex: number,
    now: number = Date.now()
  ): number {
    const c = ch.toLowerCase();
    const expired = now - this.lastTs > this.resetMs;
    this.lastTs = now;

    if (expired) this.buffer = c;
    else this.buffer += c;

    const n = items.length;
    if (n === 0) return -1;

    // A buffer made up of a single repeated character ("b", "bb", "bbb") is a
    // cycle gesture on that one letter — collapse it to the single char and
    // advance past the cursor so each press steps to the next match. Any mix of
    // characters is a real prefix and refines in place from the cursor.
    const allSame = [...this.buffer].every((x) => x === this.buffer[0]);
    const needle = allSame ? this.buffer[0] : this.buffer;
    if (allSame) this.buffer = needle; // keep "bbb" from growing unbounded

    const cur = items.findIndex((it) => it.index === activeIndex);
    const startAt = cur < 0 ? 0 : allSame ? cur + 1 : cur;

    for (let k = 0; k < n; k++) {
      const it = items[(startAt + k) % n];
      if (it.name.toLowerCase().startsWith(needle)) return it.index;
    }
    return -1;
  }
}
