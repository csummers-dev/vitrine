/**
 * Colour helpers for the theme (Phase 6): parsing, mixing, WCAG contrast,
 * and deriving a full accent (hover, text and on-accent shades) from one
 * colour so presets and the admin branding colour always meet contrast.
 */

export type RGBA = { r: number; g: number; b: number; a: number };

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax). */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      s
    );
  if (m) {
    const a =
      m[4] === undefined
        ? 1
        : m[4].endsWith("%")
          ? parseFloat(m[4]) / 100
          : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}

function must(c: string | RGBA): RGBA {
  if (typeof c !== "string") return c;
  const p = parseColor(c);
  if (!p) throw new Error(`not a colour: ${c}`);
  return p;
}

export function toHex(c: string | RGBA): string {
  const { r, g, b } = must(c);
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.round(clamp(n)).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Space-separated channels for `rgb(var(--x) / a)`. */
export function toChannels(c: string | RGBA): string {
  const { r, g, b } = must(c);
  return [r, g, b].map((n) => Math.round(n)).join(" ");
}

/** Mixes a toward b by t (0 = a, 1 = b), ignoring alpha. */
export function mix(a: string | RGBA, b: string | RGBA, t: number): string {
  const x = must(a),
    y = must(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
    a: 1,
  });
}

/** Composites a translucent colour over an opaque background. */
export function over(fg: string | RGBA, bg: string | RGBA): RGBA {
  const f = must(fg),
    b = must(bg);
  return {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  };
}

export function luminance(c: string | RGBA): number {
  const { r, g, b } = must(c);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio. Translucent colours are composited: the background
 *  over `base` (default white), then the foreground over the background. */
export function contrast(
  fg: string | RGBA,
  bg: string | RGBA,
  base: string | RGBA = "#ffffff"
): number {
  const B = over(bg, base);
  const F = over(fg, B);
  const [hi, lo] = [luminance(F), luminance(B)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Steps `c` toward `toward` until it reaches `ratio` against `bg`. */
export function ensureContrast(
  c: string,
  bg: string | RGBA,
  ratio: number,
  toward: string
): string {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const v = mix(c, toward, t);
    if (contrast(v, bg) >= ratio) return v;
  }
  return toHex(toward);
}

/** The surfaces accent text and fills sit on (kept in step with tokens.css). */
export const ACCENT_SURFACES = {
  light: ["#fbfbfc", "#f7f8f9", "#eceef1", "#ffffff"],
  dark: ["#1c1f23", "#202328", "#16181b", "#31363d"],
} as const;

export interface DerivedAccent {
  /** Solid fill (buttons, active states). */
  value: string;
  /** Hover / pressed fill. */
  strong: string;
  /** Accent as text or icon on light surfaces and light accent tints. */
  inkLight: string;
  /** Accent as text or icon on dark surfaces and dark accent tints. */
  inkDark: string;
  /** Channels for `rgb(var(--accent-rgb) / a)` tints. */
  rgb: string;
  /** Text on the solid fill. */
  on: string;
}

/** Light tint alpha (selected rows, soft chips) in each theme. */
export const ACCENT_TINT = { light: 0.12, dark: 0.2 } as const;

function worst(
  c: string,
  surfaces: readonly string[],
  tint: number,
  value: string
): number {
  return Math.min(
    ...surfaces.flatMap((s) => [
      contrast(c, s),
      contrast(c, over({ ...must(value), a: tint }, s)),
    ])
  );
}

/** Derives a full accent from one colour so every pairing meets WCAG AA:
 *  text 4.5:1 on every surface and on the accent's own tints, and 4.5:1
 *  for the label on the solid fill. */
export function deriveAccent(hex: string): DerivedAccent {
  let value = toHex(hex);
  // A fill neither white nor dark text can sit on (mid blues, greens)
  // is deepened until a white label reads.
  const best = (v: string) =>
    Math.max(contrast("#ffffff", v), contrast(mix(v, "#000000", 0.8), v));
  for (let t = 0.02; best(value) < 4.5 && t <= 1; t += 0.02)
    value = mix(hex, "#000000", t);
  const lighter = (c: string) =>
    worst(c, ACCENT_SURFACES.light, ACCENT_TINT.light, value);
  const darker = (c: string) =>
    worst(c, ACCENT_SURFACES.dark, ACCENT_TINT.dark, value);

  let inkLight = value;
  for (let t = 0.02; lighter(inkLight) < 4.5 && t <= 1; t += 0.02)
    inkLight = mix(value, "#000000", t);
  let inkDark = value;
  for (let t = 0.02; darker(inkDark) < 4.5 && t <= 1; t += 0.02)
    inkDark = mix(value, "#ffffff", t);

  const white = contrast("#ffffff", value);
  const ink = mix(value, "#000000", 0.8);
  const on = white >= 4.5 || white >= contrast(ink, value) ? "#ffffff" : ink;

  const lum = luminance(value);
  const strong =
    lum > 0.18 ? mix(value, "#000000", 0.14) : mix(value, "#000000", 0.22);

  return { value, strong, inkLight, inkDark, rgb: toChannels(value), on };
}
