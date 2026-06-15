import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Stub the batched tag lookup so we can drive what each "folder" returns.
const batchForFiles = vi.fn();
vi.mock("@/api", () => ({
  tags: { batchForFiles: (...a: unknown[]) => batchForFiles(...a) },
}));

import { useTagsStore } from "@/stores/tags";

const tag = (name: string) => ({ id: 1, name, color: "blue" }) as unknown;

beforeEach(() => {
  setActivePinia(createPinia());
  batchForFiles.mockReset();
});

describe("tags store — loadForPaths merge-refresh (DP v2 R1)", () => {
  it("refreshes only the queried paths and leaves the other pane's untouched", async () => {
    const tags = useTagsStore();

    // Pane A loads its folder.
    batchForFiles.mockResolvedValueOnce({ "/files/A/x.txt": [tag("red")] });
    await tags.loadForPaths(["/files/A/x.txt"]);
    expect(tags.forPath("/files/A/x.txt").map((t) => t.name)).toEqual(["red"]);

    // Pane B navigates — must NOT wipe pane A's chips (the old whole-map
    // replace did, causing cross-pane flicker + re-fetch churn).
    batchForFiles.mockResolvedValueOnce({ "/files/B/y.txt": [tag("blue")] });
    await tags.loadForPaths(["/files/B/y.txt"]);
    expect(tags.forPath("/files/B/y.txt").map((t) => t.name)).toEqual(["blue"]);
    expect(tags.forPath("/files/A/x.txt").map((t) => t.name)).toEqual(["red"]);
  });

  it("clears a queried path that lost all its tags, without touching others", async () => {
    const tags = useTagsStore();
    batchForFiles.mockResolvedValueOnce({
      "/files/keep.txt": [tag("green")],
      "/files/drop.txt": [tag("amber")],
    });
    await tags.loadForPaths(["/files/keep.txt", "/files/drop.txt"]);

    // Re-query the same folder; drop.txt now returns no tags → entry cleared.
    batchForFiles.mockResolvedValueOnce({ "/files/keep.txt": [tag("green")] });
    await tags.loadForPaths(["/files/keep.txt", "/files/drop.txt"]);
    expect(tags.forPath("/files/keep.txt").map((t) => t.name)).toEqual([
      "green",
    ]);
    expect(tags.forPath("/files/drop.txt")).toEqual([]);
  });

  it("an empty path list is a no-op (doesn't wipe the cache)", async () => {
    const tags = useTagsStore();
    batchForFiles.mockResolvedValueOnce({ "/files/a.txt": [tag("red")] });
    await tags.loadForPaths(["/files/a.txt"]);
    await tags.loadForPaths([]);
    expect(tags.forPath("/files/a.txt").map((t) => t.name)).toEqual(["red"]);
    expect(batchForFiles).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache intact when the fetch throws", async () => {
    const tags = useTagsStore();
    batchForFiles.mockResolvedValueOnce({ "/files/a.txt": [tag("red")] });
    await tags.loadForPaths(["/files/a.txt"]);
    batchForFiles.mockRejectedValueOnce(new Error("offline"));
    await tags.loadForPaths(["/files/b.txt"]);
    expect(tags.forPath("/files/a.txt").map((t) => t.name)).toEqual(["red"]);
  });
});
