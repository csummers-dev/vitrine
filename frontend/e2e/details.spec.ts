import { test, expect, row } from "./support/test";

// Phase 6, 4.5: the details panel (Decision 7).

const panel = (app: import("@playwright/test").Page) =>
  app.getByTestId("details-panel");

test.describe("details panel, docked", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("is open by default on a wide screen and remembers being closed", async ({
    app,
    fake,
  }) => {
    await expect(panel(app)).toBeVisible();
    await expect(app.getByTestId("details-folder")).toContainText("4 items");

    const toggle = app.getByRole("button", { name: "Details", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(panel(app)).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => fake.preferences["details.open"]).toBe(false);

    await app.reload();
    await expect(row(app, "readme.md")).toBeVisible();
    await expect(panel(app)).toBeHidden();

    // ⌘I / Ctrl+I brings it back.
    await row(app, "readme.md").click();
    await app.keyboard.press("ControlOrMeta+i");
    await expect(panel(app)).toBeVisible();
    await expect(panel(app).getByRole("heading", { level: 3 })).toHaveText(
      "readme.md"
    );
  });

  test("shows one item's information and actions", async ({ app }) => {
    await row(app, "readme.md").click();
    await expect(panel(app).getByTestId("details-text-preview")).toContainText(
      "# vitrine"
    );
    await expect(panel(app)).toContainText("Text document · 30 B");
    await expect(panel(app).getByTestId("details-open")).toHaveText("Open");
    await panel(app)
      .getByRole("button", { name: "More actions for readme.md" })
      .click();
    await expect(app.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await app.keyboard.press("Escape");
  });

  test("sums a multiple selection", async ({ app }) => {
    await row(app, "photo.jpg").click();
    await row(app, "readme.md").click({ modifiers: ["Shift"] });
    const multi = app.getByTestId("details-multi");
    await expect(multi).toContainText("2 items selected");
    await expect(multi).toContainText("47 B");
    await expect(panel(app)).toContainText("Image");
    await expect(panel(app)).toContainText("Text document");
  });

  test("shows a folder's size once it is known", async ({ app }) => {
    await row(app, "Documents").click();
    await expect(panel(app)).toContainText("Folder · 24 B");
  });
});

test.describe("details panel, narrow", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("opens over the list with a scrim, and closes from it", async ({
    app,
  }) => {
    await expect(row(app, "readme.md")).toBeVisible();
    await expect(panel(app)).toBeHidden();
    await app.getByRole("button", { name: "Details", exact: true }).click();
    await expect(panel(app)).toBeVisible();
    await expect(app.getByTestId("details-scrim")).toBeVisible();
    // Focus moves into the panel; Escape closes it.
    await expect(
      panel(app).getByRole("button", { name: "Close details" })
    ).toBeFocused();
    await app.keyboard.press("Escape");
    await expect(panel(app)).toBeHidden();

    await app.getByRole("button", { name: "Details", exact: true }).click();
    await app
      .getByTestId("details-scrim")
      .click({ position: { x: 20, y: 400 } });
    await expect(panel(app)).toBeHidden();
  });

  test("is not remembered over the list", async ({ app }) => {
    await app.getByRole("button", { name: "Details", exact: true }).click();
    await expect(panel(app)).toBeVisible();
    await app.reload();
    await expect(row(app, "readme.md")).toBeVisible();
    await expect(panel(app)).toBeHidden();
  });
});

test.describe("details panel, phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("is a bottom sheet opened from the selection bar @mobile", async ({
    app,
  }) => {
    await row(app, "readme.md").locator(".item__select").click();
    await app
      .getByRole("button", { name: "Details", exact: true })
      .first()
      .click();
    await expect(panel(app)).toBeVisible();
    await expect(panel(app)).toHaveClass(/info-pane--sheet/);
    await panel(app).getByRole("button", { name: "Close details" }).click();
    await expect(panel(app)).toBeHidden();
  });
});
