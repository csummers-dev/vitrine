import { test, expect, row, contextAction } from "./support/test";

// Phase 6, 6.2: every prompt is on the shared dialog shell.

test("a dialog traps focus, closes on Escape and returns focus", async ({
  app,
}) => {
  await row(app, "photo.jpg").click();
  await expect(row(app, "photo.jpg")).toBeFocused();
  await app.keyboard.press("Delete");

  const dialog = app.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Named by its heading; Cancel (the safe choice) has focus.
  await expect(dialog).toHaveAccessibleName("Move this file to the Trash?");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", {
    name: "Move this file to the Trash",
  });
  await expect(cancel).toBeFocused();

  // Tab stays inside: Cancel → confirm → back to Cancel.
  await app.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await app.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await app.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();

  // Enter on Cancel cancels (it doesn't confirm).
  await cancel.focus();
  await app.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(row(app, "photo.jpg")).toBeVisible();

  // Escape closes too, and focus goes back to where it was.
  await row(app, "photo.jpg").click();
  await app.keyboard.press("Delete");
  await expect(app.getByRole("dialog")).toBeVisible();
  await app.keyboard.press("Escape");
  await expect(app.getByRole("dialog")).toHaveCount(0);
  await expect(row(app, "photo.jpg")).toBeFocused();
});

test("a click on the scrim closes a dialog", async ({ app }) => {
  await contextAction(app, "readme.md", "Delete");
  await expect(app.getByRole("dialog")).toBeVisible();
  await app.mouse.click(10, 10);
  await expect(app.getByRole("dialog")).toHaveCount(0);
  await expect(row(app, "readme.md")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a dialog is a bottom sheet @mobile", async ({ app }) => {
    await row(app, "readme.md").locator(".item__select").click();
    await app
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();
    const dialog = app.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // Full width, flush with the bottom of the screen.
    expect(Math.round(box!.width)).toBe(390);
    expect(Math.round(box!.y + box!.height)).toBe(844);
  });
});
