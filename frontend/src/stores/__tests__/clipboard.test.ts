import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useClipboardStore } from "@/stores/clipboard";

beforeEach(() => setActivePinia(createPinia()));

const clip = (url: string): ClipItem =>
  ({
    from: url,
    name: url.split("/").pop(),
    size: 1,
    modified: "",
  }) as unknown as ClipItem;

describe("clipboard store (Cut/Copy/Paste)", () => {
  it("starts empty/unarmed", () => {
    const c = useClipboardStore();
    expect(c.key).toBe("");
    expect(c.items).toEqual([]);
    expect(c.path).toBeUndefined();
  });

  it("holds a cut/copy set plus the source folder path", () => {
    const c = useClipboardStore();
    c.key = "cut";
    c.items = [clip("/files/Src/a"), clip("/files/Src/b")];
    c.path = "/files/Src/";
    expect(c.key).toBe("cut");
    expect(c.items).toHaveLength(2);
    expect(c.path).toBe("/files/Src/");
  });

  it("resetClipboard disarms everything (Esc-clear-cut behavior)", () => {
    const c = useClipboardStore();
    c.key = "copy";
    c.items = [clip("/files/Src/a")];
    c.path = "/files/Src/";
    c.resetClipboard();
    expect(c.key).toBe("");
    expect(c.items).toEqual([]);
    expect(c.path).toBeUndefined();
  });
});
