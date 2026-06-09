/**
 * Shared "drop INTO this folder" hit-test for listing rows.
 *
 * The zone is the UNION of the folder's icon (`.item__icon`) and the rendered
 * run of its name (inner `.item__name-glyph` inside `.item__name-text`), plus a
 * small forgiving grab margin past the last glyph. Everything outside it reads as
 * "alongside" (drop into the CURRENT folder), so a folder full of folders stays
 * easy to drop *into the current directory* rather than accidentally into a child.
 *
 * INVARIANT — this is the SINGLE source of truth for "icon+name vs. rest of row",
 * and EVERY surface that decides it MUST call this (never re-derive it ad hoc, or
 * the highlight and the drop will disagree — that's been the bug, repeatedly).
 * The four call sites, which must stay in lockstep:
 *   1. HIGHLIGHT / spring-load — ListingItem.vue `dragOver` → `isInIntoZone`
 *   2. internal DESKTOP drag drop — ListingItem.vue `drop` (recomputes at release)
 *   3. internal TOUCH drag drop — FileListing.vue `useTouchDrag` onMove/onDrop
 *   4. UPLOAD drop (a file dragged in from the OS) — FileListing.vue `drop`
 * The drop sites (2–4) must resolve "into folder" with the SAME point this
 * function highlights (1); recompute it at the drop point, don't trust a cached
 * flag. If you add a fifth drop/affordance path, wire it here too.
 */

/** Forgiving grab margin (px) past the last glyph of the folder name. */
const DROP_ZONE_GRAB_PX = 16;

/** Padding (px) added around the icon + name union so the edges aren't razor-thin. */
const ZONE_PAD_PX = 3;

/**
 * True when the viewport point (clientX, clientY) is over `rowEl`'s into-zone.
 * `rowEl` is the `.item` row element; the icon + name children are looked up
 * inside it. Returns false when the row has no name element (nothing to target).
 *
 * The right edge is the end of the RENDERED NAME GLYPHS, not the flex name
 * column. `.item__name-text` is `flex: 1`, so its own box spans the whole column
 * — measuring it (or its scroll/Range width) read the entire column and made the
 * whole row a "drop INTO" target. The visible text lives in an inner inline
 * `.item__name-glyph` span whose element box IS the glyph run, so we read THAT
 * rect. Crucially `Element.getBoundingClientRect()` stays correct during an
 * active drag (unlike a `Range` rect, which some browsers zero/expand mid-drag),
 * so the zone is reliably scoped to the icon + name in both the highlight and
 * the drop. Everything past it reads as "alongside" (drop into the CURRENT
 * folder).
 */
export const isPointInRowIntoZone = (
  rowEl: HTMLElement,
  clientX: number,
  clientY: number
): boolean => {
  const iconEl = rowEl.querySelector(".item__icon");
  const nameEl = rowEl.querySelector(".item__name-text");
  if (!(nameEl instanceof HTMLElement)) return false;

  const nameRect = nameEl.getBoundingClientRect();
  const rects: DOMRect[] = [nameRect];
  if (iconEl instanceof HTMLElement) rects.push(iconEl.getBoundingClientRect());

  const left = Math.min(...rects.map((r) => r.left)) - ZONE_PAD_PX;
  const top = Math.min(...rects.map((r) => r.top)) - ZONE_PAD_PX;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + ZONE_PAD_PX;

  // Right edge = the end of the actual rendered glyphs (inner inline span),
  // capped at the name column so a truncated name can't overflow it, + the grab
  // margin. Falls back to the column edge only when the glyph span is absent
  // (e.g. the rename <input> swapped in for the same class — no drag then).
  const glyphEl = nameEl.querySelector(".item__name-glyph");
  const glyphRight =
    glyphEl instanceof HTMLElement
      ? Math.min(glyphEl.getBoundingClientRect().right, nameRect.right)
      : nameRect.right;
  const right = glyphRight + DROP_ZONE_GRAB_PX;

  return (
    clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
  );
};
