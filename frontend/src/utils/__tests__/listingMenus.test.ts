import { describe, it, expect, vi } from "vitest";
import {
  buildBackgroundMenu,
  buildRowMenu,
  type RowMenuContext,
  type SelectionGates,
} from "@/utils/listingMenus";

const t = (k: string) =>
  ({
    "buttons.share": "Share",
    "buttons.unzip": "Extract",
    "buttons.rename": "Rename",
    "buttons.download": "Download",
    "buttons.delete": "Delete",
    "buttons.upload": "Upload",
  })[k] ?? k;

const allGates: SelectionGates = {
  share: true,
  extract: false,
  move: true,
  copy: true,
  rename: true,
  download: true,
  delete: true,
};

const folder = { url: "/files/Music/", name: "Music", isDir: true };
const song = { url: "/files/a.mp3", name: "a.mp3", isDir: false };

function ctx(over: Partial<RowMenuContext> = {}): RowMenuContext {
  return {
    selectedCount: 1,
    singleItem: song as unknown as ResourceItem,
    gates: allGates,
    perms: { rename: true, modify: true },
    split: { active: false, available: true },
    isFavorited: () => false,
    clipboardHasItems: false,
    bulkAudioCount: 0,
    canBulkEditTags: false,
    t,
    ...over,
  };
}

function actions() {
  return {
    open: vi.fn(),
    openInNewPane: vi.fn(),
    tag: vi.fn(),
    editFavoriteTitle: vi.fn(),
    prompt: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    pasteInto: vi.fn(),
    bulkRename: vi.fn(),
    copyPath: vi.fn(),
    download: vi.fn(),
  };
}

const labels = (items: { label?: string; type?: string }[]) =>
  items.map((i) => i.label ?? `—${i.type}`);

describe("buildRowMenu", () => {
  it("offers Mark watched / unwatched by the selection's state (3.4)", () => {
    const a = { ...actions(), setWatched: vi.fn() };
    const one = buildRowMenu(ctx({ videos: { count: 1, watched: 0 } }), a);
    expect(labels(one)).toContain("Mark watched");
    expect(labels(one)).not.toContain("Mark unwatched");

    const mixed = labels(
      buildRowMenu(
        ctx({
          selectedCount: 3,
          singleItem: null,
          videos: { count: 3, watched: 1 },
        }),
        a
      )
    );
    expect(mixed).toContain("Mark watched (3 videos)");
    expect(mixed).toContain("Mark unwatched (3 videos)");

    const done = buildRowMenu(ctx({ videos: { count: 1, watched: 1 } }), a);
    done.find((i) => i.label === "Mark unwatched")!.action!();
    expect(a.setWatched).toHaveBeenCalledWith(false);
    expect(labels(done)).not.toContain("Mark watched");
  });

  it("has no watched items without videos or without the action", () => {
    expect(labels(buildRowMenu(ctx(), actions()))).not.toContain(
      "Mark watched"
    );
    expect(
      labels(buildRowMenu(ctx({ videos: { count: 1, watched: 0 } }), actions()))
    ).not.toContain("Mark watched");
  });

  it("is empty with no selection", () => {
    expect(buildRowMenu(ctx({ selectedCount: 0 }), actions())).toEqual([]);
  });

  it("lists single-file actions in order, with Delete set apart", () => {
    expect(labels(buildRowMenu(ctx(), actions()))).toEqual([
      "Open",
      "Tag…",
      "Share",
      "Edit tags…",
      "—separator",
      "Cut",
      "Copy",
      "—separator",
      "Rename",
      "Move file to…",
      "Copy file to…",
      "Copy path",
      "Download",
      "—separator",
      "Delete",
    ]);
  });

  it("offers folder-only actions for a single folder", () => {
    const items = labels(
      buildRowMenu(
        ctx({
          singleItem: folder as unknown as ResourceItem,
          isFavorited: () => true,
          clipboardHasItems: true,
        }),
        actions()
      )
    );
    expect(items).toContain("Open folder");
    expect(items).toContain("Open in new pane");
    expect(items).toContain("Favorites display title…");
    expect(items).toContain("Paste into folder");
    expect(items).toContain("Move folder to…");
    expect(items).not.toContain("Edit tags…");
  });

  it("hides 'Open in new pane' when split is on or there's no room", () => {
    const one = folder as unknown as ResourceItem;
    for (const split of [
      { active: true, available: true },
      { active: false, available: false },
    ]) {
      expect(
        labels(buildRowMenu(ctx({ singleItem: one, split }), actions()))
      ).not.toContain("Open in new pane");
    }
  });

  it("uses counts and bulk variants for a multi-selection", () => {
    const items = labels(
      buildRowMenu(
        ctx({
          selectedCount: 3,
          singleItem: null,
          gates: { ...allGates, rename: false, share: false },
          canBulkEditTags: true,
          bulkAudioCount: 2,
        }),
        actions()
      )
    );
    expect(items).toEqual([
      "Edit tags on 2 files…",
      "—separator",
      "Cut 3 items",
      "Copy 3 items",
      "—separator",
      "Bulk rename 3 items…",
      "Move 3 items to…",
      "Copy 3 items to…",
      "Download 3 items",
      "—separator",
      "Delete 3 items",
    ]);
  });

  it("never starts or doubles a separator for a read-only user", () => {
    const none: SelectionGates = {
      share: false,
      extract: false,
      move: false,
      copy: false,
      rename: false,
      download: false,
      delete: false,
    };
    const items = buildRowMenu(
      ctx({
        selectedCount: 2,
        singleItem: null,
        gates: none,
        perms: { rename: false, modify: false },
      }),
      actions()
    );
    expect(items).toEqual([]);
  });

  it("wires each item to its action", () => {
    const act = actions();
    const items = buildRowMenu(ctx(), act);
    const click = (label: string) =>
      items.find((i) => i.label === label)!.action!();
    click("Open");
    click("Tag…");
    click("Delete");
    click("Copy path");
    expect(act.open).toHaveBeenCalledWith("/files/a.mp3");
    expect(act.tag).toHaveBeenCalledWith("/files/a.mp3");
    expect(act.prompt).toHaveBeenCalledWith("delete");
    expect(act.copyPath).toHaveBeenCalledWith(song);
  });
});

describe("buildBackgroundMenu", () => {
  const act = () => ({
    prompt: vi.fn(),
    upload: vi.fn(),
    paste: vi.fn(),
    sortHere: vi.fn(),
    refresh: vi.fn(),
  });

  it("offers create, upload and paste when allowed", () => {
    expect(
      labels(
        buildBackgroundMenu(
          { canCreate: true, clipboardHasItems: true, t },
          act()
        )
      )
    ).toEqual([
      "New folder",
      "New file",
      "Upload",
      "Paste",
      "—separator",
      "Sort by…",
      "Refresh",
    ]);
  });

  it("is just Sort and Refresh for a read-only user", () => {
    const a = act();
    const items = buildBackgroundMenu(
      { canCreate: false, clipboardHasItems: false, t },
      a
    );
    expect(labels(items)).toEqual(["Sort by…", "Refresh"]);
    items[0].action!();
    expect(a.sortHere).toHaveBeenCalled();
  });
});
