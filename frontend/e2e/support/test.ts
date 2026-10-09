/**
 * Shared Playwright fixtures: every test gets a seeded FakeServer, a logged-in
 * page, and automatic checks that the app raised no uncaught errors and made
 * no API calls the fake doesn't know (a new endpoint should be added to the
 * fake deliberately, not silently 404).
 */
import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import { FakeServer, login } from "./fakeServer";

export const SEED: Record<string, string | null> = {
  "/Documents/notes.txt": "hello from notes",
  "/Documents/Reports/q3.pdf": "%PDF-1.4",
  "/Music": null,
  "/readme.md": "# vitrine\n\nSmoke test fixture.",
  "/photo.jpg": "not really a jpeg",
};

type Fixtures = { fake: FakeServer; app: Page };

export const test = base.extend<Fixtures>({
  fake: async ({}, use) => {
    await use(new FakeServer(SEED));
  },
  app: async ({ page, fake }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await fake.install(page);
    await login(page);
    await use(page);
    expect(pageErrors, "uncaught errors in the page").toEqual([]);
    expect(
      fake.unhandled,
      "API calls the fake server doesn't implement"
    ).toEqual([]);
  },
});

export { expect };

/**
 * A listing row by its exact file or folder name. vue-virtual-scroller parks
 * recycled row views off-screen (translateY(-9999px)) with their old content
 * still in the DOM, so those are excluded.
 */
export function row(page: Page, name: string): Locator {
  return page.locator(
    `[data-index][aria-label="${name}"]:not([style*="-9999px"] *)`
  );
}

/** Opens a row's context menu and clicks the named item. */
export async function contextAction(page: Page, name: string, action: string) {
  await row(page, name).click({ button: "right" });
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
