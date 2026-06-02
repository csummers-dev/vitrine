import { describe, it, expect } from "vitest";
import { isExtractable, archiveBaseName } from "@/utils/archive";

describe("isExtractable", () => {
  it("accepts the supported single-file formats", () => {
    for (const name of [
      "photos.zip",
      "Photos.ZIP",
      "data.7z",
      "movie.rar",
      "bundle.tar",
      "bundle.tar.gz",
      "bundle.tgz",
      "bundle.tar.bz2",
      "bundle.tar.xz",
      "bundle.tar.zst",
    ]) {
      expect(isExtractable(name), name).toBe(true);
    }
  });

  it("accepts RAR multi-volume parts (new + old style)", () => {
    expect(isExtractable("movie.part01.rar")).toBe(true);
    expect(isExtractable("movie.part12.rar")).toBe(true);
    expect(isExtractable("movie.r00")).toBe(true);
    expect(isExtractable("movie.r15")).toBe(true);
  });

  it("rejects split-zip and multi-volume 7z (unsupported)", () => {
    expect(isExtractable("foo.z01")).toBe(false);
    expect(isExtractable("foo.z99")).toBe(false);
    expect(isExtractable("foo.7z.001")).toBe(false);
    expect(isExtractable("foo.7z.002")).toBe(false);
  });

  it("rejects non-archives and lone compressed files", () => {
    for (const name of [
      "notes.txt",
      "image.png",
      "data.gz",
      "log.bz2",
      "",
      "noext",
    ]) {
      expect(isExtractable(name), name).toBe(false);
    }
  });
});

describe("archiveBaseName", () => {
  it("strips simple archive suffixes", () => {
    expect(archiveBaseName("photos.zip")).toBe("photos");
    expect(archiveBaseName("data.7z")).toBe("data");
    expect(archiveBaseName("movie.rar")).toBe("movie");
    expect(archiveBaseName("bundle.tar")).toBe("bundle");
  });

  it("strips compound tar suffixes", () => {
    expect(archiveBaseName("backup.tar.gz")).toBe("backup");
    expect(archiveBaseName("backup.tgz")).toBe("backup");
    expect(archiveBaseName("backup.tar.bz2")).toBe("backup");
    expect(archiveBaseName("backup.tar.xz")).toBe("backup");
    expect(archiveBaseName("backup.tar.zst")).toBe("backup");
  });

  it("strips RAR multi-volume markers", () => {
    expect(archiveBaseName("movie.part01.rar")).toBe("movie");
    expect(archiveBaseName("movie.part12.rar")).toBe("movie");
    expect(archiveBaseName("movie.r00")).toBe("movie");
  });

  it("leaves a name without a known suffix unchanged", () => {
    expect(archiveBaseName("noext")).toBe("noext");
    expect(archiveBaseName("notes.txt")).toBe("notes.txt");
  });
});
