import { test, expect, row } from "./support/test";

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

// 7.2: a 1,000-item folder renders in under 300 ms, from the data arriving
// to the rows painted (the app's own "vitrine:listing-render" measure), in
// every view; and 10,000 items stay virtualised in all three.
const fill = (
  fake: import("./support/fakeServer").FakeServer,
  dir: string,
  n: number
) => {
  const when = new Date("2026-09-01T10:00:00Z").toISOString();
  fake.fs.set(dir, { isDir: true, modified: when });
  for (let i = 0; i < n; i++)
    fake.fs.set(`${dir}/file-${String(i).padStart(5, "0")}.txt`, {
      isDir: false,
      content: "x",
      modified: when,
    });
};

const renderTime = async (app: import("@playwright/test").Page) =>
  (await app.evaluate(`new Promise((resolve) => {
    const read = () => {
      const m = performance.getEntriesByName("vitrine:listing-render");
      if (m.length) return resolve(m[m.length - 1].duration);
      setTimeout(read, 20);
    };
    read();
  })`)) as number;

for (const view of ["List", "Icons", "Gallery"] as const) {
  test(`1,000 items render in under 300 ms (${view})`, async ({
    app,
    fake,
    browserName,
  }) => {
    fill(fake, "/Thousand", 1000);
    await app.reload();
    if (view !== "List") {
      await app.getByRole("radio", { name: view }).click();
      await expect(app.getByRole("radio", { name: view })).toBeChecked();
    }
    // Opened from the listing, as a person would.
    await app.evaluate(`performance.clearMeasures()`);
    await row(app, "Thousand").dblclick();
    await expect(app).toHaveURL(/\/files\/Thousand\/$/);
    await expect(app.locator("[data-index]").first()).toBeVisible();
    const ms = await renderTime(app);
    test
      .info()
      .annotations.push({ type: "render ms", description: ms.toFixed(0) });
    // The budget is set on Chromium in CI; other engines report their time
    // (in the test's annotations) without a pass mark.
    if (browserName === "chromium") expect(ms).toBeLessThan(300);
    expect(await app.locator("[data-index]").count()).toBeLessThan(400);
  });
}

for (const view of ["List", "Gallery"] as const) {
  test(`10,000 items stay virtualised (${view})`, async ({ app, fake }) => {
    test.setTimeout(90_000);
    fill(fake, "/Big", 10_000);
    await app.goto("/files/Big/");
    if (view !== "List") await app.getByRole("radio", { name: view }).click();
    await expect(app.locator("[data-index]").first()).toBeVisible();
    expect(await app.locator("[data-index]").count()).toBeLessThan(400);
    await app.evaluate(`(() => {
      const sc = document.querySelector("section.ptr-host");
      sc.scrollTop = sc.scrollHeight / 2;
    })()`);
    await app.waitForTimeout(300);
    expect(await app.locator("[data-index]").count()).toBeLessThan(400);
  });
}
