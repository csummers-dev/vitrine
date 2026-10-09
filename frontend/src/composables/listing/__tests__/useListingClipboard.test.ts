import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const startTransfer = vi.fn();
vi.mock("@/utils/transfers", () => ({
  startTransfer: (...a: unknown[]) => startTransfer(...a),
}));
const checkMoveConflict = vi.fn();
vi.mock("@/utils/upload", () => ({
  checkMoveConflict: (...a: unknown[]) => checkMoveConflict(...a),
}));

import { useListingClipboard } from "@/composables/listing/useListingClipboard";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(perm = { rename: true, create: true }) {
  setActivePinia(createPinia());
  useAuthStore().user = { perm } as unknown as IUser;
  const files = useFileStore();
  files.req = {
    isDir: true,
    items: [
      { url: "/files/A/a.txt", name: "a.txt", size: 1, modified: "m" },
      { url: "/files/A/Sub/", name: "Sub", size: 0, modified: "m" },
    ],
  } as unknown as Resource;
  let route = "/files/A/";
  const deps = {
    routePath: () => route,
    showError: vi.fn(),
    showSuccess: vi.fn(),
  };
  const c = useListingClipboard(deps);
  return {
    c,
    deps,
    files,
    clip: useClipboardStore(),
    goTo: (p: string) => (route = p),
  };
}

beforeEach(() => {
  startTransfer.mockReset().mockResolvedValue({ id: "j1" });
  checkMoveConflict.mockReset().mockResolvedValue([]);
});

describe("useListingClipboard", () => {
  it("captures the selection, gated by permission", () => {
    const { c, files, clip } = setup({ rename: false, create: true });
    files.selected = [0];
    const ev = new KeyboardEvent("keydown");
    const prevent = vi.spyOn(ev, "preventDefault");
    c.clipboardCapture("cut", ev);
    expect(clip.key).toBe("");
    expect(prevent).not.toHaveBeenCalled(); // native text copy still works

    c.clipboardCapture("copy", ev);
    expect(clip.key).toBe("copy");
    expect(clip.path).toBe("/files/A/");
    expect(clip.items).toEqual([
      { from: "/files/A/a.txt", name: "a.txt", size: 1, modified: "m" },
    ]);
    expect(prevent).toHaveBeenCalled();
  });

  it("does nothing with an empty selection", () => {
    const { c, clip } = setup();
    c.clipboardCapture("copy");
    expect(clip.key).toBe("");
  });

  it("cut pasted back into its own folder just disarms the clipboard", async () => {
    const { c, files, clip } = setup();
    files.selected = [0];
    c.clipboardCapture("cut");
    await c.paste();
    expect(startTransfer).not.toHaveBeenCalled();
    expect(clip.key).toBe("");
  });

  it("copy pasted into its own folder duplicates without asking", async () => {
    const { c, files } = setup();
    files.selected = [0];
    c.clipboardCapture("copy");
    await c.paste();
    expect(checkMoveConflict).not.toHaveBeenCalled();
    expect(startTransfer).toHaveBeenCalledWith("copy", [
      expect.objectContaining({
        from: "/files/A/a.txt",
        to: "/files/A/a.txt",
        rename: true,
      }),
    ]);
  });

  it("cut+paste elsewhere moves (folder trailing slash trimmed) and clears the clipboard", async () => {
    const { c, files, clip, goTo } = setup();
    files.selected = [1];
    c.clipboardCapture("cut");
    goTo("/files/B");
    await c.paste();
    await flush();
    expect(startTransfer).toHaveBeenCalledWith("move", [
      expect.objectContaining({ from: "/files/A/Sub", to: "/files/B/Sub" }),
    ]);
    expect(clip.key).toBe("");
  });

  it("copy+paste keeps the clipboard for another paste", async () => {
    const { c, files, clip, goTo } = setup();
    files.selected = [0];
    c.clipboardCapture("copy");
    goTo("/files/B/");
    await c.paste();
    await flush();
    expect(clip.key).toBe("copy");
  });

  it("pastes into a given folder rather than the current one", async () => {
    const { c, files } = setup();
    files.selected = [0];
    c.clipboardCapture("copy");
    await c.paste("/files/A/Sub/");
    expect(startTransfer.mock.calls[0][1][0].to).toBe("/files/A/Sub/a.txt");
  });

  it("asks about conflicts and reports when everything was skipped", async () => {
    const { c, files, deps, goTo } = setup();
    files.selected = [0];
    c.clipboardCapture("copy");
    goTo("/files/B/");
    checkMoveConflict.mockResolvedValue([{ index: 0 }]);
    await c.paste();
    const layout = useLayoutStore();
    expect(layout.currentPromptName).toBe("resolve-conflict");
    layout.currentPrompt!.confirm(new Event("click"), [
      { index: 0, checked: ["dest"] },
    ]);
    expect(startTransfer).not.toHaveBeenCalled();
    expect(deps.showSuccess).toHaveBeenCalledWith(
      "All conflicting items were skipped — nothing was copied."
    );
  });

  it("applies overwrite and keep-both choices", async () => {
    const { c, files, goTo } = setup();
    files.selected = [0, 1];
    c.clipboardCapture("copy");
    goTo("/files/B/");
    checkMoveConflict.mockResolvedValue([{ index: 0 }, { index: 1 }]);
    await c.paste();
    useLayoutStore().currentPrompt!.confirm(new Event("click"), [
      { index: 0, checked: ["origin"] },
      { index: 1, checked: ["origin", "dest"] },
    ]);
    const sent = startTransfer.mock.calls[0][1];
    expect(sent[0]).toMatchObject({ name: "a.txt", overwrite: true });
    expect(sent[1]).toMatchObject({ name: "Sub", rename: true });
  });
});
