/**
 * Phase 6, 7.1: axe on every screen in the inventory, light and dark. Uses
 * the screenshot suite's states (visual/screens.ts) and seed, so a new
 * screen gets an accessibility check as soon as it gets a baseline. Each
 * state is opened once, at its first size, in light; then the OS theme is
 * switched to dark (the app follows it live) and checked again.
 */
import { test, expect, SIZES } from "./visual/fixtures";
import { SCREENS } from "./visual/screens";
import { expectAccessible } from "./support/a11y";

test.use({ colorScheme: "light", locale: "en-US", timezoneId: "UTC" });

for (const screen of SCREENS) {
  const size = screen.sizes[0];
  test(`a11y ${screen.name} ${size}`, async ({ page, fake }) => {
    await page.setViewportSize(SIZES[size]);
    // No colour transitions: switching to dark mid-run must not be read
    // half-way through a fade.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await screen.open({ page, fake });
    await test.step("light", () => expectAccessible(page));
    // Reduced motion still leaves 0.01 ms transitions, and a colour read in
    // the same frame as the switch is the old one: turn transitions off
    // outright and let two frames pass before checking dark.
    await page.addStyleTag({
      content:
        "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.evaluate(
      "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
    );
    await test.step("dark", () => expectAccessible(page));
  });
}
