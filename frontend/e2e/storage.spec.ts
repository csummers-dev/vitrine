import { test, expect, row } from "./support/test";

// 4.0 Phase 5.1: the Storage view.

test.beforeEach(({ fake }) => {
  fake.changeOnDisk("/Movies/film.mp4", "x".repeat(60_000));
  fake.changeOnDisk("/Movies/Extras/bonus.mp4", "x".repeat(20_000));
  fake.changeOnDisk("/Music/song.mp3", "x".repeat(8_000));
});

test("shows what uses space, drills in, and trashes from the map", async ({
  app,
  fake,
}) => {
  await app.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(app).toHaveURL(/\/storage$/);

  const map = app.getByTestId("storage-map");
  // The biggest folder is a block, labelled for screen readers.
  const movies = map.locator('[data-path="/Movies"]').first();
  await expect(movies).toHaveAttribute(
    "aria-label",
    /^Movies: 78\.13 KiB, 90\.8% of this folder \(folder, 2 files\)$/
  );
  await expect(app.getByTestId("storage-usage")).toContainText(
    "698.49 GiB free of 931.32 GiB"
  );
  await expect(app.getByTestId("storage-usage")).toContainText("25.0% used");
  // No duplicate scan yet: no shortcut.
  await expect(app.getByTestId("storage-dupes-pill")).toHaveCount(0);

  // The ranked list is the accessible equivalent: biggest first.
  const largest = app.getByTestId("storage-largest").getByRole("button");
  await expect(largest.first()).toContainText("film.mp4");
  await expect(largest.nth(1)).toContainText("bonus.mp4");

  // Drill into Movies; the crumbs lead back out.
  // A folder showing its contents is clicked on its name strip.
  await movies.click({ position: { x: 12, y: 8 } });
  await expect(app).toHaveURL(/\/storage\?path=\/Movies$/);
  await expect(
    app.getByRole("navigation", { name: "Folder" }).getByRole("button")
  ).toHaveText(["My files", "Movies"]);
  await expect(largest).toHaveCount(2);

  // Move a file to the trash from its block's menu.
  await map
    .locator('[data-path="/Movies/film.mp4"]')
    .click({ button: "right" });
  await app.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(largest).toHaveCount(1);
  expect(fake.exists("/Movies/film.mp4")).toBe(false);

  await app
    .getByRole("navigation", { name: "Folder" })
    .getByRole("button", { name: "My files" })
    .click();
  await expect(app).toHaveURL(/\/storage$/);
});

test("a largest file opens in its folder, selected", async ({ app }) => {
  await app.goto("/storage");
  await app
    .getByTestId("storage-largest")
    .getByRole("button", { name: /bonus\.mp4/ })
    .click();
  await expect(app).toHaveURL(/\/files\/Movies\/Extras\/$/);
  await expect(row(app, "bonus.mp4")).toHaveAttribute("aria-selected", "true");
});

// Phase 6, 5.1.
test("offers the duplicates found by the last scan", async ({ app, fake }) => {
  fake.changeOnDisk("/Movies/film copy.mp4", "x".repeat(60_000));
  fake.dupeScan = { opts: { path: "/" }, polls: 1 };
  await app.goto("/storage");
  const pill = app.getByTestId("storage-dupes-pill");
  await expect(pill).toContainText("58.59 KiB in duplicates · Review");
  await pill.click();
  await expect(app).toHaveURL(/\/duplicates$/);
});

test("arrow keys move through the treemap", async ({ app }) => {
  await app.goto("/storage");
  const blocks = app.getByTestId("storage-map").locator(".storage-block");
  await expect(blocks.first()).toBeVisible();
  // One block in the tab order.
  await expect(app.locator('.storage-block[tabindex="0"]')).toHaveCount(1);
  await blocks.first().focus();
  await app.keyboard.press("ArrowRight");
  await expect(blocks.nth(1)).toBeFocused();
  await app.keyboard.press("End");
  await expect(blocks.last()).toBeFocused();
  await app.keyboard.press("Home");
  await expect(blocks.first()).toBeFocused();
});

test("says so when the folder can't be measured", async ({ app }) => {
  await app.goto("/storage?path=/Nope");
  await expect(app.getByTestId("storage-error")).toBeVisible();
  await expect(app.getByTestId("storage-summary")).toContainText(
    "Couldn’t measure this folder"
  );
});
