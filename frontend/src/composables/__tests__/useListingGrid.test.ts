import { describe, it, expect } from "vitest";
import {
  useListingGrid,
  type ListingGridOptions,
} from "@/composables/useListingGrid";

// jsdom returns 0 for clientWidth / offsetHeight / getBoundingClientRect, so we
// hand the composable plain mock elements exposing only the props it reads.
type ElProps = {
  clientWidth?: number;
  clientHeight?: number;
  scrollTop?: number;
  rectTop?: number;
};

function fakeEl(p: ElProps = {}): HTMLElement {
  const width = p.clientWidth ?? 0;
  return {
    clientWidth: width,
    clientHeight: p.clientHeight ?? 0,
    scrollTop: p.scrollTop ?? 0,
    getBoundingClientRect: () => ({
      top: p.rectTop ?? 0,
      left: 0,
      width,
      height: 0,
      right: width,
      bottom: 0,
    }),
    // No real tile rendered → tile height falls back to the 4:3 / GRID metric.
    querySelector: () => null,
  } as unknown as HTMLElement;
}

function makeOpts(over: Partial<ListingGridOptions> = {}): ListingGridOptions {
  return {
    enabled: () => true,
    gallery: () => false,
    scrollEl: () => null,
    dirsSectionEl: () => null,
    filesSectionEl: () => null,
    dirsCount: () => 0,
    filesCount: () => 0,
    ...over,
  };
}

describe("useListingGrid — measure() geometry", () => {
  it("gallery: folder tiles share the SAME columns + tile height as files (uniform gallery fix)", () => {
    const sec = fakeEl({ clientWidth: 692 });
    const g = useListingGrid(
      makeOpts({
        gallery: () => true,
        dirsSectionEl: () => sec,
        filesSectionEl: () => sec,
      })
    );
    g.measure();
    // 692 → floor((692+12)/(220+12)) = 3 cols; colW 222.67 → 4:3 → 167px tall.
    expect(g.filesCols.value).toBe(3);
    expect(g.filesTileH.value).toBe(167);
    // Regression guard: dirs must NOT fall back to the old narrow 150px track.
    expect(g.dirsCols.value).toBe(g.filesCols.value);
    expect(g.dirsTileH.value).toBe(g.filesTileH.value);
  });

  it("grid: both sections share identical columns (MIN_GRID) + fallback tile height", () => {
    const sec = fakeEl({ clientWidth: 692 });
    const g = useListingGrid(makeOpts({ dirsSectionEl: () => sec }));
    g.measure();
    expect(g.dirsCols.value).toBe(4); // floor((692+12)/(160+12))
    expect(g.filesCols.value).toBe(4);
    expect(g.dirsTileH.value).toBe(116); // GRID_TILE_H fallback
    expect(g.filesTileH.value).toBe(116);
  });

  it("falls back to the scroll-container width (minus #listing padding) when no section is mounted", () => {
    const sc = fakeEl({ clientWidth: 756, clientHeight: 600 });
    const g = useListingGrid(
      makeOpts({ gallery: () => true, scrollEl: () => sc })
    );
    g.measure();
    expect(g.filesCols.value).toBe(3); // (756-32)=724 → floor((724+12)/232)
  });

  it("is a no-op when nothing is mounted (width resolves to 0)", () => {
    const g = useListingGrid(makeOpts());
    g.measure();
    expect(g.dirsCols.value).toBe(1); // untouched defaults
    expect(g.dirsTileH.value).toBe(116);
  });
});

describe("useListingGrid — update() windowing", () => {
  const setup = (scrollTop: number, dirsCount = 100) => {
    // A section anchored at content-top 0 has its viewport rect.top shift UP by
    // scrollTop as the container scrolls; sectionTop() adds scrollTop back, so
    // the section's content origin stays 0 (which is what the math expects).
    const sec = fakeEl({ clientWidth: 692, rectTop: -scrollTop });
    const sc = fakeEl({
      clientWidth: 724,
      clientHeight: 600,
      scrollTop,
      rectTop: 0,
    });
    const g = useListingGrid(
      makeOpts({
        gallery: () => true,
        scrollEl: () => sc,
        dirsSectionEl: () => sec,
        dirsCount: () => dirsCount,
        filesCount: () => 0,
      })
    );
    g.update();
    return g;
  };

  it("at the top: window starts at 0, no top spacer, positive bottom spacer", () => {
    const g = setup(0);
    expect(g.dirsWin.start).toBe(0);
    expect(g.dirsWin.topPad).toBe(0);
    expect(g.dirsWin.botPad).toBeGreaterThan(0);
    // cols 3, tileH 167, stride 179, viewH 600 → lastRow 3 + BUFFER 3 = 6 → end 21.
    expect(g.dirsWin.end).toBe(21);
  });

  it("after scrolling, the window advances and the top spacer grows", () => {
    const g = setup(2000);
    // firstRow = floor(2000/179) - 3 = 8 → start 24; topPad = 8*179 = 1432.
    expect(g.dirsWin.start).toBe(24);
    expect(g.dirsWin.topPad).toBe(1432);
    expect(g.dirsWin.end).toBe(54);
  });

  it("conserves total section height (topPad + rendered + botPad) across every scroll position", () => {
    const th = 167,
      gutter = 12,
      cols = 3,
      count = 100;
    const rows = Math.ceil(count / cols);
    const fullHeight = rows * th + (rows - 1) * gutter;
    for (const top of [0, 1000, 3000, 99999]) {
      const w = setup(top).dirsWin;
      const renderedRows = Math.ceil((w.end - w.start) / cols);
      const renderedH = renderedRows * th + (renderedRows - 1) * gutter;
      expect(w.topPad + renderedH + w.botPad).toBe(fullHeight);
    }
  });

  it("empty section → empty window", () => {
    const g = setup(0, 0);
    expect(g.dirsWin).toMatchObject({ start: 0, end: 0, topPad: 0, botPad: 0 });
  });
});

describe("useListingGrid — hitTest() lasso geometry", () => {
  it("maps a viewport rect over the first tile back to that tile's resource index", () => {
    const sec = fakeEl({ clientWidth: 692, rectTop: 0 });
    const sc = fakeEl({
      clientWidth: 724,
      clientHeight: 600,
      scrollTop: 0,
      rectTop: 0,
    });
    const g = useListingGrid(
      makeOpts({
        gallery: () => true,
        scrollEl: () => sc,
        dirsSectionEl: () => sec,
        dirsCount: () => 30,
      })
    );
    g.update(); // sets cols/tileH that hitTest reads
    const hit = g.hitTest(
      { left: 0, top: 0, right: 100, bottom: 100 },
      [5, 6, 7, 8, 9],
      []
    );
    expect(hit).toEqual([5]); // top-left tile → dirIndices[0]
  });
});
