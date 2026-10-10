import { test, expect, row } from "./support/test";

async function gridView(app: import("@playwright/test").Page) {
  await app.getByRole("button", { name: /View options/ }).click();
  await app.getByRole("menuitem", { name: "Grid", exact: true }).click();
}

// 4.0 Phase 3.2: folder tiles show cover art found inside the folder.
test("folder tiles show cover art in the grid", async ({ app, fake }) => {
  fake.changeOnDisk("/Music/folder.jpg", "cover");
  await gridView(app);
  await expect(row(app, "Music").locator("img.item__thumb")).toBeVisible();
  // No cover file: the tile keeps its folder icon.
  await expect(row(app, "Documents").locator("img.item__thumb")).toHaveCount(0);
});

test.describe("with folder covers turned off", () => {
  test.use({ prefs: { "view.folderCovers": false } });

  test("folder tiles keep their icons", async ({ app, fake }) => {
    fake.changeOnDisk("/Music/folder.jpg", "cover");
    await gridView(app);
    await expect(row(app, "Music")).toBeVisible();
    await expect(row(app, "Music").locator("img.item__thumb")).toHaveCount(0);
  });
});
