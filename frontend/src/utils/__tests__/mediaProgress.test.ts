import { describe, it, expect } from "vitest";
import {
  continueItems,
  forgetProgress,
  rekeyProgress,
  spineFraction,
  type PrefsLike,
} from "@/utils/mediaProgress";

function store(init: Record<string, unknown> = {}): PrefsLike & {
  bag: Record<string, unknown>;
} {
  const bag = { ...init };
  return {
    bag,
    get: <T>(k: string, d: T) => (k in bag ? (bag[k] as T) : d),
    set: (k: string, v: unknown) => {
      bag[k] = v;
    },
  };
}

describe("continueItems", () => {
  it("merges the three maps newest first, skipping unstarted + finished", () => {
    const p = store({
      "epub.positions": {
        "/b/new.epub": { cfi: "epubcfi(/6/4)", at: 50, pct: 0.4 },
        "/b/old.epub": { cfi: "epubcfi(/6/2)", at: 10 },
        "/b/unopened.epub": { cfi: 0, at: 60 },
        "/b/done.epub": { cfi: "x", at: 70, pct: 0.99 },
      },
      "comic.positions": {
        "/c/a.cbz": { page: 4, total: 20, at: 40 },
        "/c/last.cbz": { page: 19, total: 20, at: 80 },
        "/c/first.cbz": { page: 0, total: 20, at: 90 },
      },
      "video.positions": {
        "/v/m.mkv": { t: 600, dur: 3600, at: 30 },
        "/v/w.mkv": { t: 0, dur: 3600, at: 100, watched: true },
      },
    });
    const items = continueItems(p);
    expect(items.map((i) => i.path)).toEqual([
      "/b/new.epub",
      "/c/a.cbz",
      "/v/m.mkv",
      "/b/old.epub",
    ]);
    expect(items[0]).toMatchObject({
      kind: "epub",
      name: "new.epub",
      fraction: 0.4,
    });
    expect(items[1].fraction).toBeCloseTo(5 / 20);
    expect(items[3].fraction).toBeNull();
  });

  it("respects the limit", () => {
    const map: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++)
      map[`/v${i}.mkv`] = { t: 60, dur: 3600, at: i };
    expect(continueItems(store({ "video.positions": map }), 5)).toHaveLength(5);
  });
});

describe("rekeyProgress / forgetProgress", () => {
  it("moves a file's progress and a folder's subtree", () => {
    const p = store({
      "video.positions": {
        "/Movies/a.mkv": { t: 1, dur: 2, at: 1 },
        "/Movies/Sub/b.mkv": { t: 1, dur: 2, at: 1 },
        "/MoviesOld/c.mkv": { t: 1, dur: 2, at: 1 },
      },
      "epub.positions": { "/Books/x.epub": { cfi: "c", at: 1 } },
    });
    rekeyProgress(p, "/Movies", "/Films");
    expect(Object.keys(p.bag["video.positions"] as object).sort()).toEqual([
      "/Films/Sub/b.mkv",
      "/Films/a.mkv",
      "/MoviesOld/c.mkv",
    ]);
    rekeyProgress(p, "/Books/x.epub", "/Books/y.epub");
    expect(p.bag["epub.positions"]).toHaveProperty(["/Books/y.epub"]);
  });

  it("forgets a deleted file or folder", () => {
    const p = store({
      "comic.positions": {
        "/C/a.cbz": { page: 1, at: 1 },
        "/C/b.cbz": { page: 1, at: 1 },
        "/D/c.cbz": { page: 1, at: 1 },
      },
    });
    forgetProgress(p, "/C/a.cbz");
    expect(Object.keys(p.bag["comic.positions"] as object)).toEqual([
      "/C/b.cbz",
      "/D/c.cbz",
    ]);
    forgetProgress(p, "/C/");
    expect(Object.keys(p.bag["comic.positions"] as object)).toEqual([
      "/D/c.cbz",
    ]);
  });

  it("leaves maps untouched when nothing matches", () => {
    const map = { "/a.mkv": { t: 1, dur: 2, at: 1 } };
    const p = store({ "video.positions": map });
    rekeyProgress(p, "/zzz", "/yyy");
    forgetProgress(p, "/zzz");
    expect(p.bag["video.positions"]).toBe(map);
  });
});

describe("spineFraction", () => {
  it("combines chapter index and page-in-chapter", () => {
    expect(spineFraction({ start: { index: 0 } }, 10)).toBe(0);
    expect(
      spineFraction(
        { start: { index: 4, displayed: { page: 3, total: 4 } } },
        10
      )
    ).toBeCloseTo(0.45);
    expect(spineFraction({ atEnd: true }, 10)).toBe(1);
    expect(spineFraction({ start: {} }, 10)).toBeNull();
    expect(spineFraction({ start: { index: 2 } }, 0)).toBeNull();
  });
});
