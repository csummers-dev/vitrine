import { describe, it, expect } from "vitest";
import { fileIcon, fileIconColor } from "@/utils/fileIcon";

describe("fileIcon", () => {
  it("returns the folder glyph for directories (ignores name/type)", () => {
    expect(fileIcon({ isDir: true })).toBe("folder");
    expect(fileIcon({ isDir: true, name: "x.zip", type: "image" })).toBe(
      "folder"
    );
  });

  it("maps known extensions, case-insensitively", () => {
    expect(fileIcon({ name: "data.csv" })).toBe("sheet");
    expect(fileIcon({ name: "notes.md" })).toBe("file-pen-line");
    expect(fileIcon({ name: "main.go" })).toBe("code");
    expect(fileIcon({ name: "ARCHIVE.ZIP" })).toBe("file-archive");
  });

  it("maps every supported archive extension to file-archive", () => {
    for (const name of [
      "a.zip",
      "a.7z",
      "a.rar",
      "a.tar",
      "a.tgz",
      "a.gz",
      "a.bz2",
      "a.xz",
      "a.zst",
      "a.cab",
    ]) {
      expect(fileIcon({ name }), name).toBe("file-archive");
    }
  });

  it("prefers the extension over the type", () => {
    // .go is a code ext; type says image — extension wins.
    expect(fileIcon({ name: "main.go", type: "image" })).toBe("code");
  });

  it("falls back to the type when the extension is unknown", () => {
    expect(fileIcon({ name: "clip.unknownext", type: "video" })).toBe("video");
    expect(fileIcon({ name: "noextension", type: "text" })).toBe("file-text");
    expect(fileIcon({ type: "invalid_link" })).toBe("unlink");
  });

  it("falls back to the generic file glyph when nothing matches", () => {
    expect(fileIcon({})).toBe("file");
    expect(fileIcon({ name: "mystery.qqq" })).toBe("file");
    expect(fileIcon({ type: "somethingelse" })).toBe("file");
  });
});

describe("fileIconColor", () => {
  it("returns the folder color for directories", () => {
    expect(fileIconColor({ isDir: true })).toBe("bg-amber-500 text-white");
  });

  it("colors archives orange (locks the archive palette)", () => {
    // backup.tar.gz resolves on the trailing .gz, which is also an archive ext.
    for (const name of [
      "a.zip",
      "a.7z",
      "a.rar",
      "a.tar",
      "a.tgz",
      "backup.tar.gz",
    ]) {
      expect(fileIconColor({ name }), name).toBe("bg-orange-600 text-white");
    }
  });

  it("uses the type color when the extension is unknown", () => {
    expect(fileIconColor({ name: "x.unknownext", type: "image" })).toBe(
      "bg-pink-600 text-white"
    );
  });

  it("falls back to the default color when nothing matches", () => {
    expect(fileIconColor({})).toBe("bg-zinc-500 text-white");
    expect(fileIconColor({ name: "mystery.qqq" })).toBe(
      "bg-zinc-500 text-white"
    );
  });
});
