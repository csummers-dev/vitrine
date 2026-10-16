import { test, expect } from "./support/test";

// Phase 6, 5.4: the settings shell and the Global "Library and sharing" group.

test("Global groups the sharing settings, each with its risk", async ({
  app,
  fake,
}) => {
  await app.goto("/settings/global");
  const group = app.getByTestId("global-library");
  await expect(group).toContainText("Library and sharing");

  const fileRequests = group.getByRole("switch", {
    name: "Allow upload-only share links",
  });
  const twoFactor = group.getByRole("switch", {
    name: "Require two-factor sign-in for admins",
  });
  await expect(fileRequests).toBeVisible();
  await expect(twoFactor).toBeVisible();
  await expect(
    group.getByRole("combobox", { name: "Most files a user uploads at once" })
  ).toBeVisible();
  await expect(group).toContainText(
    "Anyone with such a link can fill your disk"
  );

  await fileRequests.click();
  await app.getByRole("button", { name: "Update" }).click();
  await expect.poll(() => fake.settings.uploadSharesEnabled).toBe(true);

  // The server refuses to require two-factor while yours is off: the reason
  // shows beside the toggle, not as a toast.
  await twoFactor.click();
  await app.getByRole("button", { name: "Update" }).click();
  await expect(group.getByRole("alert")).toHaveText(
    "Set up two-factor sign-in for your own account first."
  );
  expect(fake.settings.requireAdminTwoFactor).toBeFalsy();
  // Changing the toggle clears it.
  await twoFactor.click();
  await expect(group.getByRole("alert")).toHaveCount(0);
});

test("the rail marks the current section", async ({ app }) => {
  await app.goto("/settings/sessions");
  const rail = app.getByRole("navigation", { name: "Settings sections" });
  await expect(rail.getByRole("link", { name: "Sessions" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await rail.getByRole("link", { name: "Profile Settings" }).click();
  await expect(app).toHaveURL(/\/settings\/profile$/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("settings is a list that opens each section @mobile", async ({
    app,
  }) => {
    await app.goto("/settings");
    await expect(app.getByTestId("settings-home")).toBeVisible();
    await app.getByRole("link", { name: "Sessions" }).click();
    await expect(app).toHaveURL(/\/settings\/sessions$/);
    await app.getByTestId("settings-back").click();
    await expect(app).toHaveURL(/\/settings$/);
    await app.getByRole("link", { name: "My files" }).click();
    await expect(app).toHaveURL(/\/files\/$/);
  });
});

test("a wide screen goes straight to Profile", async ({ app }) => {
  await app.goto("/settings");
  await expect(app).toHaveURL(/\/settings\/profile$/);
});
