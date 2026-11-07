import { test, expect, row } from "./support/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("opens a text file in the previewer", async ({ app }) => {
  await row(app, "Documents").dblclick();
  await row(app, "notes.txt").dblclick();
  await expect(app).toHaveURL(/\/files\/Documents\/notes\.txt$/);
  await expect(app.getByText("hello from notes")).toBeVisible();
});

// The picture of a HEIC is the server's JPEG conversion, which carries no
// EXIF; the camera details come from the original file instead.
test("shows a HEIC photo's camera details", async ({ app, fake }) => {
  fake.putBinary(
    "/Photos/iphone.heic",
    readFileSync(
      fileURLToPath(new URL("./fixtures/iphone.heic", import.meta.url))
    )
  );
  await app.goto("/files/Photos/iphone.heic");
  await expect(app.getByText("Apple iPhone 15 Pro")).toBeVisible();
});
