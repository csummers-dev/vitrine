import { test, expect, SEED } from "./support/test";
import { FakeServer, login } from "./support/fakeServer";

const ADMIN_PERM = {
  admin: true,
  execute: false,
  create: true,
  rename: true,
  modify: true,
  delete: true,
  share: true,
  download: true,
  copy: true,
  move: true,
  shell: false,
  upload: true,
};

// Phase 6, 5.7: after a database upgrade, admins are told once.

const NOTICE = {
  from: 3,
  to: 4,
  backup: "/database/vitrine.db.pre-4.0.bak",
  at: "2026-10-01T12:00:00Z",
};

test("admins see the upgrade notice until they dismiss it", async ({
  app,
  fake,
  page,
}) => {
  fake.upgradeNotice = { ...NOTICE };
  await page.reload();
  const banner = app.getByTestId("upgrade-banner");
  await expect(banner).toContainText("vitrine was upgraded to 4.0.");
  await expect(banner).toContainText(
    "A copy of the old database is at /database/vitrine.db.pre-4.0.bak."
  );
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
  expect(fake.upgradeNotice).toBeNull();

  // Gone for good.
  await page.reload();
  await expect(app.getByRole("navigation", { name: "Places" })).toBeVisible();
  await expect(app.getByTestId("upgrade-banner")).toHaveCount(0);
});

test("other users never see it", async ({ page }) => {
  const fake = new FakeServer(SEED);
  fake.upgradeNotice = { ...NOTICE };
  fake.user = { perm: { ...ADMIN_PERM, admin: false } };
  await fake.install(page);
  await login(page);
  await expect(page.getByRole("navigation", { name: "Places" })).toBeVisible();
  await expect(page.getByTestId("upgrade-banner")).toHaveCount(0);
  // The page doesn't even ask.
  expect(fake.calls.some((c) => c.path === "/upgrade-notice")).toBe(false);
});
