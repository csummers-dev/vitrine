import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const performDrop = vi.fn();
vi.mock("@/composables/useDropTarget", () => ({
  useDropTarget: () => ({ performDrop }),
}));

import { useListingDropTargets } from "@/composables/listing/useListingDropTargets";
import { useFileStore } from "@/stores/file";

const dragEvent = (target: Element | null = null) =>
  ({
    preventDefault: vi.fn(),
    ctrlKey: false,
    metaKey: false,
    target,
    dataTransfer: { dropEffect: "none" },
  }) as unknown as DragEvent;

function setup(folderUrl = "/files/Media/Movies/", split = false) {
  setActivePinia(createPinia());
  const files = useFileStore();
  files.req = { isDir: true, url: folderUrl } as unknown as Resource;
  files.draggedItems = [{ url: "/files/x" } as ResourceItem];
  const navigate = vi.fn();
  const d = useListingDropTargets({ splitActive: ref(split), navigate });
  return { d, navigate, files };
}

beforeEach(() => {
  vi.useFakeTimers();
  performDrop.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useListingDropTargets", () => {
  it("knows the parent folder, and has none at the root", () => {
    expect(setup().d.parentFolderUrl.value).toBe("/files/Media/");
    expect(setup("/files/").d.parentFolderUrl.value).toBeNull();
  });

  it("hovering the title during a drag navigates up after the spring delay", () => {
    const { d, navigate } = setup();
    d.onSectionDragEnter(dragEvent());
    expect(d.sectionDropActive.value).toBe(true);
    vi.advanceTimersByTime(d.PARENT_SPRING_MS - 1);
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(navigate).toHaveBeenCalledWith("/files/Media/");
    expect(d.sectionDropActive.value).toBe(false);
  });

  it("leaving, dropping or ending the drag cancels the spring-load", () => {
    for (const end of ["leave", "drop", "dragend"] as const) {
      const { d, navigate } = setup();
      d.onSectionDragEnter(dragEvent());
      if (end === "leave") d.onSectionDragLeave();
      if (end === "drop") d.onSectionDrop(dragEvent());
      if (end === "dragend") d.onListingDragEnd();
      vi.advanceTimersByTime(5000);
      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it("dropping on the title moves the drag into the parent folder", () => {
    const { d } = setup();
    const ev = dragEvent();
    d.onSectionDrop(ev);
    expect(performDrop).toHaveBeenCalledWith(ev, "/files/Media/");
  });

  it("ignores the title when nothing internal is being dragged", () => {
    const { d, files } = setup();
    files.draggedItems = [];
    d.onSectionDragEnter(dragEvent());
    expect(d.sectionDropActive.value).toBe(false);
  });

  it("pane A lights up and accepts drops only in split view, not on rows", () => {
    const single = setup();
    single.d.onPaneADragEnter(dragEvent());
    expect(single.d.paneADropActive.value).toBe(false);

    const { d } = setup("/files/Media/Movies/", true);
    d.onPaneADragEnter(dragEvent());
    expect(d.paneADropActive.value).toBe(true);

    const row = document.createElement("div");
    row.className = "item";
    d.onPaneADrop(dragEvent(row));
    expect(performDrop).not.toHaveBeenCalled();
    expect(d.paneADropActive.value).toBe(false);

    const ev = dragEvent(document.createElement("div"));
    d.onPaneADrop(ev);
    expect(performDrop).toHaveBeenCalledWith(ev, "/files/Media/Movies/");
  });

  it("an alongside drop on a row lands in the current folder", () => {
    const { d } = setup();
    const ev = dragEvent();
    d.onItemDropAlongside(ev);
    expect(performDrop).toHaveBeenCalledWith(ev, "/files/Media/Movies/");
  });
});
