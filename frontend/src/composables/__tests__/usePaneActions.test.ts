import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the file API verbs the actions drive; keep @/utils/url real so the
// rename path math is exercised for real.
const post = vi.fn().mockResolvedValue(undefined);
const move = vi.fn().mockResolvedValue(undefined);
const remove = vi.fn().mockResolvedValue(undefined);
vi.mock("@/api", () => ({
  files: {
    post: (...a: unknown[]) => post(...a),
    move: (...a: unknown[]) => move(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("vue-toastification", () => ({ useToast: () => toast }));

import { usePaneActions, type PaneTarget } from "@/composables/usePaneActions";

const flush = () => new Promise((r) => setTimeout(r, 0));
const item = (url: string, name: string, isDir = false): ResourceItem =>
  ({ url, name, isDir }) as unknown as ResourceItem;

function makeTarget(over: Partial<PaneTarget> = {}): PaneTarget {
  return {
    paneId: "b",
    folderUrl: () => "/files/B/",
    selectedItems: () => [],
    reload: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  post.mockClear();
  move.mockClear();
  remove.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("usePaneActions", () => {
  it("newFolder posts a trailing-slash path into the target folder + reloads", async () => {
    const reload = vi.fn();
    const a = usePaneActions(makeTarget({ reload }));
    a.newFolder();
    expect(a.namePrompt.open).toBe(true);
    expect(a.namePrompt.title).toBe("New folder");
    a.confirmNamePrompt("Reports");
    await flush();
    expect(post).toHaveBeenCalledWith("/files/B/Reports/");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(a.namePrompt.open).toBe(false);
  });

  it("newFile posts a file path (no trailing slash) + encodes the name", async () => {
    const a = usePaneActions(makeTarget());
    a.newFile();
    a.confirmNamePrompt("my notes.txt");
    await flush();
    expect(post).toHaveBeenCalledWith("/files/B/my%20notes.txt");
  });

  it("rename moves from the item's url to the new name in its parent", async () => {
    const it = item("/files/B/old.txt", "old.txt");
    const reload = vi.fn();
    const a = usePaneActions(makeTarget({ reload, selectedItems: () => [it] }));
    a.rename(it);
    expect(a.namePrompt.initialValue).toBe("old.txt");
    a.confirmNamePrompt("new.txt");
    await flush();
    expect(move).toHaveBeenCalledWith([
      { from: "/files/B/old.txt", to: "/files/B/new.txt" },
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rename is a no-op when the name is unchanged", async () => {
    const it = item("/files/B/same.txt", "same.txt");
    const a = usePaneActions(makeTarget({ selectedItems: () => [it] }));
    a.rename(it);
    a.confirmNamePrompt("same.txt");
    await flush();
    expect(move).not.toHaveBeenCalled();
  });

  it("delete confirms, then trashes every selected item + reloads", async () => {
    const sel = [item("/files/B/a", "a"), item("/files/B/b", "b")];
    const reload = vi.fn();
    const a = usePaneActions(makeTarget({ reload, selectedItems: () => sel }));
    a.remove();
    expect(a.confirm.open).toBe(true);
    expect(a.confirm.title).toBe("Move to Trash?");
    a.confirmConfirm();
    await flush();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("/files/B/a", false);
    expect(remove).toHaveBeenCalledWith("/files/B/b", false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("permanent delete passes the permanent flag", async () => {
    const sel = [item("/files/B/a", "a")];
    const a = usePaneActions(makeTarget({ selectedItems: () => sel }));
    a.remove(undefined, true);
    expect(a.confirm.confirmLabel).toBe("Delete forever");
    a.confirmConfirm();
    await flush();
    expect(remove).toHaveBeenCalledWith("/files/B/a", true);
  });

  it("cancelling a prompt runs no API call", async () => {
    const a = usePaneActions(makeTarget());
    a.newFolder();
    a.cancelNamePrompt();
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(a.namePrompt.open).toBe(false);
  });

  it("surfaces a toast and doesn't reload when the API throws", async () => {
    post.mockRejectedValueOnce(new Error("exists"));
    const reload = vi.fn();
    const a = usePaneActions(makeTarget({ reload }));
    a.newFolder();
    a.confirmNamePrompt("dup");
    await flush();
    expect(toast.error).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
