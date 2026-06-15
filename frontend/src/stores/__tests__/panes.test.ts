import { describe, it, expect, beforeEach, vi } from "vitest";

// `panes.navigateB` is the only place the store hits the network — stub the
// listing fetch so we can drive success/error without a backend.
const fetchMock = vi.fn();
vi.mock("@/api", () => ({
  files: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));
// The prefs layer debounces a server save; make it a no-op (see _prefsHarness).
vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "@/composables/__tests__/_prefsHarness";
import { usePanesStore } from "@/stores/panes";
import { useFileStore } from "@/stores/file";
import { usePreferences } from "@/composables/usePreferences";

beforeEach(() => {
  resetPrefsHarness();
  fetchMock.mockReset();
});

function item(url: string, index: number, isDir = false): ResourceItem {
  return {
    url,
    name: url.replace(/\/$/, "").split("/").pop() || "",
    index,
    isDir,
  } as unknown as ResourceItem;
}
function req(url: string, items: ResourceItem[]): Resource {
  return { url, name: "folder", isDir: true, items } as unknown as Resource;
}

describe("panes store — coordination + persistence", () => {
  it("openSplit seeds pane B from the fallback only when unset, and persists", () => {
    const panes = usePanesStore();
    expect(panes.split).toBe(false);
    panes.openSplit("/files/Docs/");
    expect(panes.split).toBe(true);
    expect(panes.activePane).toBe("a");
    expect(panes.secondaryPath).toBe("/files/Docs/");
    // Persisted to the prefs bag.
    expect(usePreferences().get("panes.split", false)).toBe(true);

    // Re-opening keeps an already-set secondary path (doesn't reseed).
    panes.closeSplit();
    panes.secondaryPath = "/files/Pics/";
    panes.openSplit("/files/Other/");
    expect(panes.secondaryPath).toBe("/files/Pics/");
  });

  it("closeSplit resets active + selection and persists off", () => {
    const panes = usePanesStore();
    panes.openSplit("/files/Docs/");
    panes.setActive("b");
    panes.selected = [1, 2];
    panes.multiple = true;
    panes.closeSplit();
    expect(panes.split).toBe(false);
    expect(panes.activePane).toBe("a");
    expect(panes.selected).toEqual([]);
    expect(panes.multiple).toBe(false);
    expect(usePreferences().get("panes.split", true)).toBe(false);
  });

  it("restore() reads split + secondaryPath out of the prefs bag", async () => {
    await usePreferences().set("panes.split", true);
    await usePreferences().set("panes.secondaryPath", "/files/Saved/");
    const panes = usePanesStore();
    panes.restore();
    expect(panes.split).toBe(true);
    expect(panes.secondaryPath).toBe("/files/Saved/");
  });
});

describe("panes store — navigateB", () => {
  it("fetches, swaps the request, persists the new path, clears error", async () => {
    fetchMock.mockResolvedValue(
      req("/files/B/", [item("/files/B/a/", 0, true)])
    );
    const panes = usePanesStore();
    await panes.navigateB("/files/B/");
    expect(fetchMock).toHaveBeenCalledWith("/files/B/");
    expect(panes.req?.url).toBe("/files/B/");
    expect(panes.secondaryPath).toBe("/files/B/");
    expect(panes.error).toBeNull();
    expect(panes.loading).toBe(false);
    expect(usePreferences().get("panes.secondaryPath", "")).toBe("/files/B/");
  });

  it("records the error and clears the request on a failed fetch (e.g. 404)", async () => {
    fetchMock.mockRejectedValue(new Error("404"));
    const panes = usePanesStore();
    await panes.navigateB("/files/gone/");
    expect(panes.error).toBeInstanceOf(Error);
    expect(panes.req).toBeNull();
    expect(panes.loading).toBe(false);
  });

  it("refreshB bumps a nonce ComparePane watches", () => {
    const panes = usePanesStore();
    const before = panes.refreshNonce;
    panes.refreshB();
    expect(panes.refreshNonce).toBe(before + 1);
  });
});

describe("panes store — listing state surface", () => {
  it("updateRequest preserves the selection by url across a re-fetch", () => {
    const panes = usePanesStore();
    panes.req = req("/files/B/", [
      item("/files/B/keep/", 0, true),
      item("/files/B/drop.txt", 1),
    ]);
    panes.selected = [0];
    // Re-fetch: the kept folder is now at a different index.
    panes.updateRequest(
      req("/files/B/", [
        item("/files/B/new.txt", 0),
        item("/files/B/keep/", 1, true),
      ])
    );
    expect(panes.selected).toEqual([1]);
  });

  it("selectedCount getter + removeSelected", () => {
    const panes = usePanesStore();
    panes.selected = [3, 5, 7];
    expect(panes.selectedCount).toBe(3);
    panes.removeSelected(5);
    expect(panes.selected).toEqual([3, 7]);
  });

  it("snapshotDragSelection writes the GLOBAL fileStore drag snapshot", () => {
    const panes = usePanesStore();
    panes.req = req("/files/B/", [
      item("/files/B/one.txt", 0),
      item("/files/B/two.txt", 1),
    ]);
    panes.selected = [];
    panes.snapshotDragSelection(1);
    // Adopts the row into pane B's selection…
    expect(panes.selected).toEqual([1]);
    // …and mirrors it onto the one global drag snapshot the drop handler reads.
    expect(useFileStore().draggedItems.map((i) => i.url)).toEqual([
      "/files/B/two.txt",
    ]);
  });
});
