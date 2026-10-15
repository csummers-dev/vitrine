/**
 * Fixtures for the screenshot suite (Phase 6). Everything that changes
 * between runs is pinned: the page clock, file dates, theme, viewport,
 * motion and fonts. Run only in the Playwright Docker image (see
 * scripts/visual-docker.sh); pixels from other machines won't match.
 */
import type { Page } from "@playwright/test";
import { test as base, expect } from "../support/test";
import { FakeServer } from "../support/fakeServer";

/** "Now" for every visual test: a week after the newest file. */
export const NOW = "2026-10-08T10:00:00Z";

export const VISUAL_SEED: Record<string, string | null> = {
  "/Documents/notes.txt": "hello from notes\n".repeat(40),
  "/Documents/Reports/q3.pdf": "%PDF-1.4" + "x".repeat(180_000),
  "/Documents/Reports/q2.pdf": "%PDF-1.4" + "x".repeat(150_000),
  "/Documents/budget.csv": "a,b,c\n1,2,3\n".repeat(200),
  "/Music/Evening/track 01.mp3": "x".repeat(4_200_000),
  "/Music/Evening/track 02.mp3": "x".repeat(3_900_000),
  "/Photos/2026/harbour.jpg": "x".repeat(2_400_000),
  "/Photos/2026/meadow.jpg": "x".repeat(1_800_000),
  "/Videos/holiday.mp4": "x".repeat(9_000_000),
  "/Projects": null,
  "/readme.md": "# vitrine\n\nScreenshot fixture.",
  "/photo.jpg": "x".repeat(640_000),
  "/archive.zip": "x".repeat(5_500_000),
};

/** Varied, fixed modified dates so "Modified" columns are stable. */
const DATES: Record<string, string> = {
  "/Documents": "2026-10-07T16:20:00Z",
  "/Music": "2026-09-12T09:00:00Z",
  "/Photos": "2026-10-01T08:30:00Z",
  "/Videos": "2026-08-30T19:45:00Z",
  "/Projects": "2026-06-02T11:00:00Z",
  "/readme.md": "2026-10-08T09:15:00Z",
  "/photo.jpg": "2026-07-21T14:05:00Z",
  "/archive.zip": "2025-12-24T18:00:00Z",
};

export const SIZES = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  tablet: { width: 1024, height: 768 },
  phone: { width: 390, height: 844 },
} as const;
export type SizeName = keyof typeof SIZES;
export const THEMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];

export const test = base.extend({
  fake: async ({ prefs }, use) => {
    const fake = new FakeServer(VISUAL_SEED);
    fake.clock = Date.parse(NOW);
    fake.preferences = structuredClone(prefs);
    for (const [p, iso] of Object.entries(DATES)) fake.setModified(p, iso);
    await use(fake);
  },
  page: async ({ page, fake }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    // Start the page clock at NOW and let it run: relative times are stable
    // ("1h ago"), and code that measures elapsed time still works (a frozen
    // Date.now() stops the row context menu from opening).
    await page.clock.install({ time: new Date(NOW) });
    await page.clock.resume();
    await use(page);
    expect(pageErrors, "uncaught errors in the page").toEqual([]);
    expect(
      fake.unhandled,
      "API calls the fake server doesn't implement"
    ).toEqual([]);
  },
});

export { expect };

/** Waits for fonts, images and pending animation frames, then compares. */
export async function snap(page: Page, name: string): Promise<void> {
  // A string, because the e2e tsconfig has no DOM types.
  await page.evaluate(`(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => !i.complete)
      .map((i) => new Promise((r) => i.addEventListener("load", r, { once: true }))));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`);
  // A baseline must never capture an error toast.
  await expect(page.locator(".Vue-Toastification__toast--error")).toHaveCount(
    0
  );
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
}

/** `<screen>-<theme>-<size>` */
export const shotName = (screen: string, theme: ThemeName, size: SizeName) =>
  `${screen}-${theme}-${size}`;
