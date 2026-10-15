import { test, expect } from "./support/test";

// Phase 6, 4.3: a 10,000-item folder scrolls smoothly in Icons view — the
// tiles stay virtualised and no main-thread task runs over 200 ms.

test("10,000 items scroll smoothly in Icons view", async ({ app, fake }) => {
  test.setTimeout(90_000);
  const when = new Date("2026-09-01T10:00:00Z").toISOString();
  fake.fs.set("/Big", { isDir: true, modified: when });
  for (let i = 0; i < 10_000; i++)
    fake.fs.set(`/Big/file-${String(i).padStart(5, "0")}.txt`, {
      isDir: false,
      content: "x",
      modified: when,
    });

  await app.goto("/files/Big/");
  await app.getByRole("radio", { name: "Icons" }).click();
  await expect(app.locator("[data-index]").first()).toBeVisible();

  // Only a window of tiles is in the DOM.
  const tiles = await app.locator("[data-index]").count();
  expect(tiles).toBeLessThan(400);

  // Runs in the page (the e2e tsconfig has no DOM types, hence a string).
  const longTasks = (await app.evaluate(`(async () => {
    const seen = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) seen.push(e.duration);
    });
    obs.observe({ type: "longtask", buffered: false });
    const sc = document.querySelector("section.ptr-host");
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 60; i++) {
      sc.scrollTop += 900;
      await frame();
    }
    await new Promise((r) => setTimeout(r, 300));
    obs.disconnect();
    return { seen, top: sc.scrollTop };
  })()`)) as { seen: number[]; top: number };
  expect(longTasks.top).toBeGreaterThan(10_000);
  expect(Math.max(0, ...longTasks.seen)).toBeLessThan(200);

  // Tiles further down really rendered.
  await expect(app.locator("[data-index]").first()).toBeVisible();
  expect(await app.locator("[data-index]").count()).toBeLessThan(400);
});
