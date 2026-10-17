import { test, expect, row } from "./support/test";

// Phase 6, 7.2: nothing moves when thumbnails or folder sizes arrive late.
// Both are slowed down and the page's layout shift is summed while they
// land, in each view.

test.beforeEach(async ({ fake }) => {
  for (const n of ["a", "b", "c", "d"])
    fake.changeOnDisk(`/Photos/${n}.jpg`, n);
  fake.changeOnDisk("/Documents/more.txt", "more");
  fake.delays["/preview/"] = 700;
  fake.delays["/folder-size"] = 700;
});

for (const view of ["List", "Icons", "Gallery"] as const) {
  test(`no layout shift as thumbnails and sizes arrive (${view})`, async ({
    app,
  }) => {
    if (view !== "List") {
      await app.getByRole("radio", { name: view }).click();
      await expect(app.getByRole("radio", { name: view })).toBeChecked();
    }
    await app.evaluate(`(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: false });
    })()`);
    // In-app navigation, so the observer keeps running: into Photos, where
    // the thumbnails land late…
    await row(app, "Photos").dblclick();
    await expect(app).toHaveURL(/\/files\/Photos\/$/);
    await expect(row(app, "a.jpg")).toBeVisible();
    await app.evaluate(`window.__cls = 0`);
    await app.waitForTimeout(1500);
    const photos = (await app.evaluate(`window.__cls`)) as number;
    // …and back up, where the folder sizes land late.
    await app.keyboard.press("Alt+ArrowUp");
    await expect(row(app, "Documents")).toBeVisible();
    await app.evaluate(`window.__cls = 0`);
    await app.waitForTimeout(1500);
    const root = (await app.evaluate(`window.__cls`)) as number;
    expect(photos, "layout shift as thumbnails arrive").toBeLessThan(0.01);
    expect(root, "layout shift as folder sizes arrive").toBeLessThan(0.01);
  });
}
