import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, reactive } from "vue";

const update = vi.fn();
vi.mock("@/api", () => ({
  users: { update: (...a: unknown[]) => update(...a) },
}));
vi.mock("@/components/ContextMenu.vue", () => ({ default: {} }));

import { useListingSort } from "@/composables/listing/useListingSort";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(sorting = { by: "name", asc: true }) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: 7 } as unknown as IUser;
  const files = useFileStore();
  files.req = {
    isDir: true,
    sorting: { ...sorting },
    items: [
      { isDir: true, url: "/files/A/", modified: "m1" },
      { isDir: false, url: "/files/b.txt", modified: "m2" },
    ],
  } as unknown as Resource;
  const store: Record<string, unknown> = reactive({});
  const prefs = {
    get: <T>(k: string, d: T) => (k in store ? (store[k] as T) : d),
    set: vi.fn((k: string, v: unknown) => {
      store[k] = v;
    }),
  };
  const folderSizes = { ensureMany: vi.fn() };
  const showError = vi.fn();
  const s = useListingSort({
    t: (k) => (k === "files.name" ? "Name" : k === "files.size" ? "Size" : k),
    prefs,
    folderSizes,
    showError,
  });
  return { s, files, prefs, folderSizes, showError };
}

beforeEach(() => update.mockReset().mockResolvedValue(undefined));

describe("useListingSort", () => {
  it("re-clicking the active column flips its direction", async () => {
    const { s, files } = setup({ by: "name", asc: true });
    expect(s.nameSorted.value).toBe(true);
    s.sort("name");
    await flush();
    expect(files.req!.sorting).toEqual({ by: "name", asc: false });
    expect(update).toHaveBeenCalledWith(
      { id: 7, sorting: { by: "name", asc: false } },
      ["sorting"]
    );
    s.sort("name");
    await flush();
    expect(files.req!.sorting).toEqual({ by: "name", asc: true });
  });

  it("a newly picked column starts ascending (name starts descending)", async () => {
    const { s, files } = setup({ by: "size", asc: true });
    s.sort("name");
    await flush();
    expect(files.req!.sorting).toEqual({ by: "name", asc: false });
    s.sort("size");
    await flush();
    expect(files.req!.sorting).toEqual({ by: "size", asc: true });
    s.sort("extension");
    await flush();
    expect(files.req!.sorting).toEqual({ by: "extension", asc: true });
    expect(s.sortLabel.value).toBe("Type");
  });

  it("rolls back the optimistic sort when saving fails", async () => {
    const { s, files, showError } = setup({ by: "name", asc: true });
    update.mockRejectedValueOnce(new Error("500"));
    await s.sortRaw("modified", false);
    expect(files.req!.sorting).toEqual({ by: "name", asc: true });
    expect(showError).toHaveBeenCalled();
  });

  it("re-asserts the new sort if a stale reload lands mid-save", async () => {
    const { s, files } = setup({ by: "name", asc: true });
    update.mockImplementationOnce(async () => {
      // A background refresh swaps the server's pre-update sorting back in.
      files.req!.sorting = { by: "name", asc: true };
    });
    await s.sortRaw("size", false);
    expect(files.req!.sorting).toEqual({ by: "size", asc: false });
  });

  it("the popover sets direction, disables the primary as secondary, and toggles secondary", () => {
    const { s, prefs } = setup({ by: "name", asc: true });
    const items = s.sortMenuItems.value;
    const thenBy = items.slice(items.findIndex((i) => i.label === "Then by"));
    expect(thenBy.find((i) => i.label === "Name")?.disabled).toBe(true);

    thenBy.find((i) => i.label === "Size")!.action!();
    expect(prefs.set).toHaveBeenLastCalledWith("sort.secondary", {
      by: "size",
      asc: true,
    });
    expect(s.secondarySort.value).toEqual({ by: "size", asc: true });

    const again = s.sortMenuItems.value;
    const sizeAgain = again
      .slice(again.findIndex((i) => i.label === "Then by"))
      .find((i) => i.label === "Size")!;
    expect(sizeAgain.icon).toBe("arrow-up");
    sizeAgain.action!();
    expect(s.secondarySort.value).toEqual({ by: "size", asc: false });

    items.find((i) => i.label === "None")!.action!();
    expect(s.secondarySort.value).toBeNull();
  });

  it("prefetches every folder's size only while sorting by size", async () => {
    const { s, folderSizes } = setup({ by: "name", asc: true });
    expect(folderSizes.ensureMany).not.toHaveBeenCalled();
    await s.sortRaw("size", true);
    await nextTick();
    expect(folderSizes.ensureMany).toHaveBeenCalledWith([
      { path: "/files/A/", mod: "m1" },
    ]);
  });
});
