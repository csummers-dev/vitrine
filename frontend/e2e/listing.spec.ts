import { test, expect, row, contextAction } from "./support/test";

test.describe("file listing", () => {
  test("shows folders and files at the root @mobile", async ({ app }) => {
    for (const name of ["Documents", "Music", "readme.md", "photo.jpg"]) {
      await expect(row(app, name)).toBeVisible();
    }
  });

  test("opens a folder and navigates back", async ({ app }) => {
    await row(app, "Documents").dblclick();
    await expect(app).toHaveURL(/\/files\/Documents\/$/);
    await expect(row(app, "notes.txt")).toBeVisible();
    await expect(row(app, "Reports")).toBeVisible();

    await app.goBack();
    await expect(row(app, "readme.md")).toBeVisible();
  });

  test("renames a file from the context menu", async ({ app, fake }) => {
    await contextAction(app, "readme.md", "Rename");
    const input = app.getByRole("textbox", { name: "Rename readme.md" });
    await expect(input).toBeFocused();
    await input.fill("README.md");
    await input.press("Enter");

    await expect(row(app, "README.md")).toBeVisible();
    await expect(row(app, "readme.md")).toHaveCount(0);
    expect(fake.exists("/README.md")).toBe(true);
    expect(fake.exists("/readme.md")).toBe(false);
  });

  test("moves a file to the trash and undoes it", async ({ app, fake }) => {
    await contextAction(app, "photo.jpg", "Delete");
    const dialog = app.getByRole("dialog");
    await expect(dialog).toContainText("Move this file to the Trash?");
    await dialog.getByRole("button", { name: "Move to Trash" }).click();

    await expect(row(app, "photo.jpg")).toHaveCount(0);
    expect(fake.exists("/photo.jpg")).toBe(false);

    await app.getByText("Undo", { exact: true }).click();
    await expect(row(app, "photo.jpg")).toBeVisible();
    expect(fake.exists("/photo.jpg")).toBe(true);
  });

  test("deleted items appear in the Trash view", async ({ app }) => {
    await contextAction(app, "Music", "Delete");
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Move to Trash" })
      .click();
    await expect(row(app, "Music")).toHaveCount(0);

    await app.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(app).toHaveURL(/\/trash/);
    await expect(app.getByText("Music", { exact: true })).toBeVisible();
  });

  test("creates a folder from the background context menu", async ({
    app,
    fake,
  }) => {
    await app
      .locator("main")
      .click({ button: "right", position: { x: 400, y: 500 } });
    await app
      .getByRole("menuitem", { name: "New folder", exact: true })
      .click();
    const input = app.getByPlaceholder("Folder name");
    await input.fill("Projects");
    await input.press("Enter");

    await expect(row(app, "Projects")).toBeVisible();
    expect(fake.exists("/Projects")).toBe(true);
  });
});
