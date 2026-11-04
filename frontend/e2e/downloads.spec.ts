import type { Page } from "@playwright/test";
import { test, expect, row, contextAction } from "./support/test";

// 4.0: folders and several items download as a zip straight away; the
// format prompt only appears when an admin turns on "Ask for archive
// format". Single files never see it. window.open is recorded instead of
// opening a tab, so each test can read the download URL.

// A string, because the e2e tsconfig has no DOM types.
const recordOpens = (page: Page, ask: boolean) =>
  page.addInitScript(`(() => {
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return null; };
    // index.html assigns window.FileBrowser; add the setting as it lands.
    let fb = {};
    Object.defineProperty(window, "FileBrowser", {
      configurable: true,
      get: () => fb,
      set: (v) => { fb = { ...v, AskArchiveFormat: ${ask} }; },
    });
  })()`);

const opened = async (page: Page): Promise<string[]> =>
  (await page.evaluate("window.__opened")) as string[];

/** The URL of the n-th download, once it has been opened. */
async function nthDownload(page: Page, n: number): Promise<URL> {
  await expect.poll(async () => (await opened(page)).length).toBeGreaterThan(n);
  return new URL((await opened(page))[n], "http://localhost");
}

const prompt = (page: Page) =>
  page.getByRole("dialog").filter({ hasText: "tar.gz" });

async function selectTwo(page: Page) {
  await row(page, "photo.jpg").click();
  await row(page, "readme.md").click({ modifiers: ["ControlOrMeta"] });
  await expect(row(page, "readme.md")).toHaveAttribute("aria-selected", "true");
}

/** Every listing entry point for a multi-item or folder download. */
const ENTRY_POINTS: [string, (page: Page) => Promise<void>][] = [
  [
    "selection bar",
    async (page) => {
      await selectTwo(page);
      await page
        .locator("#multiple-selection")
        .getByRole("button", { name: "Download" })
        .click();
    },
  ],
  [
    "row menu on a folder",
    (page) => contextAction(page, "Documents", "Download"),
  ],
  [
    "⌘S",
    async (page) => {
      await selectTwo(page);
      await page.keyboard.press("ControlOrMeta+s");
    },
  ],
  [
    "palette",
    async (page) => {
      await selectTwo(page);
      await page.keyboard.press("ControlOrMeta+k");
      await page.keyboard.type("Download 2");
      await page
        .getByRole("dialog", { name: "Command palette" })
        .getByRole("option", { name: /Download 2 selected/ })
        .click();
    },
  ],
  [
    "details panel, several items",
    async (page) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await selectTwo(page);
      await page
        .getByTestId("details-panel")
        .getByRole("button", { name: "Download" })
        .click();
    },
  ],
  [
    "second pane",
    async (page) => {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Split view", exact: true })
        .click();
      const pane = page.getByRole("grid", { name: "Files in the second pane" });
      await pane.locator('[data-index][aria-label="photo.jpg"]').click();
      await pane
        .locator('[data-index][aria-label="readme.md"]')
        .click({ modifiers: ["ControlOrMeta"] });
      await page
        .getByRole("button", { name: "Download", exact: true })
        .last()
        .click();
    },
  ],
];

test.describe("archive format setting off (default)", () => {
  for (const [name, start] of ENTRY_POINTS) {
    test(`${name}: zips without asking`, async ({ app }) => {
      await recordOpens(app, false);
      await app.reload();
      await expect(row(app, "readme.md")).toBeVisible();
      await start(app);
      const url = await nthDownload(app, 0);
      expect(url.pathname).toMatch(/^\/api\/raw\//);
      expect(url.searchParams.get("algo")).toBe("zip");
      await expect(prompt(app)).toHaveCount(0);
    });
  }

  test("the whole folder, after the confirm, zips without asking", async ({
    app,
  }) => {
    await recordOpens(app, false);
    await app.reload();
    await expect(row(app, "readme.md")).toBeVisible();
    app.once("dialog", (d) => void d.accept());
    await app.keyboard.press("ControlOrMeta+s");
    const url = await nthDownload(app, 0);
    expect(url.searchParams.get("algo")).toBe("zip");
    await expect(prompt(app)).toHaveCount(0);
  });

  test("a single file downloads as it is", async ({ app }) => {
    await recordOpens(app, false);
    await app.reload();
    await row(app, "readme.md").click();
    await app.keyboard.press("ControlOrMeta+s");
    const url = await nthDownload(app, 0);
    expect(url.pathname).toBe("/api/raw/readme.md");
    expect(url.searchParams.has("algo")).toBe(false);
  });
});

test.describe("archive format setting on", () => {
  for (const [name, start] of ENTRY_POINTS) {
    test(`${name}: asks, then downloads in the chosen format`, async ({
      app,
    }) => {
      await recordOpens(app, true);
      await app.reload();
      await expect(row(app, "readme.md")).toBeVisible();
      await start(app);
      await expect(prompt(app)).toBeVisible();
      expect(await opened(app)).toEqual([]);
      await prompt(app).getByRole("button", { name: "tar.gz" }).click();
      const url = await nthDownload(app, 0);
      expect(url.searchParams.get("algo")).toBe("targz");
      await expect(prompt(app)).toHaveCount(0);
    });
  }

  test("a single file still downloads without asking", async ({ app }) => {
    await recordOpens(app, true);
    await app.reload();
    await row(app, "readme.md").click();
    await app.keyboard.press("ControlOrMeta+s");
    const url = await nthDownload(app, 0);
    expect(url.pathname).toBe("/api/raw/readme.md");
    await expect(prompt(app)).toHaveCount(0);
  });
});

test.describe("share page", () => {
  for (const ask of [false, true]) {
    test(`a shared folder, setting ${ask ? "on" : "off"}`, async ({
      app,
      fake,
    }) => {
      fake.shares.push({
        hash: "dlz",
        path: "/Documents/",
        expire: 0,
        userID: 1,
        views: 0,
        downloads: 0,
      });
      await recordOpens(app, ask);
      await app.goto("/share/dlz");
      await expect(app.getByText("notes.txt").first()).toBeVisible();
      await app.getByTestId("share-download-all").click();
      if (ask) {
        await expect(prompt(app)).toBeVisible();
        await prompt(app).getByRole("button", { name: "tar.gz" }).click();
      } else {
        await expect(prompt(app)).toHaveCount(0);
      }
      const url = await nthDownload(app, 0);
      expect(url.pathname).toMatch(/^\/api\/public\/dl\/dlz/);
      expect(url.searchParams.get("algo")).toBe(ask ? "targz" : "zip");
    });
  }
});

test("an admin turns the setting on in Settings → Global", async ({
  app,
  fake,
}) => {
  await app.goto("/settings/global");
  const toggle = app.getByRole("switch", {
    name: "Ask for archive format on download",
  });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await app
    .getByRole("button", { name: /Update|Save/ })
    .first()
    .click();
  await expect.poll(() => fake.settings.askArchiveFormat).toBe(true);
});
