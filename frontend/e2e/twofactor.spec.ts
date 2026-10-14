import { test, expect } from "./support/test";

// 4.0 Phase 4.4: set up TOTP, then sign in with a code.
test("sets up two-factor sign-in and uses it to log in", async ({
  app,
  fake,
}) => {
  test.slow(); // two full sign-in flows
  await app.goto("/settings/profile");
  const box = app.getByTestId("two-factor");
  await box.getByRole("button", { name: "Set up" }).click();
  await expect(box.getByTestId("two-factor-secret")).toHaveText(
    "JBSW Y3DP EHPK 3PXP"
  );
  await box.getByLabel("Authentication code").fill("123456");
  await box.getByRole("button", { name: "Turn on" }).click();
  await expect(box.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  await box.getByRole("button", { name: "I've saved them" }).click();
  await expect(box.getByText("10 recovery codes left.")).toBeVisible();
  expect(fake.twoFactor.enabled).toBe(true);

  // Sign out and back in: the password step asks for a code.
  await app.evaluate(() => localStorage.setItem("jwt", ""));
  await app.goto("/login");
  await app.getByLabel("Username", { exact: true }).fill("admin");
  await app
    .getByLabel("Password", { exact: true })
    .fill("correct-horse-battery");
  await app.getByRole("button", { name: "Sign In", exact: true }).click();
  const code = app.getByLabel("Authentication code");
  await expect(code).toBeFocused();
  await code.fill("000000");
  await app.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(app.getByRole("alert")).toContainText("That code didn't work");
  await code.fill("123456");
  await app.getByRole("button", { name: "Sign In", exact: true }).click();
  await app.waitForURL(/\/files\//);
});

// 4.0 lockout protection: "require two-factor for admins".
test("an admin without two-factor is asked to set it up", async ({
  app,
  fake,
}) => {
  test.slow();
  fake.requireAdminTwoFactor = true;
  const signIn = async () => {
    await app.evaluate(() => localStorage.setItem("jwt", ""));
    await app.goto("/login");
    await app.getByLabel("Username", { exact: true }).fill("admin");
    await app
      .getByLabel("Password", { exact: true })
      .fill("correct-horse-battery");
    await app.getByRole("button", { name: "Sign In", exact: true }).click();
  };

  await signIn();
  const setup = app.getByTestId("two-factor-setup");
  await expect(setup).toBeVisible();
  await expect(app).toHaveURL(/\/setup-2fa/);

  // Skipping keeps files usable, but admin pages send them back.
  await setup.getByRole("button", { name: "Not now, go to my files" }).click();
  await app.waitForURL(/\/files\//);
  await app.goto("/settings/global");
  await expect(setup).toBeVisible();

  // Setting it up clears the requirement and continues.
  const box = setup.getByTestId("two-factor");
  await box.getByRole("button", { name: "Set up" }).click();
  await box.getByLabel("Authentication code").fill("123456");
  await box.getByRole("button", { name: "Turn on" }).click();
  await box.getByRole("button", { name: "I've saved them" }).click();
  await app.waitForURL(/\/settings\/global/);
  await expect(setup).toHaveCount(0);
});
