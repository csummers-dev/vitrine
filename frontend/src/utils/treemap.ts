/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk) for the Storage
 * view (4.0 Phase 5.1). Lays out weighted items in a rectangle so each
 * block's area is proportional to its weight and blocks stay close to
 * square, which keeps labels readable.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed<T> extends Rect {
  item: T;
}

/** Worst aspect ratio in a row of areas laid along a side of `side`. */
function worst(areas: number[], side: number): number {
  let sum = 0;
  let max = 0;
  let min = Infinity;
  for (const a of areas) {
    sum += a;
    max = Math.max(max, a);
    min = Math.min(min, a);
  }
  if (sum === 0 || min === 0) return Infinity;
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * Place `items` in `rect`. Items with no weight are left out; the rest are
 * laid out biggest first, so pass them in any order.
 */
export function squarify<T>(
  items: T[],
  weight: (item: T) => number,
  rect: Rect
): Placed<T>[] {
  const list = items
    .map((item) => ({ item, w: Math.max(0, weight(item)) }))
    .filter((e) => e.w > 0)
    .sort((a, b) => b.w - a.w);
  const total = list.reduce((s, e) => s + e.w, 0);
  if (total === 0 || rect.w <= 0 || rect.h <= 0) return [];

  const scale = (rect.w * rect.h) / total;
  const areas = list.map((e) => e.w * scale);
  const out: Placed<T>[] = [];
  let free: Rect = { ...rect };
  let i = 0;

  while (i < areas.length) {
    const side = Math.min(free.w, free.h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length) {
      const next = [...row, areas[j]];
      if (worst(next, side) > worst(row, side)) break;
      row.push(areas[j]);
      j++;
    }
    // Lay the row along the shorter side of the free space.
    const rowArea = row.reduce((s, a) => s + a, 0);
    if (free.w >= free.h) {
      const colW = free.h > 0 ? rowArea / free.h : 0;
      let y = free.y;
      row.forEach((a, k) => {
        const h = colW > 0 ? a / colW : 0;
        out.push({ item: list[i + k].item, x: free.x, y, w: colW, h });
        y += h;
      });
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      const rowH = free.w > 0 ? rowArea / free.w : 0;
      let x = free.x;
      row.forEach((a, k) => {
        const w = rowH > 0 ? a / rowH : 0;
        out.push({ item: list[i + k].item, x, y: free.y, w, h: rowH });
        x += w;
      });
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
    i = j;
  }
  return out;
}
