import { describe, it, expect } from "vitest";
import { outputFormatFor, defaultEditedName } from "@/utils/imageEdit";

describe("outputFormatFor", () => {
  it("keeps JPEG at quality 0.9 (case-insensitive extension)", () => {
    expect(outputFormatFor("photo.jpg")).toEqual({
      mime: "image/jpeg",
      quality: 0.9,
      ext: "jpg",
    });
    expect(outputFormatFor("photo.JPEG").mime).toBe("image/jpeg");
  });

  it("keeps WebP (0.9) and PNG (lossless)", () => {
    expect(outputFormatFor("a.webp")).toEqual({
      mime: "image/webp",
      quality: 0.9,
      ext: "webp",
    });
    expect(outputFormatFor("a.png")).toEqual({
      mime: "image/png",
      quality: undefined,
      ext: "png",
    });
  });

  it("falls back to PNG for formats the canvas can't re-encode (gif/bmp/tiff/unknown/none)", () => {
    for (const n of ["x.gif", "x.bmp", "x.tiff", "x.heic", "noextension"]) {
      expect(outputFormatFor(n)).toEqual({
        mime: "image/png",
        quality: undefined,
        ext: "png",
      });
    }
  });
});

describe("defaultEditedName", () => {
  it("inserts -edited before the output extension", () => {
    expect(defaultEditedName("photo.jpg", "jpg", new Set())).toBe(
      "photo-edited.jpg"
    );
  });

  it("uses the OUTPUT extension when the format changed (gif → png)", () => {
    expect(defaultEditedName("anim.gif", "png", new Set())).toBe(
      "anim-edited.png"
    );
  });

  it("auto-increments past existing collisions", () => {
    const existing = new Set(["photo-edited.jpg", "photo-edited-2.jpg"]);
    expect(defaultEditedName("photo.jpg", "jpg", existing)).toBe(
      "photo-edited-3.jpg"
    );
  });

  it("handles dotless names", () => {
    expect(defaultEditedName("README", "png", new Set())).toBe(
      "README-edited.png"
    );
  });
});
