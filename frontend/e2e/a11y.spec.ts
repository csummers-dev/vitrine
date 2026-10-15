import { test, expect } from "./support/test";
import { expectAccessible } from "./support/a11y";
import { FakeServer } from "./support/fakeServer";

// Phase 6, Step 3: no serious or critical accessibility violations on the
// main shell pages, light and dark.

for (const scheme of ["light", "dark"] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test("files", async ({ app }) => {
      await expect(
        app.getByRole("navigation", { name: "Places" })
      ).toBeVisible();
      await expectAccessible(app);
    });

    test("files, icons view", async ({ app }) => {
      await app.getByRole("radio", { name: "Icons" }).click();
      await expect(app.getByRole("radio", { name: "Icons" })).toBeChecked();
      await expectAccessible(app);
    });

    test("share, folder and file", async ({ app, fake }) => {
      fake.shares.push(
        {
          hash: "a11yd",
          path: "/Documents/",
          expire: 0,
          userID: 1,
          views: 0,
          downloads: 0,
        },
        {
          hash: "a11yf",
          path: "/Documents/notes.txt",
          expire: 0,
          userID: 1,
          views: 0,
          downloads: 0,
        }
      );
      await app.goto("/share/a11yd");
      await expect(app.getByText("notes.txt").first()).toBeVisible();
      await expectAccessible(app);
      await app.goto("/share/a11yf");
      await expect(app.getByText("notes.txt").first()).toBeVisible();
      await expectAccessible(app);
    });

    test("recent", async ({ app }) => {
      await app.goto("/recent");
      await expect(app.getByRole("heading", { name: "Recent" })).toBeVisible();
      await expectAccessible(app);
    });

    test("login", async ({ page }) => {
      const fake = new FakeServer({});
      await fake.install(page);
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
      await expectAccessible(page);
    });
  });
}
