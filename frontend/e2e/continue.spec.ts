import { test, expect, row, contextAction } from "./support/test";

// 4.0 Phase 3.3 / 3.4: the Continue shelf and video watched state, driven by
// the progress maps in user preferences.
test.use({
  prefs: {
    "video.positions": {
      "/Documents/movie.mp4": { t: 900, dur: 3600, at: 2 },
    },
    "comic.positions": {
      "/Documents/issue1.cbz": { page: 3, total: 24, at: 1 },
    },
  },
});

test("lists started media in the Continue shelf", async ({ app }) => {
  const shelf = app.getByTestId("continue-shelf");
  await expect(shelf).toBeVisible();
  await expect(shelf.getByRole("link")).toHaveText(["movie.mp4", "issue1.cbz"]);
  await expect(shelf.getByRole("link").first()).toHaveAttribute(
    "title",
    /Video · 25%/
  );
});

test("removes an item from the shelf", async ({ app, fake }) => {
  const shelf = app.getByTestId("continue-shelf");
  await shelf
    .getByRole("link", { name: "issue1.cbz" })
    .click({ button: "right" });
  await app.getByRole("menuitem", { name: "Remove from Continue" }).click();
  await expect(shelf.getByRole("link")).toHaveText(["movie.mp4"]);
  await expect
    .poll(() => Object.keys(fake.preferences["comic.positions"] as object))
    .toEqual([]);
});

test("marks a video watched from the listing", async ({ app, fake }) => {
  fake.changeOnDisk("/Documents/movie.mp4", "not really a video");
  await row(app, "Documents").dblclick();
  const movie = row(app, "movie.mp4");
  await expect(movie.locator(".item__progress")).toBeVisible();
  await contextAction(app, "movie.mp4", "Mark watched");
  await expect(movie.locator(".item__watched")).toBeVisible();
  // Watched videos leave the Continue shelf.
  await expect(app.getByTestId("continue-shelf").getByRole("link")).toHaveText([
    "issue1.cbz",
  ]);
});
