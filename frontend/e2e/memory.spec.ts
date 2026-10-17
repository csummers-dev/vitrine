import type { Page } from "@playwright/test";
import { test, expect, row } from "./support/test";

// Phase 6, 7.2: memory stays steady when the details panel and a viewer are
// opened and closed 50 times. The heap is read after a forced garbage
// collection (Chromium DevTools protocol), with DOM nodes and event
// listeners, since a leaked component usually shows up there first. Each
// side takes the lowest of three readings. The node count swings by several
// hundred from reading to reading as rows and the preview are recycled (100+
// cycles show no trend), so its allowance is wide; a leak of even 20 nodes a
// cycle still crosses it.

type Counters = { heap: number; nodes: number; listeners: number };

async function measure(page: Page): Promise<Counters> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = (await cdp.send("Runtime.getHeapUsage")) as {
    usedSize: number;
  };
  const dom = (await cdp.send("Memory.getDOMCounters")) as {
    nodes: number;
    jsEventListeners: number;
  };
  await cdp.detach();
  return { heap: usedSize, nodes: dom.nodes, listeners: dom.jsEventListeners };
}

const lowest = (all: Counters[]): Counters => ({
  heap: Math.min(...all.map((c) => c.heap)),
  nodes: Math.min(...all.map((c) => c.nodes)),
  listeners: Math.min(...all.map((c) => c.listeners)),
});

/** Warm up, then 50 cycles; readings around the first and last three. */
async function growth(page: Page, cycle: () => Promise<void>) {
  for (let i = 0; i < 5; i++) await cycle();
  const first: Counters[] = [];
  for (let i = 0; i < 3; i++) {
    await cycle();
    first.push(await measure(page));
  }
  for (let i = 0; i < 44; i++) await cycle();
  const last: Counters[] = [];
  for (let i = 0; i < 3; i++) {
    await cycle();
    last.push(await measure(page));
  }
  const a = lowest(first);
  const b = lowest(last);
  return {
    heap: b.heap - a.heap,
    nodes: b.nodes - a.nodes,
    listeners: b.listeners - a.listeners,
  };
}

const MB = 1024 * 1024;

test.use({ viewport: { width: 1440, height: 900 } });

test("opening and closing the details panel 50 times leaks nothing", async ({
  app,
}) => {
  test.setTimeout(150_000);
  await row(app, "readme.md").click();
  const panel = app.getByTestId("details-panel");
  await expect(panel).toBeVisible();
  const d = await growth(app, async () => {
    await app.keyboard.press("ControlOrMeta+i");
    await expect(panel).toBeHidden();
    await app.keyboard.press("ControlOrMeta+i");
    await expect(panel).toBeVisible();
  });
  expect(d.heap).toBeLessThan(2 * MB);
  expect(d.nodes).toBeLessThan(1000);
  expect(d.listeners).toBeLessThan(25);
});

test("opening and closing a viewer 50 times leaks nothing", async ({ app }) => {
  test.setTimeout(180_000);
  const d = await growth(app, async () => {
    await row(app, "readme.md").dblclick();
    await expect(
      app.getByRole("heading", { name: "readme.md", level: 1 })
    ).toBeVisible();
    await app.keyboard.press("Escape");
    await expect(row(app, "readme.md")).toBeVisible();
  });
  expect(d.heap).toBeLessThan(2 * MB);
  expect(d.nodes).toBeLessThan(1000);
  expect(d.listeners).toBeLessThan(25);
});
