import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useFileStore } from "@/stores/file";

beforeEach(() => setActivePinia(createPinia()));

const item = (url: string, index: number): ResourceItem =>
  ({ url, index, name: url.split("/").pop() }) as unknown as ResourceItem;
const req = (items: ResourceItem[], isDir = true): Resource =>
  ({ url: "/files/F/", isDir, name: "F", items }) as unknown as Resource;

describe("file store — selection + getters", () => {
  it("selectedCount tracks the selection", () => {
    const s = useFileStore();
    expect(s.selectedCount).toBe(0);
    s.selected = [1, 4];
    expect(s.selectedCount).toBe(2);
  });

  it("toggleMultiple flips the flag", () => {
    const s = useFileStore();
    s.toggleMultiple();
    expect(s.multiple).toBe(true);
    s.toggleMultiple();
    expect(s.multiple).toBe(false);
  });

  it("isListing requires a Files-route directory request", () => {
    const s = useFileStore();
    expect(s.isListing).toBeFalsy();
    s.isFiles = true;
    s.req = req([item("/a", 0)]);
    expect(s.isListing).toBe(true);
    s.req = req([], false); // a file preview, not a dir
    expect(s.isListing).toBe(false);
  });

  it("removeSelected drops one index, no-op when absent", () => {
    const s = useFileStore();
    s.selected = [1, 2, 3];
    s.removeSelected(2);
    expect(s.selected).toEqual([1, 3]);
    s.removeSelected(99);
    expect(s.selected).toEqual([1, 3]);
  });

  it("setPreselect normalizes a string or array into an array", () => {
    const s = useFileStore();
    s.setPreselect("/files/x");
    expect(s.preselect).toEqual(["/files/x"]);
    s.setPreselect(["/a", "/b"]);
    expect(s.preselect).toEqual(["/a", "/b"]);
  });
});

describe("file store — updateRequest preserves selection by URL (v1.3 H4)", () => {
  it("re-selects the same items after a reorder, and resets the keyboard cursor", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0), item("/b", 1), item("/c", 2)]);
    s.selected = [0, 2]; // a + c
    s.activeIndex = 2;
    s.anchorIndex = 0;
    s.updateRequest(req([item("/b", 0), item("/a", 1), item("/c", 2)]));
    expect(s.selected).toEqual([1, 2]); // a@1, c@2
    expect(s.activeIndex).toBe(-1);
    expect(s.anchorIndex).toBe(-1);
  });

  it("drops selected items that no longer exist", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0), item("/b", 1)]);
    s.selected = [1]; // b
    s.updateRequest(req([item("/a", 0)]));
    expect(s.selected).toEqual([]);
  });

  it("clears selection when the request becomes null", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0)]);
    s.selected = [0];
    s.updateRequest(null);
    expect(s.selected).toEqual([]);
    expect(s.req).toBeNull();
  });
});

describe("file store — snapshotDragSelection (drag set capture)", () => {
  it("selects + snapshots the row when nothing was selected", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0), item("/b", 1), item("/c", 2)]);
    s.snapshotDragSelection(2);
    expect(s.selected).toEqual([2]);
    expect(s.draggedItems.map((i) => i.url)).toEqual(["/c"]);
  });

  it("keeps the whole multi-selection when dragging a row inside it", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0), item("/b", 1), item("/c", 2), item("/d", 3)]);
    s.selected = [1, 3];
    s.snapshotDragSelection(1);
    expect(s.selected).toEqual([1, 3]);
    expect(s.draggedItems.map((i) => i.url)).toEqual(["/b", "/d"]);
  });

  it("replaces the selection when dragging a row outside it", () => {
    const s = useFileStore();
    s.req = req([item("/a", 0), item("/b", 1), item("/c", 2)]);
    s.selected = [0];
    s.snapshotDragSelection(2);
    expect(s.selected).toEqual([2]);
    expect(s.draggedItems.map((i) => i.url)).toEqual(["/c"]);
  });
});

describe("file store — clearFile", () => {
  it("resets to defaults", () => {
    const s = useFileStore();
    s.selected = [1];
    s.multiple = true;
    s.draggedItems = [item("/a", 0)];
    s.activeIndex = 3;
    s.clearFile();
    expect(s.selected).toEqual([]);
    expect(s.multiple).toBe(false);
    expect(s.draggedItems).toEqual([]);
    expect(s.activeIndex).toBe(-1);
  });
});
