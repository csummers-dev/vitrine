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
    await screen.open({ page, fake });
    await test.step("light", () => expectAccessible(page));
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await test.step("dark", () => expectAccessible(page));
  });
}
