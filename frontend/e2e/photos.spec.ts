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
