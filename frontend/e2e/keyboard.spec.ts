import type { Page } from "@playwright/test";
import { test, expect, row } from "./support/test";
import { FakeServer } from "./support/fakeServer";

// Phase 6, 7.1: the main tasks from start to finish with the keyboard
// alone. No click, hover or tap anywhere in this file: every step is a key
// press (the file chooser is answered the way a person would, by picking a
// file in it).

const press = (page: Page, ...keys: string[]) =>
  keys.reduce(
    (p, k) => p.then(() => page.keyboard.press(k)),
    Promise.resolve()
  );

/** Tab forwards until the focused element matches, like a person would. */
async function tabTo(page: Page, name: RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(
      `(() => { const e = document.activeElement; return e ? (e.getAttribute("aria-label") || e.textContent || "").trim() : ""; })()`
    );
    if (name.test(String(label))) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

/** ⌘K, type, Enter. */
async function palette(page: Page, text: string): Promise<void> {
  await press(page, "ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type(text);
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await press(page, "Enter");
}

test("browse, rename, move, share, upload, search, settings and sign out", async ({
  page,
}) => {
  const fake = new FakeServer({
    "/Documents/notes.txt": "hello from notes",
    "/Music": null,
    "/readme.md": "# vitrine",
  });
  await fake.install(page);

  // Sign in.
  await page.goto("/login");
  const username = page.getByLabel("Username", { exact: true });
  await expect(username).toBeVisible();
  // The field may already have focus; if not, Tab to it.
  if (!(await username.evaluate((el) => el.matches(":focus"))))
    await press(page, "Tab");
  await expect(username).toBeFocused();
  await page.keyboard.type("admin");
  await press(page, "Tab");
  await page.keyboard.type("correct-horse-battery");
  await press(page, "Enter");
  await expect(page).toHaveURL(/\/files\/$/);

  // Skip the sidebar, then browse into a folder and back up.
  await press(page, "Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused();
  await press(page, "Enter");
  await press(page, "ArrowDown");
  await expect(row(page, "Documents")).toBeFocused();
  await press(page, "Enter");
  await expect(page).toHaveURL(/\/files\/Documents\/$/);
  await expect(row(page, "notes.txt")).toBeVisible();
  await press(page, "Alt+ArrowUp");
  await expect(page).toHaveURL(/\/files\/$/);
  // Back up, focus is on the folder just left.
  await expect(row(page, "Documents")).toBeFocused();

  // Select by typing its name, rename with F2.
  await page.keyboard.type("readme");
  await expect(row(page, "readme.md")).toBeFocused();
  await expect(row(page, "readme.md")).toHaveAttribute("aria-selected", "true");
  await press(page, "F2");
  const rename = row(page, "readme.md").getByRole("textbox");
  await expect(rename).toBeFocused();
  await press(page, "ControlOrMeta+a");
  await page.keyboard.type("intro.md");
  await press(page, "Enter");
  await expect(row(page, "intro.md")).toBeVisible();
  expect(fake.fs.has("/intro.md")).toBe(true);

  // Move it into Documents from its menu (Shift+F10).
  await expect(row(page, "intro.md")).toBeFocused();
  await press(page, "Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.type("Move");
  await press(page, "Enter");
  const panel = page.getByRole("dialog", { name: /Move/ });
  await expect(panel).toBeVisible();
  await tabTo(page, /^Documents$/);
  await press(page, "Enter");
  await expect(
    panel.getByRole("button", { name: "Documents", exact: true })
  ).toBeFocused();
  await tabTo(page, /^Move here/);
  await press(page, "Enter");
  await expect(panel).toHaveCount(0);
  await expect(() =>
    expect(fake.fs.has("/Documents/intro.md")).toBe(true)
  ).toPass();

  // The listing follows the move into Documents. Share a file there from
  // its menu: Share, then Create link.
  await expect(page).toHaveURL(/\/files\/Documents\/$/);
  await expect(row(page, "intro.md")).toBeVisible();
  await page.keyboard.type("notes");
  await expect(row(page, "notes.txt")).toBeFocused();
  await press(page, "Shift+F10");
  await page.keyboard.type("Share");
  await press(page, "Enter");
  const share = page.getByRole("dialog", { name: /Share/ });
  await expect(share).toBeVisible();
  await tabTo(page, /^Create link$/);
  await press(page, "Enter");
  await expect(() => expect(fake.shares.length).toBe(1)).toPass();
  await press(page, "Escape");
  await expect(share).toHaveCount(0);

  // Upload from the toolbar.
  const chooser = page.waitForEvent("filechooser");
  await tabTo(page, /^Upload$/);
  await press(page, "Enter");
  // The upload prompt opens on "File".
  await expect(page.getByRole("dialog", { name: "Upload" })).toBeVisible();
  await press(page, "Enter");
  await (
    await chooser
  ).setFiles({
    name: "typed.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("from the keyboard"),
  });
  await expect(row(page, "typed.txt")).toBeVisible();

  // Search from the palette and open the hit.
  await palette(page, "notes");
  await expect(page).toHaveURL(/\/files\/Documents\/notes\.txt$/);

  // Settings, then sign out, both from the palette.
  await palette(page, "Account settings");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await palette(page, "Log out");
  await expect(page).toHaveURL(/\/login/);
});
