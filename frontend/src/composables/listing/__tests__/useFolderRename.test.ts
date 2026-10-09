import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

const move = vi.fn();
vi.mock("@/api", () => ({
  files: { move: (...a: unknown[]) => move(...a) },
}));

import { useFolderRename } from "@/composables/listing/useFolderRename";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";

function setup(opts: { canRename?: boolean; name?: string } = {}) {
  const auth = useAuthStore();
  auth.user = {
    perm: { rename: opts.canRename ?? true },
  } as unknown as IUser;
  const files = useFileStore();
  const name = opts.name ?? "Old Name";
  files.req = {
    isDir: true,
    name,
    url: name ? `/files/Media/${encodeURIComponent(name)}/` : "/files/",
    items: [],
  } as unknown as Resource;
  const deps = {
    renameFavorite: vi.fn(),
    navigate: vi.fn(),
    showError: vi.fn(),
  };
  return { r: useFolderRename(deps), deps, files };
}

beforeEach(() => {
  setActivePinia(createPinia());
  move.mockReset().mockResolvedValue(undefined);
});

describe("useFolderRename", () => {
  it("is unavailable at the storage root and without rename permission", () => {
    expect(setup({ name: "" }).r.canRename.value).toBe(false);
    setActivePinia(createPinia());
    expect(setup({ canRename: false }).r.canRename.value).toBe(false);
    setActivePinia(createPinia());
    expect(setup().r.canRename.value).toBe(true);
  });

  it("start seeds the input with the folder name and flags inline editing", async () => {
    const { r, files } = setup();
    await r.start();
    expect(r.isRenaming.value).toBe(true);
    expect(r.value.value).toBe("Old Name");
    await nextTick();
    expect(files.inlineEditing).toBe(true);
  });

  it("submit moves the folder within its parent, then follows it", async () => {
    const { r, deps } = setup();
    await r.start();
    r.value.value = "  New & Improved ";
    await r.submit();
    const to = "/files/Media/New%20%26%20Improved";
    expect(move).toHaveBeenCalledWith([
      { from: "/files/Media/Old%20Name/", to },
    ]);
    expect(deps.renameFavorite).toHaveBeenCalledWith(
      "/files/Media/Old%20Name/",
      to
    );
    expect(deps.navigate).toHaveBeenCalledWith(to);
    expect(r.isRenaming.value).toBe(false);
  });

  it("an empty or unchanged name cancels without calling the API", async () => {
    const { r } = setup();
    await r.start();
    r.value.value = "Old Name";
    await r.submit();
    expect(move).not.toHaveBeenCalled();
    expect(r.isRenaming.value).toBe(false);

    await r.start();
    r.value.value = "   ";
    await r.submit();
    expect(move).not.toHaveBeenCalled();
  });

  it("a failed move reports the error and stays open for another try", async () => {
    const { r, deps } = setup();
    move.mockRejectedValueOnce(new Error("409 Conflict"));
    await r.start();
    r.value.value = "Taken";
    await r.submit();
    expect(deps.showError).toHaveBeenCalledWith(expect.any(Error));
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(r.isRenaming.value).toBe(true);

    r.value.value = "Free";
    await r.submit();
    expect(move).toHaveBeenCalledTimes(2);
    expect(r.isRenaming.value).toBe(false);
  });

  it("blur cancels after a short delay, but not during a submit", async () => {
    vi.useFakeTimers();
    try {
      const { r } = setup();
      await r.start();
      r.onBlur();
      expect(r.isRenaming.value).toBe(true);
      vi.advanceTimersByTime(200);
      expect(r.isRenaming.value).toBe(false);

      await r.start();
      let resolveMove: () => void = () => {};
      move.mockReturnValueOnce(new Promise<void>((res) => (resolveMove = res)));
      r.value.value = "Renamed";
      const pending = r.submit();
      r.onBlur();
      vi.advanceTimersByTime(200);
      expect(r.isRenaming.value).toBe(true);
      resolveMove();
      await pending;
      expect(r.isRenaming.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
