import { describe, it, expect } from "vitest";
import { typeFilterCategory } from "@/utils/typeFilter";

describe("typeFilterCategory", () => {
  it("never buckets folders (they are exempt from filtering)", () => {
    expect(typeFilterCategory({ isDir: true, type: "dir" })).toBeNull();
  });

  it("buckets by server-detected type", () => {
    expect(typeFilterCategory({ type: "image", extension: ".png" })).toBe(
      "images"
    );
    expect(typeFilterCategory({ type: "video", extension: ".mkv" })).toBe(
      "videos"
    );
    expect(typeFilterCategory({ type: "audio", extension: ".flac" })).toBe(
      "audio"
    );
    expect(typeFilterCategory({ type: "pdf", extension: ".pdf" })).toBe(
      "documents"
    );
    expect(typeFilterCategory({ type: "text", extension: ".txt" })).toBe(
      "documents"
    );
    expect(
      typeFilterCategory({ type: "textImmutable", extension: ".log" })
    ).toBe("documents");
  });

  it("extension beats type for comics and archives (server says blob)", () => {
    expect(typeFilterCategory({ type: "blob", extension: ".cbz" })).toBe(
      "comics"
    );
    expect(typeFilterCategory({ type: "blob", extension: ".CBR" })).toBe(
      "comics"
    );
    expect(typeFilterCategory({ type: "blob", extension: ".zip" })).toBe(
      "archives"
    );
    expect(typeFilterCategory({ type: "blob", extension: ".7z" })).toBe(
      "archives"
    );
  });

  it("office/book blobs read as documents", () => {
    expect(typeFilterCategory({ type: "blob", extension: ".docx" })).toBe(
      "documents"
    );
    expect(typeFilterCategory({ type: "blob", extension: ".epub" })).toBe(
      "documents"
    );
  });

  it("everything else is other", () => {
    expect(typeFilterCategory({ type: "blob", extension: ".bin" })).toBe(
      "other"
    );
    expect(typeFilterCategory({ type: "blob", extension: "" })).toBe("other");
  });
});
