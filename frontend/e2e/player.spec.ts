import { test, expect, row, contextAction } from "./support/test";

// 4.0 Phase 3.5: album header, play queue and mini-player.
test.beforeEach(({ fake }) => {
  fake.changeOnDisk("/Music/02 - Second.mp3", "b");
  fake.changeOnDisk("/Music/10 - Tenth.mp3", "c");
  fake.changeOnDisk("/Music/01 - First.mp3", "a");
});

test("a music folder shows the album header and plays in order", async ({
  app,
}) => {
  await row(app, "Music").dblclick();
  const header = app.getByTestId("album-header");
  await expect(header).toContainText("3 tracks");
  await header.getByRole("button", { name: "Play", exact: true }).click();

  const player = app.getByTestId("mini-player");
  await expect(player).toContainText("01 - First");
  await player.getByRole("button", { name: "Next track" }).click();
  await expect(player).toContainText("02 - Second");

  await player.getByRole("button", { name: "Queue" }).click();
  await expect(player.getByRole("listitem")).toHaveText([
    /01 - First/,
    /02 - Second/,
    /10 - Tenth/,
  ]);
});

test("Play on a track plays the folder from there; the player survives navigation", async ({
  app,
}) => {
  await row(app, "Music").dblclick();
  await contextAction(app, "02 - Second.mp3", "Play");
  const player = app.getByTestId("mini-player");
  await expect(player).toContainText("02 - Second");
  await app.goBack();
  await expect(row(app, "Documents")).toBeVisible();
  await expect(player).toContainText("02 - Second");
  await player
    .getByRole("button", { name: "Stop and close the player" })
    .click();
  await expect(player).toHaveCount(0);
});

test("Play folder from the parent's context menu", async ({ app }) => {
  await contextAction(app, "Music", "Play folder");
  await expect(app.getByTestId("mini-player")).toContainText("01 - First");
});
