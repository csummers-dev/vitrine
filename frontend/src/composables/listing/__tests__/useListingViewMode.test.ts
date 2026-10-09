import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";

const update = vi.fn();
vi.mock("@/api", () => ({
  users: { update: (...a: unknown[]) => update(...a) },
}));
vi.mock("@/components/ContextMenu.vue", () => ({ default: {} }));

import { useListingViewMode } from "@/composables/listing/useListingViewMode";
import { useAuthStore } from "@/stores/auth";

function setup(splitAvailable = true) {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: 3, viewMode: "list" } as unknown as IUser;
  const deps = {
    split: {
      available: ref(splitAvailable),
      active: ref(false),
      toggle: vi.fn(),
    },
    onLayoutChange: vi.fn(),
    onViewModeRendered: vi.fn(),
  };
  return { v: useListingViewMode(deps), deps, auth };
}

beforeEach(() => update.mockReset().mockResolvedValue(undefined));

describe("useListingViewMode", () => {
  it("switches layout immediately, re-lays out, and saves it to the account", async () => {
    const { v, deps, auth } = setup();
    expect(v.viewModeLabel.value).toBe("List");
    await v.setView("mosaic");
    expect(v.viewMode.value).toBe("mosaic");
    expect(v.viewModeLabel.value).toBe("Grid");
    expect(deps.onLayoutChange).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(update).toHaveBeenCalledWith({ id: 3, viewMode: "mosaic" }, [
      "viewMode",
    ]);
    expect(auth.user?.viewMode).toBe("mosaic");
    await nextTick();
    expect(deps.onViewModeRendered).toHaveBeenCalled();
  });

  it("keeps the switch even if saving fails, and ignores a no-op switch", async () => {
    const { v, deps } = setup();
    update.mockRejectedValueOnce(new Error("offline"));
    await v.setView("mosaic gallery");
    expect(v.viewMode.value).toBe("mosaic gallery");
    await v.setView("mosaic gallery");
    expect(deps.onLayoutChange).toHaveBeenCalledTimes(1);
  });

  it("follows the account default when it changes elsewhere", async () => {
    const { v, auth } = setup();
    auth.updateUser({ viewMode: "mosaic" });
    await nextTick();
    expect(v.viewMode.value).toBe("mosaic");
  });

  it("offers split view only when there's room for it", () => {
    const wide = setup(true);
    const split = wide.v.viewMenuItems.value.find(
      (i) => i.label === "Split view"
    );
    expect(split).toBeTruthy();
    split!.action!();
    expect(wide.deps.split.toggle).toHaveBeenCalled();

    const narrow = setup(false);
    expect(
      narrow.v.viewMenuItems.value.some((i) => i.label === "Split view")
    ).toBe(false);
  });
});
