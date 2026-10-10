import { test, expect, row, contextAction } from "./support/test";

// 4.0 Phase 4.2: download limits and usage counts.
test("a one-time link works once, then is gone", async ({ app, fake }) => {
  await row(app, "Documents").dblclick();
  await contextAction(app, "notes.txt", "Share");
  await app.getByLabel("Download limit").selectOption("1");
  await app.getByRole("button", { name: "Create link" }).click();
  await expect(app.getByText("One-time", { exact: true })).toBeVisible();
  await expect(app.getByTestId("share-usage")).toHaveText(
    "0 views · 0 of 1 download"
  );
  expect(fake.shares[0]).toMatchObject({ maxDownloads: 1 });

  // The visitor's page: a notice, and no inline preview.
  await app.goto(`/share/${fake.shares[0].hash}`);
  await expect(app.getByTestId("share-downloads-left")).toContainText(
    "downloaded once more"
  );
  expect(fake.shares[0].views).toBe(1);

  // One download uses it up.
  await app.evaluate(async (hash) => {
    await fetch(`/api/public/dl/${hash}`);
  }, fake.shares[0].hash);
  expect(fake.shares[0].downloads).toBe(1);

  await app.reload();
  await expect(app.getByTestId("share-gone")).toContainText(
    "no longer available"
  );
});
