/**
 * Screenshot baselines for every state in ./screens.ts, in light and dark at
 * the sizes each one matters for.
 */
import { test, snap, shotName, SIZES, THEMES } from "./fixtures";
import { SCREENS } from "./screens";

for (const theme of THEMES) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, locale: "en-US", timezoneId: "UTC" });

    for (const screen of SCREENS) {
      for (const size of screen.sizes) {
        test(`${screen.name} ${size}`, async ({ page, fake }) => {
          await page.setViewportSize(SIZES[size]);
          await screen.open({ page, fake });
          await snap(page, shotName(screen.name, theme, size));
        });
      }
    }
  });
}
