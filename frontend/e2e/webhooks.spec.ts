import { test, expect } from "./support/test";

// 4.0 Phase 4.3: Jellyfin preset and signing secrets.
test("adds a Jellyfin endpoint and signs a webhook", async ({ app, fake }) => {
  await app.goto("/settings/webhooks");

  await app.getByRole("button", { name: "Add endpoint" }).click();
  await app.getByLabel("Jellyfin library refresh").check();
  await app.getByLabel("Jellyfin server URL").fill("http://192.168.1.20:8096");
  await app.getByLabel("API key").fill("jf-key");
  await app.getByLabel("Folders").fill("/Movies\n/TV");
  await app.getByRole("button", { name: "Create endpoint" }).click();
  await expect(app.getByText("Jellyfin", { exact: true })).toBeVisible();
  expect(fake.webhooks[0]).toMatchObject({
    kind: "jellyfin",
    apiKey: "jf-key",
    allowLocal: true,
    paths: ["/Movies", "/TV"],
  });

  // Toggling it off keeps the preset's settings.
  await app.getByRole("switch").first().click();
  await expect.poll(() => fake.webhooks[0].enabled).toBe(false);
  expect(fake.webhooks[0]).toMatchObject({
    kind: "jellyfin",
    paths: ["/Movies", "/TV"],
  });

  // A plain webhook gets a secret, shown once.
  await app.getByRole("button", { name: "Add endpoint" }).click();
  await app.getByLabel("Payload URL").fill("https://hooks.example/x");
  await app.getByRole("button", { name: "Create endpoint" }).click();
  await app.getByRole("button", { name: "Edit" }).nth(1).click();
  await app.getByRole("button", { name: "Generate" }).click();
  await expect(app.getByTestId("webhook-secret")).toHaveValue(/^whsec_/);
  expect(fake.webhooks[1].secret).toMatch(/^whsec_/);
});
