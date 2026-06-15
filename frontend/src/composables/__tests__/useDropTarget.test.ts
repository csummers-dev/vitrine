import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Mock the two side-effecting collaborators; keep the real dragdrop guards
// (isSelfOrDescendantTarget / isNoopMove) so we exercise the actual filtering.
const startTransfer = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/transfers", () => ({
  startTransfer: (...a: unknown[]) => startTransfer(...a),
}));
const checkMoveConflict = vi.fn().mockResolvedValue([]);
vi.mock("@/utils/upload", () => ({
  checkMoveConflict: (...a: unknown[]) => checkMoveConflict(...a),
}));
const toast = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
vi.mock("vue-toastification", () => ({ useToast: () => toast }));

import { useDropTarget } from "@/composables/useDropTarget";
import { useLayoutStore } from "@/stores/layout";

beforeEach(() => {
  setActivePinia(createPinia());
  startTransfer.mockClear();
  checkMoveConflict.mockClear();
  checkMoveConflict.mockResolvedValue([]);
  toast.warning.mockClear();
});

function item(url: string, name: string, isDir = false): ResourceItem {
  return {
    url,
    name,
    isDir,
    size: 1,
    modified: "t",
  } as unknown as ResourceItem;
}

describe("useDropTarget.transferSelectionInto", () => {
  it("builds destination paths and starts a MOVE through the conflict check", async () => {
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto(
      [item("/files/A/report.txt", "report.txt")],
      "/files/B/",
      false
    );
    expect(checkMoveConflict).toHaveBeenCalledTimes(1);
    const [items, target] = checkMoveConflict.mock.calls[0];
    expect(target).toBe("/files/B/");
    expect(items[0]).toMatchObject({
      from: "/files/A/report.txt",
      to: "/files/B/report.txt",
      overwrite: false,
      rename: false,
    });
    expect(startTransfer).toHaveBeenCalledTimes(1);
    expect(startTransfer.mock.calls[0][0]).toBe("move");
  });

  it("encodes names and honours the copy flag", async () => {
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto(
      [item("/files/A/My File.txt", "My File.txt")],
      "/files/B/",
      true
    );
    expect(startTransfer.mock.calls[0][0]).toBe("copy");
    expect(startTransfer.mock.calls[0][1][0].to).toBe("/files/B/My%20File.txt");
  });

  it("refuses (and warns) when dropping a folder into itself", async () => {
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto(
      [item("/files/A/sub/", "sub", true)],
      "/files/A/sub/",
      false
    );
    expect(startTransfer).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("silently no-ops a same-folder move (no transfer, no warning)", async () => {
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto(
      [item("/files/A/x.txt", "x.txt")],
      "/files/A/",
      false
    );
    expect(startTransfer).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("defers to the resolve-conflict prompt instead of transferring on a clash", async () => {
    checkMoveConflict.mockResolvedValue([
      { name: "report.txt", index: 0 } as unknown,
    ]);
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto(
      [item("/files/A/report.txt", "report.txt")],
      "/files/B/",
      false
    );
    // The transfer waits on the user's conflict decision.
    expect(startTransfer).not.toHaveBeenCalled();
    expect(useLayoutStore().currentPrompt?.prompt).toBe("resolve-conflict");
  });

  it("no-ops on an empty selection", async () => {
    const { transferSelectionInto } = useDropTarget();
    await transferSelectionInto([], "/files/B/", false);
    expect(checkMoveConflict).not.toHaveBeenCalled();
    expect(startTransfer).not.toHaveBeenCalled();
  });
});
