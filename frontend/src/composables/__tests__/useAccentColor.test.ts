import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import {
  useAccentColor,
  ACCENT_PRESETS,
  brandingAccent,
  resolveAccent,
} from "@/composables/useAccentColor";
import { usePreferences } from "@/composables/usePreferences";
import { contrast } from "@/utils/color";

beforeEach(() => resetPrefsHarness());
afterEach(() => {
  window.FileBrowser.Color = "";
});

const cssVar = (n: string) =>
  document.documentElement.style.getPropertyValue(n);
const preset = (n: string) => ACCENT_PRESETS.find((p) => p.name === n)!;

describe("ACCENT_PRESETS", () => {
  it("has Green first (the 4.0 default) and keeps the 3.x presets", () => {
    expect(ACCENT_PRESETS.map((p) => p.name)).toEqual([
      "green",
      "iris",
      "indigo",
      "violet",
      "blue",
      "cyan",
      "emerald",
      "amber",
    ]);
    expect(preset("green").value).toBe("#12805c");
  });

  it("gives every preset a label that reads on its fill", () => {
    for (const p of ACCENT_PRESETS)
      expect(contrast(p.on, p.value), p.name).toBeGreaterThanOrEqual(4.5);
    expect(preset("green").on).toBe("#ffffff");
    expect(preset("amber").on).not.toBe("#ffffff");
  });
});

describe("accent precedence", () => {
  it("prefers the user's pick, then the branding colour, then Green", () => {
    const brand = brandingAccent("#c2552e")!;
    expect(resolveAccent("iris", brand).value).toBe(preset("iris").value);
    expect(resolveAccent(undefined, brand).value).toBe("#c2552e");
    expect(resolveAccent("nonsense", brand).value).toBe("#c2552e");
    expect(resolveAccent(undefined, null).value).toBe("#12805c");
  });

  it("ignores an empty or invalid branding colour", () => {
    expect(brandingAccent("")).toBeNull();
    expect(brandingAccent("   ")).toBeNull();
    expect(brandingAccent("not a colour")).toBeNull();
    expect(brandingAccent(undefined)).toBeNull();
  });

  it("applies the branding colour when the user never picked", () => {
    window.FileBrowser.Color = "#c2552e";
    const a = useAccentColor();
    a.init();
    expect(cssVar("--accent")).toBe("#c2552e");
    expect(document.documentElement.dataset.accent).toBe("branding");
    expect(a.accent.value).toBeNull();
  });
});

describe("useAccentColor.setAccent", () => {
  it("writes the preset's source CSS vars + data-accent on <html>", () => {
    useAccentColor().setAccent("blue");
    const p = preset("blue");
    expect(cssVar("--accent")).toBe(p.value);
    expect(cssVar("--accent-strong")).toBe(p.strong);
    expect(cssVar("--accent-ink-light")).toBe(p.inkLight);
    expect(cssVar("--accent-ink-dark")).toBe(p.inkDark);
    expect(cssVar("--accent-rgb")).toBe(p.rgb);
    expect(cssVar("--color-on-accent")).toBe(p.on);
    expect(document.documentElement.dataset.accent).toBe("blue");
  });

  it("persists the choice to the prefs bag", () => {
    useAccentColor().setAccent("blue");
    expect(usePreferences().get("accent.color", null)).toBe("blue");
  });

  it("exposes the presets list", () => {
    expect(useAccentColor().presets).toBe(ACCENT_PRESETS);
  });
});
