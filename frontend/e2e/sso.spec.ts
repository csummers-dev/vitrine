import { test, expect, row } from "./support/test";
import { makeToken } from "./support/fakeServer";

// 4.0 Phase 4.5: the SSO callback lands on /login with the token (or an
// error) in the fragment.
test("signs in from an SSO callback and goes to the requested folder", async ({
  app,
}) => {
  await app.evaluate(() => localStorage.setItem("jwt", ""));
  await app.goto(
    `/login#sso=${encodeURIComponent(makeToken())}&redirect=${encodeURIComponent("/files/Documents/")}`
  );
  await app.waitForURL(/\/files\/Documents\/$/);
  await expect(row(app, "notes.txt")).toBeVisible();
  // The token isn't left in the address bar.
  expect(new URL(app.url()).hash).toBe("");
});

test("explains an SSO failure", async ({ app }) => {
  await app.evaluate(() => localStorage.setItem("jwt", ""));
  await app.goto("/login#sso_error=no_account");
  await expect(app.getByRole("alert")).toContainText(
    "no account for you here yet"
  );
});
