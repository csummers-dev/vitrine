/**
 * Phase 6, 1.3: every text-on-surface pairing the UI uses meets WCAG AA in
 * both themes — body text 4.5:1, icons, kind dots and the focus ring 3:1 —
 * and every accent preset does too on its own fills and tints. Token values
 * are read straight from tokens.css, so a colour change that breaks
 * contrast fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrast, over, parseColor, ACCENT_TINT } from "@/utils/color";
import { ACCENT_PRESETS } from "@/composables/useAccentColor";

const css = readFileSync(resolve(__dirname, "../tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** Declarations of every top-level block whose selector matches. */
function block(selector: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css)); ) {
    const sel = m[1].split(";").pop()!.trim();
    if (!selector.test(sel)) continue;
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}

const light = { ...block(/^@theme$/), ...block(/^:root$/) };
// The reduced-motion block is also `:root`, but only sets durations.
const dark = { ...light, ...block(/^html\.dark$/) };

function value(vars: Record<string, string>, name: string, depth = 0): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`no token ${name}`);
  if (depth > 10) throw new Error(`token loop at ${name}`);
  return raw.replace(/var\((--[\w-]+)\)/g, (_, n) => value(vars, n, depth + 1));
}

const themes = { light, dark } as const;
type Theme = keyof typeof themes;
const tok = (t: Theme, n: string) => {
  const v = value(themes[t], n);
  if (!parseColor(v)) throw new Error(`${n} is not a colour: ${v}`);
  return v;
};
/** A colour as it shows on an opaque surface (translucent tints). */
const on = (t: Theme, n: string, surface: string) =>
  over(tok(t, n), tok(t, surface));

const SURFACES = [
  "--color-surface",
  "--color-panel",
  "--color-canvas",
  "--color-raised",
];
const KINDS = [
  "folder",
  "video",
  "audio",
  "image",
  "pdf",
  "text",
  "archive",
  "epub",
  "comic",
  "csv",
  "code",
  "file",
  "error",
];
const TAGS = [
  "lilac",
  "blue",
  "green",
  "amber",
  "red",
  "pink",
  "slate",
  "teal",
];

for (const t of ["light", "dark"] as Theme[]) {
  describe(`${t} theme`, () => {
    it("body text (ink 1–3) is 4.5:1 on every surface", () => {
      for (const ink of ["--color-ink-1", "--color-ink-2", "--color-ink-3"])
        for (const s of SURFACES)
          expect(
            contrast(tok(t, ink), tok(t, s)),
            `${ink} on ${s}`
          ).toBeGreaterThanOrEqual(4.5);
    });

    it("text on hover and selected fills stays 4.5:1", () => {
      for (const fill of [
        "--color-hover",
        "--color-selected",
        "--color-elevated",
      ])
        for (const ink of ["--color-ink-1", "--color-ink-2", "--color-ink-3"]) {
          const bg = on(t, fill, "--color-surface");
          expect(
            contrast(tok(t, ink), bg),
            `${ink} on ${fill}`
          ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("kind labels are 4.5:1 on their tints", () => {
      for (const k of KINDS)
        for (const s of SURFACES) {
          const bg = on(t, `--tint-${k}-bg`, s);
          expect(
            contrast(tok(t, `--tint-${k}-fg`), bg),
            `${k} over ${s}`
          ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("kind solids (treemap, dots) are 3:1 against the surface", () => {
      for (const k of KINDS.filter(
        (k) => !["file", "error"].includes(k)
      ).concat("other")) {
        const solid = tok(t, `--kind-${k}-solid`);
        expect(
          contrast(solid, tok(t, "--color-surface")),
          k
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it("tag labels are 4.5:1 on their chips", () => {
      for (const c of TAGS)
        for (const s of SURFACES) {
          const bg = on(t, `--tag-color-${c}-bg`, s);
          expect(
            contrast(tok(t, `--tag-color-${c}-fg`), bg),
            c
          ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("status text is 4.5:1 on surfaces and on its own wash", () => {
      for (const k of ["danger", "success", "warning"]) {
        const fg = tok(t, `--status-${k}`);
        for (const s of SURFACES)
          expect(
            contrast(fg, tok(t, s)),
            `${k} on ${s}`
          ).toBeGreaterThanOrEqual(4.5);
        for (const s of SURFACES) {
          const wash = on(t, `--status-${k}-soft`, s);
          expect(
            contrast(fg, wash),
            `${k} on its wash over ${s}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("white labels are 4.5:1 on status fills", () => {
      for (const f of [
        "--status-danger-fill",
        "--status-danger-fill-strong",
        "--status-success-fill",
        "--status-warning-fill",
      ])
        expect(contrast("#ffffff", tok(t, f)), f).toBeGreaterThanOrEqual(4.5);
    });

    it("favourite and danger icons are 3:1 on surfaces", () => {
      for (const c of ["--c-amber", "--c-rose"])
        for (const s of SURFACES)
          expect(
            contrast(tok(t, c), tok(t, s)),
            `${c} on ${s}`
          ).toBeGreaterThanOrEqual(3);
    });

    it("inverse surfaces (toasts, pills) carry white text", () => {
      expect(
        contrast("#ffffff", tok(t, "--color-inverse-surface"))
      ).toBeGreaterThanOrEqual(4.5);
    });
  });
}

describe("accent presets", () => {
  for (const p of ACCENT_PRESETS) {
    it(`${p.label}: fills, text, tints and focus ring`, () => {
      expect(contrast(p.on, p.value), "label on fill").toBeGreaterThanOrEqual(
        4.5
      );
      expect(
        contrast(p.on, p.strong),
        "label on hover fill"
      ).toBeGreaterThanOrEqual(4.5);
      for (const [t, ink] of [
        ["light", p.inkLight],
        ["dark", p.inkDark],
      ] as const) {
        for (const s of SURFACES) {
          const surface = tok(t, s);
          const tint = over(
            { ...parseColor(p.value)!, a: ACCENT_TINT[t] },
            surface
          );
          expect(
            contrast(ink, surface),
            `${t} text on ${s}`
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            contrast(ink, tint),
            `${t} text on tint over ${s}`
          ).toBeGreaterThanOrEqual(4.5);
          // The focus ring is drawn in the accent ink colour.
          expect(
            contrast(ink, surface),
            `${t} focus ring on ${s}`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it("the CSS defaults are the Green preset (first paint before scripts)", () => {
    const g = ACCENT_PRESETS[0];
    expect(value(light, "--accent")).toBe(g.value);
    expect(value(light, "--accent-strong")).toBe(g.strong);
    expect(value(light, "--accent-ink-light")).toBe(g.inkLight);
    expect(value(light, "--accent-ink-dark")).toBe(g.inkDark);
    expect(value(light, "--accent-rgb")).toBe(g.rgb);
  });

  it("the CSS tint strength matches the one the presets are checked against", () => {
    expect(value(light, "--color-selected")).toBe(
      `rgb(${ACCENT_PRESETS[0].rgb} / ${ACCENT_TINT.light})`
    );
    expect(value(dark, "--color-selected")).toBe(
      `rgb(${ACCENT_PRESETS[0].rgb} / ${ACCENT_TINT.dark})`
    );
  });
});
