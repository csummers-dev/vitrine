import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick, ref } from "vue";

const update = vi.fn();
vi.mock("@/api", () => ({
  users: { update: (...a: unknown[]) => update(...a) },
}));
vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/components/ContextMenu.vue", () => ({ default: {} }));

import { resetPrefsHarness } from "../../__tests__/_prefsHarness";
import {
  useListingViewMode,
  rememberFolderView,
  folderViewKey,
  VIEW_BY_FOLDER_PREF,
} from "@/composables/listing/useListingViewMode";
import { usePreferences } from "@/composables/usePreferences";
import { useAuthStore } from "@/stores/auth";

beforeEach(() => {
  resetPrefsHarness();
  update.mockReset().mockResolvedValue(undefined);
});

function setup(folder = "/Movies/") {
  const path = ref(folder);
  const v = useListingViewMode({
    split: { available: ref(false), active: ref(false), toggle: vi.fn() },
    onLayoutChange: vi.fn(),
    onViewModeRendered: vi.fn(),
    folder: () => path.value,
  });
  return { v, path };
}

describe("view remembered per folder (Decision 3)", () => {
  it("remembers a switch for that folder only, not the account", async () => {
    const { v, path } = setup();
    await v.setView("mosaic");
    expect(usePreferences().get(VIEW_BY_FOLDER_PREF, {})).toEqual({
      "/Movies": "mosaic",
    });
    expect(update).not.toHaveBeenCalled();
    expect(useAuthStore().user?.viewMode).toBe("list");

    path.value = "/Music/";
    await nextTick();
    expect(v.viewMode.value).toBe("list");
    path.value = "/Movies/";
    await nextTick();
    expect(v.viewMode.value).toBe("mosaic");
  });

  it("uses the account default for folders never switched", async () => {
    const { v } = setup("/Other/");
    useAuthStore().updateUser({ viewMode: "mosaic gallery" });
    await nextTick();
    expect(v.viewMode.value).toBe("mosaic gallery");
  });

  it("ignores a bad stored value", async () => {
    await usePreferences().set(VIEW_BY_FOLDER_PREF, { "/Movies": "nonsense" });
    const { v } = setup();
    expect(v.viewMode.value).toBe("list");
  });

  it("caps the remembered folders, dropping the least recently set", () => {
    let m: Record<string, string> = {};
    m = rememberFolderView(m, "/a", "list", 3);
    m = rememberFolderView(m, "/b", "list", 3);
    m = rememberFolderView(m, "/c", "list", 3);
    m = rememberFolderView(m, "/a", "mosaic", 3); // refreshes /a
    m = rememberFolderView(m, "/d", "list", 3);
    expect(Object.keys(m)).toEqual(["/c", "/a", "/d"]);
    expect(m["/a"]).toBe("mosaic");
  });

  it("treats encoded and trailing-slash paths as the same folder", async () => {
    const { v, path } = setup("/files/My%20docs/");
    await v.setView("mosaic gallery");
    path.value = "/files/Other/";
    await nextTick();
    path.value = "/files/My docs";
    await nextTick();
    expect(v.viewMode.value).toBe("mosaic gallery");
  });

  it("normalises folder keys", () => {
    expect(folderViewKey("/files/A%20B/")).toBe("/files/A B");
    expect(folderViewKey("/files/")).toBe("/files");
    expect(folderViewKey("/")).toBe("/");
    expect(folderViewKey("/files/100%/")).toBe("/files/100%");
  });
});
