import { test, expect, row } from "./support/test";

// Phase 6, Step 3: the sidebar, back/forward, the Recent page, favorites.

test.describe("sidebar", () => {
  test("lists the places in order and marks the current one", async ({
    app,
  }) => {
    const places = app.getByRole("navigation", { name: "Places" });
    await expect(places.getByRole("button")).toHaveText([
      /My files/,
      "Recent",
      "Storage",
      "Duplicates",
      "Trash",
    ]);
    await expect(
      places.getByRole("button", { name: "My files" })
    ).toHaveAttribute("aria-current", "page");

    await places.getByRole("button", { name: "Duplicates" }).click();
    await expect(app).toHaveURL(/\/duplicates/);
    await expect(
      places.getByRole("button", { name: "Duplicates" })
    ).toHaveAttribute("aria-current", "page");
  });

  test.describe("favorites", () => {
    test.use({ prefs: { favorites: ["/files/Music/"] } });

    test("show a colour dot that can be changed", async ({ app, fake }) => {
      const fav = app.getByRole("link", { name: "Music" });
      await expect(fav.locator(".s-fav-dot")).toBeVisible();
      await fav.click({ button: "right" });
      await app.getByRole("menuitem", { name: "Change colour…" }).click();
      const dialog = app.getByRole("dialog", { name: "Favorite colour" });
      await dialog.getByRole("radio", { name: "Pink" }).click();
      await expect(dialog.getByRole("radio", { name: "Pink" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      await dialog.getByRole("button", { name: "Done" }).click();
      await expect(fav.locator(".s-fav-dot")).toHaveClass(/fav-dot--comic/);
      await expect
        .poll(() => fake.preferences.favoriteColors)
        .toEqual({ "/files/Music/": "comic" });
    });

    test("show as dots in the collapsed rail", async ({ app }) => {
      await app.getByRole("button", { name: "Collapse sidebar" }).click();
      const rail = app.getByRole("navigation", { name: "Favorites" });
      await expect(rail.locator(".s-fav-dot--rail")).toHaveCount(1);
      await rail.getByRole("button", { name: "Music" }).click();
      await expect(app).toHaveURL(/\/files\/Music\/$/);
    });
  });
});

test.describe("back and forward", () => {
  test("follow the app's own history, with buttons and Alt+arrows", async ({
    app,
  }) => {
    const back = app.getByRole("button", { name: "Back", exact: true });
    const forward = app.getByRole("button", { name: "Forward", exact: true });
    await expect(back).toBeDisabled();
    await expect(forward).toBeDisabled();

    await row(app, "Documents").dblclick();
    await expect(app).toHaveURL(/\/files\/Documents\/$/);
    await expect(back).toBeEnabled();

    await back.click();
    await expect(app).toHaveURL(/\/files\/$/);
    await expect(back).toBeDisabled();
    await expect(forward).toBeEnabled();

    await app.keyboard.press("Alt+ArrowRight");
    await expect(app).toHaveURL(/\/files\/Documents\/$/);
    await app.keyboard.press("Alt+ArrowLeft");
    await expect(app).toHaveURL(/\/files\/$/);

    // A reload keeps the position.
    await app.reload();
    await expect(row(app, "Documents")).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Forward", exact: true })
    ).toBeEnabled();
  });
});

test.describe("Recent", () => {
  test.use({
    prefs: {
      recents: [
        { path: "/readme.md", name: "readme.md", isDir: false, accessedAt: 2 },
        {
          path: "/Documents/notes.txt",
          name: "notes.txt",
          isDir: false,
          accessedAt: 1,
        },
      ],
    },
  });

  test("lists opened files, opens them and removes entries", async ({
    app,
  }) => {
    await app
      .getByRole("navigation", { name: "Places" })
      .getByRole("button", { name: "Recent" })
      .click();
    await expect(app).toHaveURL(/\/recent$/);
    const list = app.getByTestId("recent-list");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText("readme");

    await app.getByRole("button", { name: "More for notes.txt" }).click();
    await app.getByRole("menuitem", { name: "Remove from Recent" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    await list.getByRole("button", { name: /^readme/ }).click();
    await expect(app).toHaveURL(/\/files\/readme\.md$/);
  });

  test("drops a file deleted elsewhere", async ({ app, fake }) => {
    await app.goto("/recent");
    await expect(
      app.getByTestId("recent-list").getByRole("listitem")
    ).toHaveCount(2);
    fake.changeOnDisk("/Documents/notes.txt", null);
    await expect(
      app.getByTestId("recent-list").getByRole("listitem")
    ).toHaveCount(1);
  });

  test("shows an empty state when cleared", async ({ app }) => {
    await app.goto("/recent");
    await app.getByRole("button", { name: "Clear list" }).click();
    await expect(app.getByText("No recent files")).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("opens the drawer and navigates @mobile", async ({ app }) => {
    await app.getByRole("button", { name: "Open navigation menu" }).click();
    await app.getByRole("button", { name: "Storage" }).click();
    await expect(app).toHaveURL(/\/storage/);
  });

  test("puts Upload in the More menu @mobile", async ({ app }) => {
    await expect(
      app.getByRole("button", { name: "Upload", exact: true })
    ).toBeHidden();
    await app.getByRole("button", { name: "More", exact: true }).click();
    await expect(app.getByRole("menuitem", { name: "Upload" })).toBeVisible();
  });
});
