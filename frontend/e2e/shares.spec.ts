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

// 4.0 Phase 4.1: upload-only (drop-box) links.
test("a visitor uploads to a drop-box without seeing its contents", async ({
  app,
  fake,
}) => {
  await contextAction(app, "Documents", "Share");
  await app.getByLabel("Upload only (file request)").check();
  await app
    .getByLabel("Put each person's files in a folder named after them")
    .check();
  await app.getByRole("button", { name: "Create link" }).click();
  await expect(app.getByText("Upload only", { exact: true })).toBeVisible();
  expect(fake.shares[0]).toMatchObject({
    mode: "upload",
    perUploaderFolder: true,
  });

  await app.goto(`/share/${fake.shares[0].hash}`);
  const box = app.getByTestId("dropbox");
  await expect(box).toContainText("Send files to “Documents”");
  await expect(app.getByText("notes.txt")).toHaveCount(0);
  await box.getByLabel(/Your name/).fill("Alice");
  await box.getByTestId("dropbox-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("from alice"),
  });
  await expect(box.getByTestId("dropbox-state")).toHaveText("Sent");
  expect(fake.shares[0].uploads).toBe(1);
  expect(fake.fs.has("/Documents/Alice/notes.txt")).toBe(true);
});
