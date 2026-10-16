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

// 7.1: in forced colours (Windows high contrast) the shadows that draw
// focus and selection are dropped; a focused row must still show an
// outline, and a selected one the system Highlight.
test.describe("forced colours", () => {
  test.use({ forcedColors: "active" });

  test("focus and selection stay visible", async ({ app }) => {
    const r = app.locator('[data-index][aria-label="readme.md"]');
    await app.locator("#main").focus();
    await app.keyboard.type("readme");
    await expect(r).toBeFocused();
    await expect(r).toHaveAttribute("aria-selected", "true");
    const style = (await app.evaluate(
      `(() => { const s = getComputedStyle(document.activeElement);
        return { outline: s.outlineStyle, bg: s.backgroundColor }; })()`
    )) as { outline: string; bg: string };
    expect(style.outline).not.toBe("none");
    expect(style.bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

// 7.1: 200% zoom on a 1280×720 laptop is a 640×360 CSS viewport. Nothing may
// need sideways scrolling to read (WCAG 1.4.10 reflow).
test.describe("zoomed to 200%", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  for (const path of [
    "/files/",
    "/files/Documents/notes.txt",
    "/settings/profile",
    "/storage",
  ]) {
    test(`no sideways scroll on ${path}`, async ({ app }) => {
      await app.goto(path);
      await expect(app.locator("#main")).toBeVisible();
      await app.waitForTimeout(300);
      const overflow = (await app.evaluate(
        `(() => { const d = document.documentElement; const m = document.getElementById("main");
          return Math.max(d.scrollWidth - d.clientWidth, m ? m.scrollWidth - m.clientWidth : 0); })()`
      )) as number;
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
