import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import { useAccentColor, ACCENT_PRESETS } from "@/composables/useAccentColor";
import { usePreferences } from "@/composables/usePreferences";

beforeEach(() => resetPrefsHarness());

const cssVar = (n: string) =>
  document.documentElement.style.getPropertyValue(n);

describe("ACCENT_PRESETS", () => {
  it("has the six named hues in order", () => {
    expect(ACCENT_PRESETS.map((p) => p.name)).toEqual([
      "indigo",
      "violet",
      "blue",
      "cyan",
      "emerald",
      "amber",
    ]);
  });

  it("uses a DARK on-accent foreground for the light hues (cyan/amber) and white for the rest", () => {
    const on = (name: string) =>
      ACCENT_PRESETS.find((p) => p.name === name)!.on;
    expect(on("cyan")).not.toBe("#ffffff");
    expect(on("amber")).not.toBe("#ffffff");
    expect(on("violet")).toBe("#ffffff");
    expect(on("emerald")).toBe("#ffffff");
  });
});

describe("useAccentColor.setAccent", () => {
  it("writes the preset's source CSS vars + data-accent on <html>", () => {
    useAccentColor().setAccent("emerald");
    expect(cssVar("--accent")).toBe("#10b981");
    expect(cssVar("--accent-strong")).toBe("#0a9468");
    expect(cssVar("--accent-rgb")).toBe("16 185 129");
    expect(cssVar("--color-on-accent")).toBe("#ffffff");
    expect(document.documentElement.dataset.accent).toBe("emerald");
  });

  it("applies the dark on-accent foreground for the amber preset", () => {
    useAccentColor().setAccent("amber");
    expect(cssVar("--accent")).toBe("#f59e0b");
    expect(cssVar("--color-on-accent")).toBe("#3d2a04");
  });

  it("persists the choice to the prefs bag", () => {
    useAccentColor().setAccent("blue");
    expect(usePreferences().get("accent.color", "violet")).toBe("blue");
  });

  it("exposes the presets list", () => {
    expect(useAccentColor().presets).toBe(ACCENT_PRESETS);
  });
});
