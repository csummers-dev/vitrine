import { test, expect, row } from "./support/test";

test("opens a text file in the previewer", async ({ app }) => {
  await row(app, "Documents").dblclick();
  await row(app, "notes.txt").dblclick();
  await expect(app).toHaveURL(/\/files\/Documents\/notes\.txt$/);
  await expect(app.getByText("hello from notes")).toBeVisible();
});
