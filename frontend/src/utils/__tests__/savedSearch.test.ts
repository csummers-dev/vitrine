import { describe, it, expect, vi, beforeEach } from "vitest";

// A reactive bag, like the real preferences on the auth store.
const { searchRecursive, prefsBag } = await vi.hoisted(async () => {
  const { reactive } = await import("vue");
  return {
    searchRecursive: vi.fn(),
    prefsBag: reactive({}) as Record<string, unknown>,
  };
});
vi.mock("@/api", () => ({ tags: { searchRecursive } }));

vi.mock("@/composables/usePreferences", () => ({
  usePreferences: () => ({
    get: <T>(k: string, d: T): T => (k in prefsBag ? (prefsBag[k] as T) : d),
    set: (k: string, v: unknown) => {
      prefsBag[k] = v;
      return Promise.resolve();
    },
  }),
}));

import {
  folderLabel,
  normalizeFolder,
  sanitizeSaved,
  savedSearchUrl,
  useSavedSearches,
  SAVED_SEARCH_PREF,
} from "@/composables/useSavedSearches";
import {
  runSavedSearch,
  toListing,
  unknownTags,
} from "@/utils/savedSearchListing";
import { parseQuery } from "@/utils/searchQuery";

const sorting = { by: "name", asc: true } as Sorting;

beforeEach(() => {
  for (const k of Object.keys(prefsBag)) delete prefsBag[k];
  searchRecursive.mockReset();
});

describe("saved search helpers", () => {
  it("normalizes folders and builds URLs", () => {
    expect(normalizeFolder("Photos/")).toBe("/Photos");
    expect(normalizeFolder("")).toBe("/");
    expect(savedSearchUrl({ id: "a1", folder: "/" })).toBe("/files/?saved=a1");
    expect(savedSearchUrl({ id: "a1", folder: "/My Photos/2026" })).toBe(
      "/files/My%20Photos/2026/?saved=a1"
    );
    expect(folderLabel("/My Photos/2026")).toBe("2026");
    expect(folderLabel("/", "Home")).toBe("Home");
  });

  it("drops malformed and duplicate entries", () => {
    expect(
      sanitizeSaved([
        { id: "a", name: "A", query: "added:7d", folder: "Photos" },
        { id: "a", name: "dupe", query: "x", folder: "/" },
        { id: "b", name: 3, query: "x", folder: "/" },
        null,
        "junk",
      ])
    ).toEqual([{ id: "a", name: "A", query: "added:7d", folder: "/Photos" }]);
    expect(sanitizeSaved({ not: "a list" })).toEqual([]);
  });
});

describe("useSavedSearches", () => {
  it("adds, updates and removes", () => {
    const s = useSavedSearches();
    const a = s.save({ name: " ", query: " type:video ", folder: "Movies/" });
    expect(a).toMatchObject({
      name: "type:video",
      query: "type:video",
      folder: "/Movies",
    });
    expect(s.list.value).toHaveLength(1);

    s.save({ ...a, name: "Films" });
    expect(s.list.value).toEqual([{ ...a, name: "Films" }]);

    // An unknown id is a new entry, not an overwrite.
    s.save({ id: "nope", name: "B", query: "added:1d", folder: "/" });
    expect(s.list.value).toHaveLength(2);
    expect(s.get("nope")).toBeUndefined();

    s.remove(a.id);
    expect(s.list.value.map((x) => x.name)).toEqual(["B"]);
    expect(prefsBag[SAVED_SEARCH_PREF]).toHaveLength(1);
  });
});

describe("saved search listing", () => {
  const saved = {
    id: "s1",
    name: "Big videos",
    query: "type:video size:>1GB",
    folder: "/Movies",
  };
  const hits: RecursiveEntry[] = [
    {
      path: "/Movies/Trip 2026/clip.mkv",
      name: "clip.mkv",
      size: 2 ** 31,
      modified: "2026-10-01T00:00:00Z",
      isDir: false,
      type: "video",
    },
    {
      path: "/Movies/Extras",
      name: "Extras",
      size: 0,
      modified: "2026-10-01T00:00:00Z",
      isDir: true,
    },
  ];

  it("shapes hits as a read-only folder listing with real item URLs", () => {
    const res = toListing(saved, hits, sorting);
    expect(res).toMatchObject({
      path: "/Movies",
      name: "Big videos",
      url: "/files/Movies/",
      isDir: true,
      numDirs: 1,
      numFiles: 1,
      savedSearch: { id: "s1", folder: "/Movies", total: 2 },
    });
    expect(res.items[0]).toMatchObject({
      url: "/files/Movies/Trip%202026/clip.mkv",
      extension: ".mkv",
      type: "video",
      index: 0,
    });
    expect(res.items[1]).toMatchObject({
      url: "/files/Movies/Extras/",
      type: "dir",
      index: 1,
    });
  });

  it("runs the query against the saved folder", async () => {
    searchRecursive.mockResolvedValue(hits);
    const res = await runSavedSearch(saved, { nameToId: {}, sorting });
    expect(searchRecursive).toHaveBeenCalledWith(
      "/files/Movies",
      `type=video&minSize=${2 ** 30}`,
      undefined
    );
    expect(res.items).toHaveLength(2);
  });

  it("matches nothing when a tag no longer exists", async () => {
    expect(unknownTags(parseQuery("tag:Work tag:gone"), { work: 1 })).toEqual([
      "gone",
    ]);
    const res = await runSavedSearch(
      { ...saved, query: "tag:gone" },
      { nameToId: {}, sorting }
    );
    expect(searchRecursive).not.toHaveBeenCalled();
    expect(res.items).toEqual([]);
  });
});
