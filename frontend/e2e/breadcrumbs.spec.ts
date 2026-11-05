import { test, expect, row } from "./support/test";

const DEEP = "/Documents/Reports/2026/Quarterly/Board pack/Final drafts";
const deepUrl =
  "/files" + DEEP.split("/").map(encodeURIComponent).join("/") + "/";

test.describe("breadcrumbs", () => {
  test.beforeEach(async ({ app, fake }) => {
    fake.changeOnDisk(`${DEEP}/summary.txt`, "x");
    await app.goto(deepUrl);
    await expect(row(app, "summary.txt")).toBeVisible();
  });

  test("a deep path folds its middle and keeps the current folder in view @mobile", async ({
    app,
  }) => {
    const nav = app.locator(".fb-hero .breadcrumbs-nav");
    const current = nav.locator(".breadcrumb-link--current");
    await expect(current).toHaveText("Final drafts");
    await expect(current).toBeInViewport({ ratio: 1 });
    await expect(nav.getByTestId("breadcrumb-fold")).toBeVisible();
    // Nothing spills out of the strip.
    const fits = await nav.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1
    );
    expect(fits).toBe(true);
  });

  test("the fold lists the hidden folders and opens one @mobile", async ({
    app,
  }) => {
    const fold = app.locator(".fb-hero").getByTestId("breadcrumb-fold");
    await fold.click();
    const menu = app.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: "Quarterly" })
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Final drafts" })
    ).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Quarterly" }).click();
    await expect(app).toHaveURL(
      /\/files\/Documents\/Reports\/2026\/Quarterly\/$/
    );
    await expect(row(app, "Board pack")).toBeVisible();
  });

  test("a wide window unfolds again", async ({ app }) => {
    const nav = app.locator(".fb-hero .breadcrumbs-nav");
    await app.setViewportSize({ width: 900, height: 800 });
    const narrowCrumbs = await nav.locator(".breadcrumb-link--crumb").count();
    await app.setViewportSize({ width: 2400, height: 800 });
    await expect(nav.getByTestId("breadcrumb-fold")).toHaveCount(0);
    await expect(nav.locator(".breadcrumb-link--crumb")).toHaveCount(5);
    expect(narrowCrumbs).toBeLessThan(5);
  });
});
