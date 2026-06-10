import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/files", () => ({ folderSize: vi.fn() }));

import { folderSize } from "@/api/files";
import { useFolderSizes } from "@/composables/useFolderSizes";

beforeEach(() => {
  useFolderSizes().clear();
  vi.clearAllMocks();
});

describe("useFolderSizes", () => {
  it("fetches once and caches by path + mtime", async () => {
    vi.mocked(folderSize).mockResolvedValue({ size: 42, computedAt: "" });
    const fs = useFolderSizes();

    expect(fs.cached("/a", "m1")).toBeUndefined();
    await fs.ensure("/a", "m1");
    expect(fs.cached("/a", "m1")).toBe(42);

    await fs.ensure("/a", "m1"); // already cached → no second request
    expect(folderSize).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when the folder's mtime key changes", async () => {
    vi.mocked(folderSize)
      .mockResolvedValueOnce({ size: 10, computedAt: "" })
      .mockResolvedValueOnce({ size: 20, computedAt: "" });
    const fs = useFolderSizes();

    await fs.ensure("/a", "m1");
    await fs.ensure("/a", "m2");

    expect(fs.cached("/a", "m1")).toBe(10);
    expect(fs.cached("/a", "m2")).toBe(20);
    expect(folderSize).toHaveBeenCalledTimes(2);
  });

  it("swallows errors — an out-of-scope / non-dir folder stays unfetched", async () => {
    vi.mocked(folderSize).mockRejectedValue(new Error("403"));
    const fs = useFolderSizes();

    await fs.ensure("/x", "m"); // must not throw
    expect(fs.cached("/x", "m")).toBeUndefined();
  });
});
