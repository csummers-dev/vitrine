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

  it("infers the media type from the extension when no type is given", () => {
    // Name-only callers (Trash, search hits, recents) have no server `type`;
    // these media extensions live in the type table, not the ext table.
    expect(fileIcon({ name: "IHYPH.jpg" })).toBe("image");
    expect(fileIcon({ name: "photo.PNG" })).toBe("image");
    expect(fileIcon({ name: "07 TV OFF.m4a" })).toBe("music");
    expect(fileIcon({ name: "song.mp3" })).toBe("music");
    expect(fileIcon({ name: "clip.mp4" })).toBe("video");
    expect(fileIcon({ name: "movie.mkv" })).toBe("video");
    expect(fileIcon({ name: "doc.pdf" })).toBe("file-text");
  });

  it("keeps ext-table entries winning over inferred media types", () => {
    // .ts is TypeScript in the ext table, NOT an MPEG transport stream.
    expect(fileIcon({ name: "main.ts" })).toBe("code");
  });
});

describe("fileIconColor", () => {
  it("returns the folder color for directories", () => {
    expect(fileIconColor({ isDir: true })).toBe(
      "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
    );
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
      expect(fileIconColor({ name }), name).toBe(
        "bg-orange-500/15 text-orange-700 dark:text-orange-300"
      );
    }
  });

  it("uses the type color when the extension is unknown", () => {
    expect(fileIconColor({ name: "x.unknownext", type: "image" })).toBe(
      "bg-pink-500/15 text-pink-700 dark:text-pink-300"
    );
  });

  it("colors media files by their inferred type when no type is given", () => {
    expect(fileIconColor({ name: "IHYPH.jpg" })).toBe(
      "bg-pink-500/15 text-pink-700 dark:text-pink-300"
    );
    expect(fileIconColor({ name: "07 TV OFF.m4a" })).toBe(
      "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
    );
    expect(fileIconColor({ name: "clip.mp4" })).toBe(
      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
    );
    expect(fileIconColor({ name: "doc.pdf" })).toBe(
      "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    );
  });

  it("falls back to the default color when nothing matches", () => {
    expect(fileIconColor({})).toBe(
      "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
    );
    expect(fileIconColor({ name: "mystery.qqq" })).toBe(
      "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
    );
  });
});
