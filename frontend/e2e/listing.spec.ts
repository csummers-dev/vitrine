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

test.describe("sorting and layout", () => {
  test("clicking the Name header reverses the order and saves it", async ({
    app,
    fake,
  }) => {
    const names = () =>
      app
        .locator('[data-index]:not([style*="-9999px"] *)')
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    await expect
      .poll(names)
      .toEqual(["Documents", "Music", "photo.jpg", "readme.md"]);

    await app.getByRole("button", { name: "Sort by name" }).click();
    await expect
      .poll(names)
      .toEqual(["Music", "Documents", "readme.md", "photo.jpg"]);
    expect(
      fake.calls.some((c) => c.method === "PUT" && c.path === "/users/1")
    ).toBe(true);
  });

  test("the View menu switches to the grid layout", async ({ app }) => {
    await app.getByRole("button", { name: /View options/ }).click();
    await app.getByRole("menuitem", { name: "Grid", exact: true }).click();
    await expect(
      app.getByRole("button", { name: "View options — current: Grid" })
    ).toBeVisible();
    await expect(row(app, "readme.md")).toBeVisible();
  });
});

test("uploads a file from the file picker", async ({ app, fake }) => {
  await app.locator("#upload-input").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("uploaded in a smoke test"),
  });
  await expect(row(app, "hello.txt")).toBeVisible();
  expect(fake.fs.get("/hello.txt")?.content).toBe("uploaded in a smoke test");
});

test.describe("drag and drop", () => {
  test("dragging a file onto a folder's name moves it there", async ({
    app,
    fake,
  }) => {
    const target = row(app, "Music").locator(".item__name-text").first();
    await row(app, "readme.md").dragTo(target, {
      targetPosition: { x: 12, y: 8 },
    });
    await expect(row(app, "readme.md")).toHaveCount(0);
    expect(fake.exists("/Music/readme.md")).toBe(true);
  });

  test("split view: Parent folder is disabled at the root", async ({ app }) => {
    await app.getByRole("button", { name: /View options/ }).click();
    await app
      .getByRole("menuitem", { name: "Split view", exact: true })
      .click();
    const parent = app.getByRole("button", { name: "Parent folder" }).first();
    await expect(parent).toBeDisabled();
  });
});

test("copies a file and pastes it into another folder", async ({
  app,
  fake,
}) => {
  await contextAction(app, "readme.md", "Copy");
  await row(app, "Music").dblclick();
  await expect(app).toHaveURL(/\/files\/Music\/$/);
  await app
    .locator("main")
    .click({ button: "right", position: { x: 400, y: 500 } });
  await app.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(row(app, "readme.md")).toBeVisible();
  expect(fake.exists("/Music/readme.md")).toBe(true);
  expect(fake.exists("/readme.md")).toBe(true);
});

test.describe("live updates", () => {
  test("a file added outside vitrine appears without a refresh", async ({
    app,
    fake,
  }) => {
    await expect(row(app, "readme.md")).toBeVisible();
    fake.changeOnDisk("/downloaded.mkv", "movie bytes");
    await expect(row(app, "downloaded.mkv")).toBeVisible();
  });

  test("a file removed outside vitrine disappears, keeping the selection", async ({
    app,
    fake,
  }) => {
    await row(app, "readme.md").click();
    await expect(row(app, "readme.md")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fake.changeOnDisk("/photo.jpg", null);
    await expect(row(app, "photo.jpg")).toHaveCount(0);
    await expect(row(app, "readme.md")).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("changes to other folders don't refresh this one", async ({
    app,
    fake,
  }) => {
    await expect(row(app, "readme.md")).toBeVisible();
    const before = fake.calls.filter((c) => c.path === "/resources/").length;
    fake.changeOnDisk("/Music/new.flac", "x");
    await app.waitForTimeout(1500);
    const after = fake.calls.filter((c) => c.path === "/resources/").length;
    expect(after).toBe(before);
  });
});
