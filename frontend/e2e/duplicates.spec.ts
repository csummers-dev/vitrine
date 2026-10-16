import { test, expect } from "./support/test";

// 4.0 Phase 5.2: the duplicate finder.

test.beforeEach(({ fake }) => {
  const song = "s".repeat(4000);
  fake.changeOnDisk("/Music/a.flac", song);
  fake.changeOnDisk("/Backup/a.flac", song);
  fake.changeOnDisk("/Backup/old/a copy.flac", song);
  const doc = "d".repeat(1500);
  fake.changeOnDisk("/Docs/x.pdf", doc);
  fake.changeOnDisk("/Docs/y.pdf", doc);
});

test("scans, keeps a copy per group, and trashes the rest", async ({
  app,
  fake,
}) => {
  await app.goto("/duplicates");
  await app.getByLabel("Smallest file").selectOption("Any size");
  await app.getByRole("button", { name: "Find duplicates" }).click();

  const summary = app.getByTestId("dupes-summary");
  await expect(summary).toContainText("2 groups in My files");
  await expect(summary).toContainText("9.28 KiB can be freed");

  const groups = app.getByTestId("dupes-groups").locator(":scope > li");
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toContainText("× 3 copies");

  // Keep copies inside /Music: the other two songs get selected, and the
  // docs group (no copy in /Music) is left alone.
  await app.getByLabel("Folder to keep copies in").fill("/Music");
  await app.getByRole("button", { name: "Apply" }).click();
  await expect(app.getByLabel("Delete /Backup/a.flac")).toBeChecked();
  await expect(app.getByLabel("Delete /Backup/old/a copy.flac")).toBeChecked();
  await expect(app.getByLabel("Delete /Music/a.flac")).not.toBeChecked();
  // The last copy in a group can't be selected.
  await expect(app.getByLabel("Delete /Music/a.flac")).toBeDisabled();

  // Pick one doc by hand; its twin is then locked.
  await app.getByLabel("Delete /Docs/y.pdf").check();
  await expect(app.getByLabel("Delete /Docs/x.pdf")).toBeDisabled();

  await app.getByTestId("dupes-trash").click();
  await app.getByRole("button", { name: "Move to trash" }).last().click();

  await expect(summary).toContainText("No duplicates in My files");
  expect(fake.exists("/Backup/a.flac")).toBe(false);
  expect(fake.exists("/Backup/old/a copy.flac")).toBe(false);
  expect(fake.exists("/Docs/y.pdf")).toBe(false);
  expect(fake.exists("/Music/a.flac")).toBe(true);
  expect(fake.exists("/Docs/x.pdf")).toBe(true);
});

test("the palette opens it on the current folder", async ({ app }) => {
  await app.goto("/files/Backup/");
  await app.keyboard.press("ControlOrMeta+k");
  await app.keyboard.type("find duplicates");
  await app
    .getByRole("dialog", { name: "Command palette" })
    .getByRole("option", { name: /Find duplicates/ })
    .click();
  await expect(app).toHaveURL(/\/duplicates\?path=\/Backup$/);
  await expect(app.getByLabel("Folder", { exact: true })).toHaveValue(
    "/Backup"
  );
});

// Phase 6, 5.2: after a scan the settings fold into one line.
test("folds the settings after a scan and reopens them with Edit", async ({
  app,
}) => {
  await app.goto("/duplicates");
  await app.getByLabel("Folder", { exact: true }).fill("/Docs");
  await app.getByLabel("Smallest file").selectOption("Any size");
  await app.getByRole("button", { name: "Find duplicates" }).click();

  const folded = app.getByTestId("dupes-settings-summary");
  await expect(folded).toContainText(
    "Scanned Docs · files of any size · hidden files skipped"
  );
  await expect(app.getByLabel("Folder", { exact: true })).toHaveCount(0);
  // The keep helpers are chips that show which rule is applied.
  const newest = app.getByRole("button", { name: "the newest" });
  await newest.click();
  await expect(newest).toHaveAttribute("aria-pressed", "true");

  await folded.getByRole("button", { name: "Edit" }).click();
  await expect(app.getByLabel("Folder", { exact: true })).toHaveValue("/Docs");
  await app.getByLabel("Folder", { exact: true }).fill("/Music");
  await app.getByRole("button", { name: "Scan again" }).click();
  await expect(app.getByTestId("dupes-none")).toContainText("No duplicates");
  await expect(folded).toContainText("Scanned Music");
});
