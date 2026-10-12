import { describe, it, expect } from "vitest";
import { squarify } from "@/utils/treemap";

const rect = { x: 0, y: 0, w: 600, h: 400 };

describe("squarify", () => {
  it("gives each item an area proportional to its weight, inside the rect", () => {
    const sizes = [6, 6, 4, 3, 2, 2, 1];
    const placed = squarify(sizes, (n) => n, rect);
    expect(placed).toHaveLength(sizes.length);
    const total = sizes.reduce((a, b) => a + b, 0);
    for (const p of placed) {
      expect(p.w * p.h).toBeCloseTo((p.item / total) * 600 * 400, 6);
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x + p.w).toBeLessThanOrEqual(600 + 1e-9);
      expect(p.y + p.h).toBeLessThanOrEqual(400 + 1e-9);
    }
    // Blocks don't overlap.
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const p = placed[a];
        const q = placed[b];
        const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
        const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
        expect(ox > 1e-6 && oy > 1e-6).toBe(false);
      }
    }
  });

  it("keeps blocks close to square", () => {
    // The classic example from the paper: worst ratio stays small.
    const placed = squarify([6, 6, 4, 3, 2, 2, 1], (n) => n, rect);
    for (const p of placed) {
      expect(Math.max(p.w / p.h, p.h / p.w)).toBeLessThan(3);
    }
  });

  it("places the biggest first and drops empty items", () => {
    const placed = squarify(
      [{ s: 1 }, { s: 0 }, { s: 9 }, { s: -4 }],
      (o) => o.s,
      rect
    );
    expect(placed.map((p) => p.item.s)).toEqual([9, 1]);
    expect(squarify([], (n: number) => n, rect)).toEqual([]);
    expect(squarify([1], (n) => n, { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });

  it("fills the whole rect with one item", () => {
    expect(squarify([5], (n) => n, { x: 10, y: 20, w: 30, h: 40 })).toEqual([
      { item: 5, x: 10, y: 20, w: 30, h: 40 },
    ]);
  });
});
