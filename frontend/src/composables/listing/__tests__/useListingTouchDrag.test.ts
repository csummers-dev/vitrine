import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

// Capture the gesture callbacks the listing hands to useTouchDrag.
type Opts = {
  ghostLabel: (p: { index: number }) => string;
  onMove: (p: unknown, x: number, y: number, el: Element | null) => void;
  onDrop: () => void;
  onEnd: () => void;
};
let opts: Opts;
vi.mock("@/composables/useTouchDrag", () => ({
  useTouchDrag: (o: Opts) => {
    opts = o;
    return { onPointerDown: vi.fn() };
  },
}));
let dropMode: "into" | "alongside" = "into";
vi.mock("@/utils/dropZone", () => ({ resolveRowDropMode: () => dropMode }));

import { useListingTouchDrag } from "@/composables/listing/useListingTouchDrag";
import { useFileStore } from "@/stores/file";

function folderRow(url: string) {
  const el = document.createElement("div");
  el.className = "item";
  el.setAttribute("data-dir", "true");
  el.dataset.dropUrl = url;
  return el;
}

function setup() {
  setActivePinia(createPinia());
  const files = useFileStore();
  files.req = {
    isDir: true,
    url: "/files/Docs/",
    items: [{ name: "a.txt" }],
  } as unknown as Resource;
  const deps = {
    currentFolderUrl: ref("/files/Docs/"),
    scrollEl: () => null,
    navigate: vi.fn(),
    performDrop: vi.fn().mockResolvedValue(undefined),
  };
  useListingTouchDrag(deps);
  return { deps, files };
}

beforeEach(() => {
  vi.useFakeTimers();
  dropMode = "into";
});
afterEach(() => vi.useRealTimers());

describe("useListingTouchDrag", () => {
  it("labels the ghost with the item name, or a count for several", () => {
    const { files } = setup();
    expect(opts.ghostLabel({ index: 0 })).toBe("a.txt");
    files.draggedItems = [{}, {}, {}] as ResourceItem[];
    expect(opts.ghostLabel({ index: 0 })).toBe("3 items");
  });

  it("drops into a folder when released over its into-zone", () => {
    const { deps } = setup();
    const row = folderRow("/files/Docs/Inbox/");
    opts.onMove({}, 1, 1, row);
    expect(row.style.outline).not.toBe("");
    opts.onDrop();
    expect(deps.performDrop).toHaveBeenCalledWith(
      expect.anything(),
      "/files/Docs/Inbox/"
    );
    expect(row.style.outline).toBe("");
  });

  it("drops alongside (current folder) outside a folder's into-zone", () => {
    const { deps } = setup();
    dropMode = "alongside";
    opts.onMove({}, 1, 1, folderRow("/files/Docs/Inbox/"));
    opts.onDrop();
    expect(deps.performDrop).toHaveBeenCalledWith(
      expect.anything(),
      "/files/Docs/"
    );
  });

  it("does nothing when released over nothing droppable", () => {
    const { deps } = setup();
    opts.onMove({}, 1, 1, document.createElement("div"));
    opts.onDrop();
    expect(deps.performDrop).not.toHaveBeenCalled();
  });

  it("holding over a folder springs into it after 2 seconds", () => {
    const { deps } = setup();
    opts.onMove({}, 1, 1, folderRow("/files/Docs/Inbox/"));
    vi.advanceTimersByTime(1999);
    expect(deps.navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(deps.navigate).toHaveBeenCalledWith("/files/Docs/Inbox/");
  });

  it("ending the gesture clears the drag and swallows the synthetic click", () => {
    const { files } = setup();
    files.draggedItems = [{}] as ResourceItem[];
    opts.onEnd();
    expect(files.draggedItems).toEqual([]);
    expect(files.suppressClicksUntil).toBeGreaterThan(Date.now());
  });
});
