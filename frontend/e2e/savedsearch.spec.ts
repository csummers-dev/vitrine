import { test, expect, row } from "./support/test";

// 4.0 Phase 5.3: saved searches ("smart folders").

test.beforeEach(({ fake }) => {
  fake.changeOnDisk("/Movies/trip.mp4", "x".repeat(3000));
  fake.changeOnDisk("/Movies/Extras/bonus.mp4", "x".repeat(10));
  fake.changeOnDisk("/Movies/poster.jpg", "x".repeat(5000));
});

test("save a search from the search box and open it as a live listing", async ({
  app,
  fake,
}) => {
  await row(app, "Movies").dblclick();
  await expect(row(app, "trip.mp4")).toBeVisible();

  await app.locator(".search-trigger").click();
  // Nothing typed yet: examples of what the box understands.
  await expect(app.getByTestId("search-tips")).toContainText("added:7d");
  await app.locator("#search #input input").fill("type:video size:>1k");
  await app.getByTestId("search-save").click();

  const dialog = app.getByTestId("save-search-dialog");
  await expect(dialog.getByTestId("save-search-reading")).toHaveText(
    "Videos · at least 1 KB"
  );
  await dialog.getByLabel("Name").fill("Big videos");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(app).toHaveURL(/\/files\/Movies\/\?saved=/);
  const head = app.getByTestId("saved-search-head");
  await expect(head).toContainText("Big videos");
  await expect(head).toContainText("in Movies");
  await expect(row(app, "trip.mp4")).toBeVisible();
  await expect(row(app, "bonus.mp4")).toHaveCount(0); // too small
  await expect(row(app, "poster.jpg")).toHaveCount(0); // not a video
  // Results aren't a folder: nothing to upload into.
  await expect(app.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(app.getByTestId("saved-searches")).toContainText("Big videos");
  await expect
    .poll(() => fake.preferences["search.saved"])
    .toEqual([
      expect.objectContaining({
        name: "Big videos",
        query: "type:video size:>1k",
        folder: "/Movies",
      }),
    ]);

  // A match landing anywhere under the folder shows up on its own.
  fake.changeOnDisk("/Movies/Extras/new.mp4", "y".repeat(4000));
  await expect(row(app, "new.mp4")).toBeVisible();

  // Close goes back to the plain folder.
  await head.getByRole("button", { name: "Close saved search" }).click();
  await expect(app).toHaveURL(/\/files\/Movies\/$/);
  await expect(row(app, "poster.jpg")).toBeVisible();
});

test.describe("with a saved search", () => {
  test.use({
    prefs: {
      "search.saved": [
        {
          id: "s1",
          name: "Recent photos",
          query: "type:image added:30d",
          folder: "/",
        },
      ],
    },
  });

  test("opens from the sidebar, edits, and deletes", async ({ app, fake }) => {
    await app
      .getByTestId("saved-searches")
      .getByRole("link", { name: "Recent photos" })
      .click();
    await expect(app).toHaveURL(/\/files\/\?saved=s1$/);
    // The poster was just written, so it's within "added:30d"; only images.
    await expect(row(app, "poster.jpg")).toBeVisible();
    await expect(row(app, "trip.mp4")).toHaveCount(0);

    // Edit to something with no matches: the empty state offers a way back.
    await app
      .getByTestId("saved-search-head")
      .getByRole("button", { name: "Edit saved search" })
      .click();
    const dialog = app.getByTestId("save-search-dialog");
    await dialog.getByLabel("Search for").fill("type:audio");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(app.getByText("No matches yet")).toBeVisible();
    await expect(app.getByTestId("saved-search-head")).toContainText(
      "type:audio"
    );

    // Delete from the ⋯ menu returns to the folder and drops it everywhere.
    await app.getByRole("button", { name: "More", exact: true }).click();
    await app
      .getByRole("menuitem", { name: "Delete saved search", exact: true })
      .click();
    await expect(app).toHaveURL(/\/files\/$/);
    await expect(app.getByTestId("saved-searches")).toHaveCount(0);
    await expect.poll(() => fake.preferences["search.saved"]).toEqual([]);
  });

  test("is listed in the command palette", async ({ app }) => {
    await app.keyboard.press("ControlOrMeta+k");
    await app.keyboard.type("recent photos");
    await app
      .getByRole("dialog", { name: "Command palette" })
      .getByRole("button", { name: /Recent photos/ })
      .click();
    await expect(app).toHaveURL(/\/files\/\?saved=s1$/);
    await expect(app.getByTestId("saved-search-head")).toContainText(
      "Recent photos"
    );
  });
});
