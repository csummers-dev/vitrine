import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const scanFiles = vi.fn();
vi.mock("@/utils/upload", () => ({
  scanFiles: (...a: unknown[]) => scanFiles(...a),
}));
const endDragBadge = vi.fn();
vi.mock("@/utils/dragCopyMoveBadge", () => ({
  endDragBadge: () => endDragBadge(),
}));
const fetch = vi.fn();
vi.mock("@/api", () => ({
  files: { fetch: (...a: unknown[]) => fetch(...a) },
}));
let dropMode: "into" | "alongside" = "alongside";
vi.mock("@/utils/dropZone", () => ({ resolveRowDropMode: () => dropMode }));

import { useOsFileDrop } from "@/composables/listing/useOsFileDrop";
import { useFileStore } from "@/stores/file";
import { usePanesStore } from "@/stores/panes";

function setup() {
  setActivePinia(createPinia());
  const files = useFileStore();
  files.req = { isDir: true, url: "/files/Docs/" } as unknown as Resource;
  const deps = {
    routePath: () => "/files/Docs",
    startUpload: vi.fn().mockResolvedValue(undefined),
    showError: vi.fn(),
    stopDragScroll: vi.fn(),
    onListingDragEnd: vi.fn(),
  };
  return { o: useOsFileDrop(deps), deps, files };
}

function rows(n: number) {
  document.body.innerHTML = "";
  return Array.from({ length: n }, () => {
    const el = document.createElement("div");
    el.className = "item";
    document.body.appendChild(el);
    return el;
  });
}

const dropOn = (target: Element) =>
  ({
    preventDefault: vi.fn(),
    target,
    clientX: 1,
    clientY: 1,
    dataTransfer: { files: { length: 1 } },
  }) as unknown as DragEvent;

beforeEach(() => {
  scanFiles.mockReset().mockResolvedValue([{ name: "a.txt" }]);
  fetch.mockReset().mockResolvedValue({ items: [] });
  endDragBadge.mockReset();
  dropMode = "alongside";
});

describe("useOsFileDrop", () => {
  it("dims rows while a drag is over the page and restores them when it leaves", () => {
    const { o, deps } = setup();
    const [a, b] = rows(2);
    b.classList.add("item--drop-into");
    o.dragEnter();
    o.dragEnter(); // entering a child element
    expect(a.style.opacity).toBe("0.5");
    expect(b.style.opacity).toBe(""); // the active drop target stays bright
    o.dragLeave();
    expect(a.style.opacity).toBe("0.5");
    o.dragLeave();
    expect(a.style.opacity).toBe("1");
    expect(b.classList.contains("item--drop-into")).toBe(false);
    expect(deps.stopDragScroll).toHaveBeenCalled();
  });

  it("drops OS files into the current folder and preselects them", async () => {
    const { o, deps } = setup();
    await o.drop(dropOn(document.createElement("div")));
    expect(deps.startUpload).toHaveBeenCalledWith(
      [{ name: "a.txt" }],
      "/files/Docs/",
      true
    );
  });

  it("drops into a folder row when over its icon and name", async () => {
    const { o, deps } = setup();
    const [row] = rows(1);
    row.dataset.dropUrl = "/files/Docs/Inbox/";
    dropMode = "into";
    await o.drop(dropOn(row));
    expect(fetch).toHaveBeenCalledWith("/files/Docs/Inbox/");
    expect(deps.startUpload).toHaveBeenCalledWith(
      expect.anything(),
      "/files/Docs/Inbox/",
      true
    );
  });

  it("drops into pane B's folder without preselecting", async () => {
    const { o, deps } = setup();
    usePanesStore().secondaryPath = "/files/Other";
    const pane = document.createElement("div");
    pane.className = "compare-pane";
    const inner = document.createElement("div");
    pane.appendChild(inner);
    await o.drop(dropOn(inner));
    expect(deps.startUpload).toHaveBeenCalledWith(
      expect.anything(),
      "/files/Other/",
      false
    );
  });

  it("Escape during a drag runs every teardown; a plain Escape doesn't", () => {
    const { o, deps, files } = setup();
    o.onDragCancelKey(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(endDragBadge).not.toHaveBeenCalled();

    files.draggedItems = [{ url: "/files/x" } as ResourceItem];
    o.onDragCancelKey(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(endDragBadge).toHaveBeenCalled();
    expect(files.draggedItems).toEqual([]);
    expect(deps.onListingDragEnd).toHaveBeenCalled();
    expect(deps.stopDragScroll).toHaveBeenCalled();
  });
});
