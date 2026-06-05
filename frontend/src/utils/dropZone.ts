/**
 * Shared "drop INTO this folder" hit-test for listing rows.
 *
 * Single source of truth for BOTH drag paths:
 *   • desktop HTML5 drag  → ListingItem.vue (`isInIntoZone`)
 *   • touch drag          → FileListing.vue (`useTouchDrag` onMove/onDrop)
 *
 * The zone is the UNION of the folder's icon (`.item__icon`) and the rendered
 * run of its name (`.item__name-text`), plus a small forgiving grab margin past
 * the last glyph. Everything outside it reads as "alongside" (drop into the
 * CURRENT folder), so a folder full of folders stays easy to drop *into the
 * current directory* rather than accidentally into a child.
 */

/** Forgiving grab margin (px) past the last glyph of the folder name. */
const DROP_ZONE_GRAB_PX = 16;

/** Padding (px) added around the icon + name union so the edges aren't razor-thin. */
const ZONE_PAD_PX = 3;

/**
 * Width of the actually-rendered text inside `.item__name-text`, NOT its flex
 * box. A Range over the text node returns the glyph run's bounding box — the
 * only reliable signal when the element is `flex: 1` (its scroll/client width is
 * the whole column). Falls back to `scrollWidth` when there's no text node (the
 * rename `<input>` swapped in for the same class, or a transient empty node).
 */
const measureTextWidth = (el: HTMLElement): number => {
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const w = range.getBoundingClientRect().width;
    if (w > 0) return w;
  }
  return el.scrollWidth;
};

/**
 * True when the viewport point (clientX, clientY) is over `rowEl`'s into-zone.
 * `rowEl` is the `.item` row element; the icon + name children are looked up
 * inside it. Returns false when the row has no name element (nothing to target).
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
  // `.item__name-text` is `flex: 1`, so its box stretches across the whole name
  // column. Cap the right edge at the visible glyph run (or the box width for
  // truncated names) + the grab margin, so the empty space after a short name
  // still reads as "alongside".
  const glyphWidth = measureTextWidth(nameEl);
  const textWidth = Math.min(glyphWidth, nameRect.width);
  const right = nameRect.left + textWidth + DROP_ZONE_GRAB_PX;

  return (
    clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
  );
};
