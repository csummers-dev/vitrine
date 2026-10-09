import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/ContextMenu.vue", () => ({ default: {} }));

import { useListingContextMenu } from "@/composables/listing/useListingContextMenu";

function rightClick(target: Element, opts: Partial<MouseEventInit> = {}) {
  const ev = new MouseEvent("contextmenu", {
    clientX: 100,
    clientY: 50,
    ...opts,
  });
  Object.defineProperty(ev, "target", { value: target });
  const prevent = vi.spyOn(ev, "preventDefault");
  return { ev, prevent };
}

function setup() {
  const row = [{ label: "Open" }];
  const bg = [{ label: "New folder" }];
  return useListingContextMenu({
    rowItems: () => row,
    backgroundItems: () => bg,
  });
}

describe("useListingContextMenu", () => {
  it("shows the row menu for a right-click on a row", () => {
    const m = setup();
    const item = document.createElement("div");
    item.className = "item";
    const name = document.createElement("span");
    item.appendChild(name);
    const { ev, prevent } = rightClick(name);
    m.onListingContextMenu(ev);
    expect(prevent).toHaveBeenCalled();
    expect(m.isContextMenuVisible.value).toBe(true);
    expect(m.contextMenuItems.value).toEqual([{ label: "Open" }]);
    expect(m.contextMenuPos.value.x).toBe(108);
  });

  it("treats empty space and the column header as background", () => {
    const m = setup();
    m.onListingContextMenu(rightClick(document.createElement("div")).ev);
    expect(m.contextMenuItems.value).toEqual([{ label: "New folder" }]);

    const header = document.createElement("div");
    header.className = "item header";
    m.onListingContextMenu(rightClick(header).ev);
    expect(m.contextMenuMode.value).toBe("background");
  });

  it("ctrl+click (macOS) suppresses both menus", () => {
    const m = setup();
    const { ev, prevent } = rightClick(document.createElement("div"), {
      ctrlKey: true,
    });
    m.onListingContextMenu(ev);
    expect(prevent).toHaveBeenCalled();
    expect(m.isContextMenuVisible.value).toBe(false);
  });

  it("closingFirst hides the menu before running the action", () => {
    const m = setup();
    m.onListingContextMenu(rightClick(document.createElement("div")).ev);
    let visibleDuringAction: boolean | null = null;
    const acts = m.closingFirst({
      go: (n: number) => {
        visibleDuringAction = m.isContextMenuVisible.value;
        expect(n).toBe(5);
      },
    });
    acts.go(5);
    expect(visibleDuringAction).toBe(false);
  });
});
