import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const checkConflict = vi.fn();
const handleFiles = vi.fn();
vi.mock("@/utils/upload", () => ({
  checkConflict: (...a: unknown[]) => checkConflict(...a),
  handleFiles: (...a: unknown[]) => handleFiles(...a),
}));

import {
  applyConflictChoices,
  asFolder,
  useListingUpload,
} from "@/composables/listing/useListingUpload";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { usePanesStore } from "@/stores/panes";

const entry = (name: string, fullPath?: string) =>
  ({ name, fullPath, size: 1, isDir: false }) as UploadEntry;

function setup(splitActive = false) {
  setActivePinia(createPinia());
  useAuthStore().user = { perm: { create: true } } as unknown as IUser;
  const u = useListingUpload({
    routePath: () => "/files/Docs",
    splitActive: ref(splitActive),
  });
  return { u, files: useFileStore(), layout: useLayoutStore() };
}

function fileList(files: File[]): FileList {
  return Object.assign([...files], {
    item: (i: number) => files[i],
  }) as unknown as FileList;
}

beforeEach(() => {
  checkConflict.mockReset().mockResolvedValue([]);
  handleFiles.mockReset();
});

describe("upload helpers", () => {
  it("asFolder adds a trailing slash once", () => {
    expect(asFolder("/files/A")).toBe("/files/A/");
    expect(asFolder("/files/A/")).toBe("/files/A/");
  });

  it("applies conflict choices: keep both, overwrite, or skip", () => {
    const files = [entry("a"), entry("b"), entry("c")];
    applyConflictChoices(files, [
      { index: 0, checked: ["origin", "dest"] },
      { index: 1, checked: ["origin"] },
      { index: 2, checked: ["dest"] },
    ] as unknown as ConflictingResource[]);
    expect(files.map((f) => f.name)).toEqual(["a", "b"]);
    expect(files[0].overwrite).toBeUndefined();
    expect(files[1].overwrite).toBe(true);
  });
});

describe("useListingUpload", () => {
  it("uploads straight away without conflicts and preselects the new files", async () => {
    const { u, files } = setup();
    const list = [entry("a.txt"), entry("b.txt", "Album/b.txt")];
    await u.startUpload(list, "/files/Docs/", true);
    expect(handleFiles).toHaveBeenCalledWith(list, "/files/Docs/");
    expect(files.preselect).toEqual(
      expect.arrayContaining(["/Docs/a.txt", "/Docs/Album/b.txt"])
    );
  });

  it("asks about conflicts, then uploads only what the user kept", async () => {
    const { u, layout, files } = setup();
    checkConflict.mockResolvedValue([{ index: 1 }]);
    const list = [entry("a.txt"), entry("b.txt")];
    await u.startUpload(list, "/files/Docs/", false);
    expect(handleFiles).not.toHaveBeenCalled();
    expect(layout.currentPromptName).toBe("resolve-conflict");

    const prompt = layout.currentPrompt!;
    prompt.confirm!(new Event("click"), [{ index: 1, checked: [] }] as never);
    expect(layout.currentPromptName).toBeFalsy();
    expect(handleFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "a.txt" })],
      "/files/Docs/",
      true
    );
    expect(files.preselect).toEqual([]);
  });

  it("the file input keeps folder-upload relative paths", async () => {
    const { u } = setup();
    const f = new File(["x"], "b.txt");
    Object.defineProperty(f, "webkitRelativePath", { value: "Album/b.txt" });
    const input = { files: fileList([f]) };
    await u.uploadInput({ currentTarget: input } as unknown as Event);
    expect(handleFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "b.txt", fullPath: "Album/b.txt" })],
      "/files/Docs/"
    );
  });

  describe("paste to upload", () => {
    const pasteEvent = (files: File[], target: Partial<HTMLElement> = {}) =>
      ({
        target: { tagName: "DIV", ...target },
        clipboardData: { files: fileList(files) },
        preventDefault: vi.fn(),
      }) as unknown as ClipboardEvent;

    it("uploads pasted files with a timestamped name for generic screenshots", async () => {
      const { u } = setup();
      const ev = pasteEvent([new File(["x"], "image.png")]);
      await u.onPasteUpload(ev);
      expect(ev.preventDefault).toHaveBeenCalled();
      const [list, path] = handleFiles.mock.calls[0];
      expect(path).toBe("/files/Docs/");
      expect(list[0].name).toMatch(/^Pasted \d{4}-\d\d-\d\d at .*\.png$/);
    });

    it("lands in pane B when it's the active pane, without preselecting", async () => {
      const { u, files } = setup(true);
      const panes = usePanesStore();
      panes.activePane = "b";
      panes.secondaryPath = "/files/Other";
      await u.onPasteUpload(pasteEvent([new File(["x"], "notes.txt")]));
      expect(handleFiles.mock.calls[0][1]).toBe("/files/Other/");
      expect(files.preselect).toEqual([]);
    });

    it("stays out of the way: text fields, the app clipboard, no permission", async () => {
      const { u } = setup();
      await u.onPasteUpload(
        pasteEvent([new File(["x"], "a.txt")], { tagName: "INPUT" })
      );
      useClipboardStore().key = "copy";
      await u.onPasteUpload(pasteEvent([new File(["x"], "a.txt")]));
      useClipboardStore().key = "";
      useAuthStore().user = { perm: { create: false } } as unknown as IUser;
      await u.onPasteUpload(pasteEvent([new File(["x"], "a.txt")]));
      expect(handleFiles).not.toHaveBeenCalled();
    });
  });
});
