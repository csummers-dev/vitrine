/**
 * The component gallery (/dev/ui, dev builds only) in every state at once:
 * one baseline per theme guards all shared components. Also checks the
 * gallery has no serious accessibility violations.
 */
import { expectAccessible } from "../support/a11y";
import { test, expect, snap, SIZES, THEMES } from "./fixtures";

for (const theme of THEMES) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, locale: "en-US", timezoneId: "UTC" });

    test(`gallery desktop`, async ({ page, fake }) => {
      await page.setViewportSize({ width: 1440, height: 1600 });
      await fake.install(page);
      await page.goto("/dev/ui");
      await expect(page.getByTestId("ui-gallery")).toBeVisible();
      await snap(page, `gallery-${theme}-desktop`);
      await expectAccessible(page);
    });

    test(`gallery dialog`, async ({ page, fake }) => {
      await page.setViewportSize(SIZES.desktop);
      await fake.install(page);
      await page.goto("/dev/ui?state=dialog");
      await expect(
        page.getByRole("dialog", { name: "Delete 3 items?" })
      ).toBeVisible();
      await snap(page, `gallery-dialog-${theme}-desktop`);
      await expectAccessible(page);
    });

    test(`gallery dialog phone`, async ({ page, fake }) => {
      await page.setViewportSize(SIZES.phone);
      await fake.install(page);
      await page.goto("/dev/ui?state=dialog");
      await expect(page.getByRole("dialog")).toBeVisible();
      await snap(page, `gallery-dialog-${theme}-phone`);
    });

    test(`gallery menu`, async ({ page, fake }) => {
      await page.setViewportSize(SIZES.desktop);
      await fake.install(page);
      await page.goto("/dev/ui?state=menu");
      await expect(
        page.getByRole("menuitem", { name: /Rename/ })
      ).toBeVisible();
      await snap(page, `gallery-menu-${theme}-desktop`);
    });
  });
}
