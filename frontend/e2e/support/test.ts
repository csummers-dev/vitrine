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

type Fixtures = {
  fake: FakeServer;
  app: Page;
  /** User preferences to start with (`test.use({ prefs: … })`). */
  prefs: Record<string, unknown>;
};

/**
 * Collects uncaught page errors, leaving out the ones a page navigation
 * causes by cutting off work in flight. Firefox and WebKit report a dynamic
 * import, a fetch or the event stream that a navigation (a `goto`, a reload)
 * aborts as an uncaught error, sometimes just before the navigation request
 * goes out; Chromium stays quiet. Only those messages, and only within two
 * seconds either side of a navigation, are dropped. Read the result with
 * `errors()` after the test.
 */
const ABORTED =
  /error loading dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|000 No connection|due to access control checks|NetworkError when attempting to fetch|Load failed|The operation was aborted/;

export function trackPageErrors(page: Page): () => string[] {
  const seen: { at: number; message: string }[] = [];
  const navigations: number[] = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame())
      navigations.push(Date.now());
  });
  page.on("pageerror", (e) =>
    seen.push({ at: Date.now(), message: e.message })
  );
  return () =>
    seen
      .filter(
        (e) =>
          !(
            ABORTED.test(e.message) &&
            navigations.some((n) => Math.abs(n - e.at) < 2000)
          )
      )
      .map((e) => e.message);
}

export const test = base.extend<Fixtures>({
  prefs: [{}, { option: true }],
  fake: async ({ prefs }, use) => {
    const fake = new FakeServer(SEED);
    fake.preferences = structuredClone(prefs);
    await use(fake);
  },
  app: async ({ page, fake }, use) => {
    const pageErrors = trackPageErrors(page);
    await fake.install(page);
    await login(page);
    await use(page);
    expect(pageErrors(), "uncaught errors in the page").toEqual([]);
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
