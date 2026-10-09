import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";

vi.mock("@/utils/constants", () => ({ unzipEnabled: true }));

import { useListingPanels } from "@/composables/listing/useListingPanels";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

const names = ["photos.zip", "notes.txt", "music.7z"];

function setup(selected: number[] = []) {
  const files = useFileStore();
  files.isFiles = true;
  files.req = {
    isDir: true,
    items: names.map((name, index) => ({ name, index })),
  } as unknown as Resource;
  files.selected = selected;
  const layout = useLayoutStore();
  const bulkRename = { isOpen: ref(false), close: vi.fn() };
  bulkRename.close.mockImplementation(() => (bulkRename.isOpen.value = false));
  const p = useListingPanels({ bulkRename });
  return { p, layout, bulkRename, files };
}

beforeEach(() => setActivePinia(createPinia()));

describe("useListingPanels", () => {
  it("opens Move or Copy for a listing selection and dismisses the prompt", async () => {
    const { p, layout } = setup([1]);
    layout.showHover("copy");
    await nextTick();
    expect(p.moveCopyOpen.value).toBe(true);
    expect(p.moveCopyMode.value).toBe("copy");
    expect(layout.currentPromptName).toBeFalsy();
    expect(p.anyPanelOpen.value).toBe(true);

    p.closeMoveCopy();
    expect(p.moveCopyOpen.value).toBe(false);
  });

  it("ignores Move with nothing selected, unless pane B passes an override", async () => {
    const { p, layout } = setup([]);
    layout.showHover("move");
    await nextTick();
    expect(p.moveCopyOpen.value).toBe(false);
    layout.closeHovers();
    await nextTick();

    const override = { items: [], sourceUrl: "/files/B/" };
    layout.showHover({ prompt: "move", props: { override } } as never);
    await nextTick();
    expect(p.moveCopyOpen.value).toBe(true);
    expect(p.moveCopyOverride.value).toEqual(override);
    p.closeMoveCopy();
    expect(p.moveCopyOverride.value).toBeNull();
  });

  it("opens Share only for exactly one selected item in a listing", async () => {
    const { p, layout, files } = setup([0, 1]);
    layout.showHover("share");
    await nextTick();
    expect(p.shareOpen.value).toBe(false);
    layout.closeHovers();
    await nextTick();

    files.selected = [1];
    layout.showHover("share");
    await nextTick();
    expect(p.shareOpen.value).toBe(true);
  });

  it("opens Extract only when every selected item is an archive", async () => {
    const { p, layout, files } = setup([0, 1]);
    layout.showHover("extract");
    await nextTick();
    expect(p.extractOpen.value).toBe(false);
    layout.closeHovers();
    await nextTick();

    files.selected = [0, 2];
    layout.showHover("extract");
    await nextTick();
    expect(p.extractOpen.value).toBe(true);
  });

  it("keeps one panel open at a time, including Bulk Rename", async () => {
    const { p, layout, bulkRename } = setup([0]);
    bulkRename.isOpen.value = true;
    layout.showHover("share");
    await nextTick();
    expect(p.shareOpen.value).toBe(true);
    expect(bulkRename.close).toHaveBeenCalled();
    expect(bulkRename.isOpen.value).toBe(false);

    bulkRename.isOpen.value = true;
    await nextTick();
    expect(p.shareOpen.value).toBe(false);
    expect(p.anyPanelOpen.value).toBe(true); // Bulk Rename itself
  });
});
