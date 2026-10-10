import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api", () => ({ files: { getDownloadURL: vi.fn() } }));
vi.mock("exifr", () => ({ default: { gps: vi.fn() } }));

import {
  __clearGeoCacheForTests,
  clusterPoints,
  locatePhotos,
  validCoords,
} from "@/composables/usePhotoGeo";

const s = (n: string) => ({ path: `/p/${n}`, name: n, modified: "m" });

beforeEach(() => __clearGeoCacheForTests());

describe("locatePhotos", () => {
  it("returns located photos in input order and reports progress", async () => {
    const coords: Record<string, { latitude: number; longitude: number }> = {
      "/p/a.jpg": { latitude: 48.85, longitude: 2.35 },
      "/p/c.heic": { latitude: -33.9, longitude: 151.2 },
    };
    const read = vi.fn(async (url: string) => {
      await new Promise((r) => setTimeout(r, url.includes("a.jpg") ? 5 : 0));
      return coords[url];
    });
    const progress: number[] = [];
    const res = await locatePhotos(
      [s("a.jpg"), s("b.jpg"), s("c.heic"), s("notes.txt")],
      { read, urlOf: (p) => p.path, onProgress: (d) => progress.push(d) }
    );
    expect(res.map((r) => r.name)).toEqual(["a.jpg", "c.heic"]);
    expect(res[0]).toMatchObject({ lat: 48.85, lon: 2.35 });
    expect(read).toHaveBeenCalledTimes(3); // notes.txt skipped
    expect(progress.at(-1)).toBe(3);

    // Cached: a second run reads nothing.
    await locatePhotos([s("a.jpg"), s("b.jpg")], {
      read,
      urlOf: (p) => p.path,
    });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("treats read errors as no location", async () => {
    const res = await locatePhotos([s("x.jpg")], {
      read: async () => {
        throw new Error("no exif");
      },
      urlOf: (p) => p.path,
    });
    expect(res).toEqual([]);
  });
});

describe("validCoords", () => {
  it("rejects 0,0 and out-of-range values", () => {
    expect(validCoords(10, 20)).toBe(true);
    expect(validCoords(0, 0)).toBe(false);
    expect(validCoords(91, 0)).toBe(false);
    expect(validCoords(NaN, 1)).toBe(false);
    expect(validCoords(undefined, 1)).toBe(false);
  });
});

describe("clusterPoints", () => {
  it("groups points sharing a pixel cell", () => {
    const pts = [
      { id: 1, x: 10, y: 10 },
      { id: 2, x: 30, y: 40 },
      { id: 3, x: 200, y: 10 },
    ];
    const c = clusterPoints(pts, (p) => p, 56);
    expect(c.map((g) => g.map((p) => p.id))).toEqual([[1, 2], [3]]);
  });
});
