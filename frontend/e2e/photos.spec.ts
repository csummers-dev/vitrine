import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect, row, contextAction } from "./support/test";

// 4.0 Phase 3.6: slideshow and photo map.
const GPS_JPEG = readFileSync(
  fileURLToPath(new URL("./fixtures/gps.jpg", import.meta.url))
);

test.beforeEach(({ fake }) => {
  fake.changeOnDisk("/Photos/b.jpg", "b");
  fake.changeOnDisk("/Photos/c.jpg", "c");
  fake.putBinary("/Photos/a-eiffel.jpg", GPS_JPEG);
});

async function openPhotos(app: import("@playwright/test").Page) {
  await row(app, "Photos").dblclick();
  await expect(row(app, "b.jpg")).toBeVisible();
}

test("slideshow from a photo steps, wraps and closes with Esc", async ({
  app,
}) => {
  await openPhotos(app);
  await contextAction(app, "b.jpg", "Slideshow from here");
  const show = app.getByTestId("slideshow");
  await expect(show.getByTestId("slideshow-counter")).toHaveText("2 / 3");
  // Pause, so the 5-second timer can't move on while the test steps.
  await app.keyboard.press(" ");
  await expect(show.getByRole("button", { name: "Play" })).toBeVisible();
  await app.keyboard.press("ArrowRight");
  await expect(show.getByTestId("slideshow-counter")).toHaveText("3 / 3");
  await app.keyboard.press("ArrowRight");
  await expect(show.getByTestId("slideshow-counter")).toHaveText("1 / 3");
  // The caption names the photo (the image itself crossfades in).
  await expect(show.locator(".slideshow__caption")).toHaveText("a-eiffel.jpg");
  await app.keyboard.press("Escape");
  await expect(show).toHaveCount(0);
});

test("slideshow follows swipes on a touch screen @mobile", async ({
  app,
  browserName,
}) => {
  // The swipe is built from Touch/TouchEvent constructors, which only
  // Chromium offers to a page without a touch screen (Firefox lacks them,
  // WebKit refuses to construct them).
  test.skip(browserName !== "chromium", "synthetic touch events need Chromium");
  await openPhotos(app);
  await contextAction(app, "b.jpg", "Slideshow from here");
  const show = app.getByTestId("slideshow");
  const counter = show.getByTestId("slideshow-counter");
  await expect(counter).toHaveText("2 / 3");
  await show.getByRole("button", { name: "Pause" }).click();
  // A horizontal swipe as touch events (Playwright has no swipe gesture).
  // A string, because the e2e tsconfig has no DOM types.
  const swipe = (dx: number) =>
    app.evaluate(`(() => {
      const el = document.querySelector('[data-testid="slideshow"]');
      const at = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })];
      const fire = (type, x) => el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === "touchend" ? [] : at(x), changedTouches: at(x),
      }));
      fire("touchstart", 200);
      fire("touchmove", 200 + ${dx} / 2);
      fire("touchmove", 200 + ${dx});
      fire("touchend", 200 + ${dx});
    })()`);
  await swipe(-150);
  await expect(counter).toHaveText("3 / 3");
  await swipe(150);
  await expect(counter).toHaveText("2 / 3");
});

test("photo map places located photos", async ({ app }) => {
  await openPhotos(app);
  await app
    .locator("#listing")
    .click({ button: "right", position: { x: 400, y: 300 } });
  await app.getByRole("menuitem", { name: "Photo map" }).click();
  const map = app.getByTestId("photo-map");
  await expect(map.getByTestId("photo-map-status")).toHaveText(
    "1 of 3 photos on the map"
  );
  await expect(map.locator(".photo-map__pin")).toHaveCount(1);
  await expect(map.getByText("OpenStreetMap")).toBeVisible();
  await map.getByRole("button", { name: "Close map" }).click();
  await expect(map).toHaveCount(0);
});
