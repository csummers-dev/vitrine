/**
 * Shared "drop INTO this folder vs. ALONGSIDE" decision for listing rows.
 *
 * `resolveRowDropMode(row, x, y)` is the SINGLE source of truth and the entry
 * point every drop surface MUST call — never re-derive the "icon+name vs. rest
 * of row" decision ad hoc, or the highlight and the drop will disagree (that's
 * been the bug, repeatedly). It returns "into" only when the point is over a
 * FOLDER row's icon + rendered name; everything else (the rest of a folder row,
 * any file row) is "alongside" → drop into the CURRENT folder.
 *
 * INVARIANT — the four call sites that must stay in lockstep (all via
 * resolveRowDropMode):
 *   1. HIGHLIGHT / spring-load — ListingItem.vue `dragOver` → `isInIntoZone`
 *   2. internal DESKTOP drag drop — ListingItem.vue `drop` (recomputes at release)
 *   3. internal TOUCH drag drop — FileListing.vue `useTouchDrag` onMove/onDrop
 *   4. UPLOAD drop (a file dragged in from the OS) — FileListing.vue `drop`
 * Drop sites (2–4) recompute the mode AT the release point (never trust a cached
 * flag) and read the target folder's url from the row's `data-drop-url`. If you
 * add a fifth drop/affordance path, route it through here too.
 *
 * The zone geometry itself (`isPointInRowIntoZone`) is the UNION of the folder's
 * icon (`.item__icon`) and the rendered run of its name (inner `.item__name-glyph`
 * inside the flex `.item__name-text`), plus a small grab margin past the last glyph.
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

/** "into" (drop into this folder) vs "alongside" (drop into the current folder). */
export type RowDropMode = "into" | "alongside";

/**
 * THE decision (see the file-level INVARIANT): is the point over a folder row's
 * icon+name → "into" (drop into that folder), or anywhere else → "alongside"
 * (drop into the current folder)? Reads `data-dir` for the folder check and
 * delegates the geometry to `isPointInRowIntoZone`; a file row, or the rest of a
 * folder row, is always "alongside". Callers layer their own concerns on top:
 * Alt-to-force-alongside and the self-drop guard live in the desktop handler; the
 * "into" destination url is the row's `data-drop-url`.
 */
export const resolveRowDropMode = (
  row: HTMLElement,
  clientX: number,
  clientY: number
): RowDropMode =>
  row.dataset.dir === "true" && isPointInRowIntoZone(row, clientX, clientY)
    ? "into"
    : "alongside";
