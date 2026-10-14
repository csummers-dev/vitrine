import { describe, it, expect } from "vitest";
import {
  parseColor,
  contrast,
  deriveAccent,
  over,
  ACCENT_SURFACES,
  ACCENT_TINT,
  toHex,
} from "@/utils/color";

describe("parseColor", () => {
  it("reads hex, rgb() and rgba() in both syntaxes", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#12805c")).toEqual({ r: 18, g: 128, b: 92, a: 1 });
    expect(parseColor("#12805c80")!.a).toBeCloseTo(0.5, 2);
    expect(parseColor("rgba(18, 128, 92, 0.12)")!.a).toBe(0.12);
    expect(parseColor("rgb(18 128 92 / 0.2)")!.a).toBe(0.2);
    expect(parseColor("rgb(18 128 92 / 20%)")!.a).toBe(0.2);
  });

  it("rejects what isn't a colour", () => {
    for (const s of ["", "red", "#12", "#12345", "rgb(1,2)", "var(--x)"])
      expect(parseColor(s), s).toBeNull();
  });
});

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("composites translucent colours", () => {
    expect(toHex(over("rgba(0, 0, 0, 0.5)", "#ffffff"))).toBe("#808080");
  });
});

describe("deriveAccent", () => {
  // Any branding colour an admin might type, including awkward ones.
  const colours = [
    "#ffffff",
    "#000000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#ff0000",
    "#808080",
    "#3b82f6",
    "#f59e0b",
    "#10b981",
    "#e11d48",
    "#1e1b4b",
  ];
  for (const c of colours) {
    it(`${c} meets AA everywhere`, () => {
      const a = deriveAccent(c);
      expect(contrast(a.on, a.value)).toBeGreaterThanOrEqual(4.5);
      for (const s of ACCENT_SURFACES.light) {
        const tint = over({ ...parseColor(a.value)!, a: ACCENT_TINT.light }, s);
        expect(contrast(a.inkLight, s)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(a.inkLight, tint)).toBeGreaterThanOrEqual(4.5);
      }
      for (const s of ACCENT_SURFACES.dark) {
        const tint = over({ ...parseColor(a.value)!, a: ACCENT_TINT.dark }, s);
        expect(contrast(a.inkDark, s)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(a.inkDark, tint)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
