import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the two backends behind searchSmart; use the REAL parseQuery so the
// free-text vs structured-filter ROUTING is genuinely exercised.
const streamingSearch = vi.fn();
const searchRecursive = vi.fn();
vi.mock("@/api", () => ({
  search: (...a: unknown[]) => streamingSearch(...a),
  tags: { searchRecursive: (...a: unknown[]) => searchRecursive(...a) },
}));
vi.mock("@/stores/tags", () => ({
  useTagsStore: () => ({
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    nameToId: new Map([["work", 3]]),
  }),
}));

import { searchSmart } from "@/utils/searchSmart";

beforeEach(() => {
  streamingSearch.mockReset();
  searchRecursive.mockReset();
});

const liveSignal = () => ({ aborted: false }) as unknown as AbortSignal;

type StreamItem = { path: string; url: string; isDir: boolean };

describe("searchSmart routing + hit reshaping", () => {
  it("free text → streaming endpoint, reshaping each hit", async () => {
    streamingSearch.mockImplementation((...args: unknown[]) => {
      const cb = args[3] as (i: StreamItem) => void;
      cb({
        path: "sub/file.txt",
        url: "/files/Docs/sub/file.txt",
        isDir: false,
      });
      return Promise.resolve();
    });
    const hits: unknown[] = [];
    await searchSmart("/Docs/", "file", liveSignal(), (h) => hits.push(h));
    expect(streamingSearch).toHaveBeenCalledOnce();
    expect(searchRecursive).not.toHaveBeenCalled();
    expect(hits).toEqual([
      {
        dir: false,
        name: "file.txt",
        path: "/Docs/sub/file.txt",
        url: "/files/Docs/sub/file.txt",
      },
    ]);
  });

  it("structured filter (tag:) → recursive endpoint, reshaping each hit", async () => {
    searchRecursive.mockResolvedValue([
      {
        path: "/Docs/report.pdf",
        name: "report.pdf",
        isDir: false,
        size: 10,
        modified: "2026",
      },
    ]);
    const hits: unknown[] = [];
    await searchSmart("/Docs/", "tag:work", liveSignal(), (h) => hits.push(h));
    expect(searchRecursive).toHaveBeenCalledOnce();
    expect(streamingSearch).not.toHaveBeenCalled();
    expect(hits).toEqual([
      {
        dir: false,
        name: "report.pdf",
        path: "/Docs/report.pdf",
        url: "/files/Docs/report.pdf",
        size: 10,
        modified: "2026",
      },
    ]);
  });

  it("a directory hit on the recursive path gets a trailing-slash URL", async () => {
    searchRecursive.mockResolvedValue([
      { path: "/Docs/Sub", name: "Sub", isDir: true },
    ]);
    const hits: Array<{ url: string; dir: boolean }> = [];
    await searchSmart("/Docs/", "ext:pdf", liveSignal(), (h) =>
      hits.push(h as { url: string; dir: boolean })
    );
    expect(hits[0].url).toBe("/files/Docs/Sub/");
    expect(hits[0].dir).toBe(true);
  });

  it("an already-aborted signal yields no results on the streaming path", async () => {
    streamingSearch.mockImplementation((...args: unknown[]) => {
      const cb = args[3] as (i: StreamItem) => void;
      cb({ path: "x", url: "/files/x", isDir: false });
      return Promise.resolve();
    });
    const aborted = { aborted: true } as unknown as AbortSignal;
    const hits: unknown[] = [];
    await searchSmart("/", "free", aborted, (h) => hits.push(h));
    expect(hits).toEqual([]);
  });
});
