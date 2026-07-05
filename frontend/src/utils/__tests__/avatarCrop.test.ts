import { describe, it, expect } from "vitest";
import {
  coverBaseline,
  centerOffset,
  clampOffset,
  zoomAround,
  outputRect,
} from "@/utils/avatarCrop";

const STAGE = 260;

describe("coverBaseline", () => {
  it("fills the stage from the SMALLER dimension (object-fit: cover)", () => {
    // 520×390: min is 390 → 260/390
    expect(coverBaseline(520, 390, STAGE)).toBeCloseTo(260 / 390, 6);
    // portrait 300×600: min 300 → 260/300
    expect(coverBaseline(300, 600, STAGE)).toBeCloseTo(260 / 300, 6);
  });
  it("returns 1 for a degenerate zero-dimension image (no NaN)", () => {
    expect(coverBaseline(0, 100, STAGE)).toBe(1);
  });
});

describe("centerOffset", () => {
  it("centers a scaled image in the stage", () => {
    // 400 wide in a 260 stage → tx = (260-400)/2 = -70
    expect(centerOffset(400, 400, STAGE)).toEqual({ tx: -70, ty: -70 });
  });
});

describe("clampOffset", () => {
  it("never lets the top-left cross into positive space (no gap on top/left)", () => {
    const c = clampOffset(30, 30, 400, 400, STAGE);
    expect(c).toEqual({ tx: 0, ty: 0 });
  });
  it("never lets the far edge pull inside the stage (no gap on bottom/right)", () => {
    // draw=400, stage=260 → minX = -140; an over-negative tx clamps up to -140
    const c = clampOffset(-999, -999, 400, 400, STAGE);
    expect(c).toEqual({ tx: -140, ty: -140 });
  });
  it("leaves an in-range offset untouched", () => {
    expect(clampOffset(-70, -50, 400, 400, STAGE)).toEqual({
      tx: -70,
      ty: -50,
    });
  });
});

describe("zoomAround", () => {
  it("clamps the scale to [min, max]", () => {
    const base = coverBaseline(400, 400, STAGE);
    const min = base;
    const max = base * 4;
    // Ask for way beyond max → pinned to max
    const z = zoomAround(base, max * 10, -70, -70, 400, 400, STAGE, min, max);
    expect(z.scale).toBeCloseTo(max, 6);
  });

  it("keeps the stage center fixed as it zooms (center stays covered + clamped)", () => {
    const base = coverBaseline(400, 400, STAGE); // 0.65
    const min = base;
    const max = base * 4;
    // start centered
    const c = centerOffset(400 * base, 400 * base, STAGE);
    const z = zoomAround(base, base * 2, c.tx, c.ty, 400, 400, STAGE, min, max);
    expect(z.scale).toBeCloseTo(base * 2, 6);
    // result stays within the clamp envelope (image still covers the stage)
    const drawW = 400 * z.scale;
    expect(z.tx).toBeLessThanOrEqual(0);
    expect(z.tx).toBeGreaterThanOrEqual(STAGE - drawW);
  });

  it("survives a zero current scale without dividing by zero", () => {
    const z = zoomAround(0, 1, 0, 0, 400, 400, STAGE, 0.5, 2);
    expect(Number.isFinite(z.tx)).toBe(true);
    expect(Number.isFinite(z.ty)).toBe(true);
  });
});

describe("outputRect", () => {
  it("scales the on-screen transform by output/stage for drawImage", () => {
    // stage 260 → output 256, k = 256/260
    const r = outputRect(-70, -50, 400, 400, STAGE, 256);
    const k = 256 / 260;
    expect(r.dx).toBeCloseTo(-70 * k, 6);
    expect(r.dy).toBeCloseTo(-50 * k, 6);
    expect(r.dw).toBeCloseTo(400 * k, 6);
    expect(r.dh).toBeCloseTo(400 * k, 6);
  });
});
