import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remove = vi.fn();
const restore = vi.fn();
vi.mock("@/api", () => ({
  files: { remove: (...a: unknown[]) => remove(...a) },
  trash: { restore: (...a: unknown[]) => restore(...a) },
}));

// Capture the toast so a test can press its Undo button.
type ToastCall = {
  content: { props: { message: string; onClick: () => void } };
  opts: { timeout: number };
};
const toastCalls: ToastCall[] = [];
const toast = Object.assign(
  vi.fn((content: ToastCall["content"], opts: ToastCall["opts"]) => {
    toastCalls.push({ content, opts });
    return 42;
  }),
  { dismiss: vi.fn() }
);
vi.mock("vue-toastification", () => ({ useToast: () => toast }));
vi.mock("@/components/UndoToast.vue", () => ({ default: {} }));

import {
  useListingDelete,
  UNDO_WINDOW_MS,
} from "@/composables/listing/useListingDelete";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { nextTick } from "vue";

const flush = () => new Promise((r) => setTimeout(r, 0));

const rows = [
  { index: 0, url: "/files/A/", name: "A", path: "/A", isDir: true },
  { index: 1, url: "/files/b.txt", name: "b.txt", path: "/b.txt" },
  { index: 2, url: "/files/c.txt", name: "c.txt", path: "/c.txt" },
] as unknown as ResourceItem[];

function setup() {
  const files = useFileStore();
  files.req = { isDir: true, items: rows } as unknown as Resource;
  const showError = vi.fn();
  const d = useListingDelete({ visibleItems: () => rows, showError });
  return { d, files, showError };
}

beforeEach(() => {
  setActivePinia(createPinia());
  remove.mockReset();
  restore.mockReset().mockResolvedValue("/b.txt");
  toast.mockClear();
  toast.dismiss.mockClear();
  toastCalls.length = 0;
});

describe("useListingDelete", () => {
  it("words the confirm for a file, a folder, several items and permanent", () => {
    const { d } = setup();
    d.openDeleteConfirm([{ url: "/files/b.txt", name: "b.txt" }], false);
    expect(d.confirmOpen.value).toBe(true);
    expect(d.confirmTitle.value).toBe("Move this file to the Trash?");
    expect(d.confirmMessage.value).toContain("“b.txt” can be restored");

    d.openDeleteConfirm([{ url: "/files/A/", name: "A" }], false);
    expect(d.confirmTitle.value).toBe("Move this folder to the Trash?");

    d.openDeleteConfirm(rows, false);
    expect(d.confirmTitle.value).toBe("Move 3 items to the Trash?");

    d.openDeleteConfirm([{ url: "/files/b.txt", name: "b.txt" }], true);
    expect(d.confirmTitle.value).toBe("Permanently delete “b.txt”?");
    expect(d.pendingPermanent.value).toBe(true);
  });

  it("does nothing for an empty selection, and cancel clears pending state", () => {
    const { d } = setup();
    d.openDeleteConfirm([], false);
    expect(d.confirmOpen.value).toBe(false);

    d.openDeleteConfirm([{ url: "/files/b.txt", name: "b.txt" }], true);
    d.onDeleteCancel();
    expect(d.confirmOpen.value).toBe(false);
    expect(d.pendingPermanent.value).toBe(false);
    d.onDeleteConfirm();
    expect(remove).not.toHaveBeenCalled();
  });

  it("confirm trashes, selects the neighbor, and offers Undo that restores", async () => {
    const { d, files } = setup();
    remove.mockResolvedValue({ trashId: "t1" });
    d.openDeleteConfirm([{ url: "/files/b.txt", name: "b.txt" }], false);
    d.onDeleteConfirm();
    await flush();

    expect(remove).toHaveBeenCalledWith("/files/b.txt");
    expect(files.selected).toEqual([2]); // c.txt slid into b.txt's slot
    expect(files.preselect).toContain("/c.txt");
    expect(files.reload).toBe(true);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].content.props.message).toBe("Moved “b.txt” to Trash");
    expect(toastCalls[0].opts.timeout).toBe(UNDO_WINDOW_MS);

    files.reload = false;
    toastCalls[0].content.props.onClick();
    await flush();
    expect(toast.dismiss).toHaveBeenCalledWith(42);
    expect(restore).toHaveBeenCalledWith("t1");
    expect(files.reload).toBe(true);
  });

  it("permanent delete skips the trash and shows no Undo", async () => {
    const { d } = setup();
    remove.mockResolvedValue(null);
    d.openDeleteConfirm([{ url: "/files/c.txt", name: "c.txt" }], true);
    d.onDeleteConfirm();
    await flush();
    expect(remove).toHaveBeenCalledWith("/files/c.txt", true);
    expect(toastCalls).toHaveLength(0);
  });

  it("deleting everything clears the selection; failures report without a toast", async () => {
    const { d, files, showError } = setup();
    remove.mockRejectedValue(new Error("403 Forbidden"));
    await d.startUndoDelete(rows, false);
    expect(files.selected).toEqual([]);
    expect(showError).toHaveBeenCalledWith(expect.any(Error));
    expect(toastCalls).toHaveLength(0);
  });

  it("collects the current selection as url/name pairs", () => {
    const { d, files } = setup();
    files.selected = [0, 2];
    expect(d.collectSelectedDeleteItems()).toEqual([
      { url: "/files/A/", name: "A" },
      { url: "/files/c.txt", name: "c.txt" },
    ]);
  });
});

describe("useListingDelete prompt intercept", () => {
  it("turns a generic delete prompt into the confirm for the selection", async () => {
    const { d, files } = setup();
    files.isFiles = true;
    files.selected = [1];
    const layout = useLayoutStore();
    layout.showHover("delete");
    await nextTick();
    expect(layout.currentPromptName).toBeFalsy();
    expect(d.confirmOpen.value).toBe(true);
    expect(d.confirmTitle.value).toBe("Move this file to the Trash?");
  });

  it("leaves the prompt alone without a listing selection", async () => {
    const { d, files } = setup();
    files.isFiles = true;
    files.selected = [];
    const layout = useLayoutStore();
    layout.showHover("delete");
    await nextTick();
    expect(layout.currentPromptName).toBe("delete");
    expect(d.confirmOpen.value).toBe(false);
  });
});
