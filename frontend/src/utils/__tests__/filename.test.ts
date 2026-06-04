import { describe, it, expect } from "vitest";
import { splitExtension, displayName } from "@/utils/filename";

describe("splitExtension", () => {
  it("splits a normal filename at the last dot", () => {
    expect(splitExtension("filename.txt")).toEqual({
      base: "filename",
      ext: ".txt",
    });
  });

  it("keeps inner dots in the base (only the last splits)", () => {
    expect(splitExtension("archive.tar.gz")).toEqual({
      base: "archive.tar",
      ext: ".gz",
    });
  });

  it("treats a leading-dot dotfile as having no extension", () => {
    expect(splitExtension(".env")).toEqual({ base: ".env", ext: "" });
    expect(splitExtension(".gitignore")).toEqual({
      base: ".gitignore",
      ext: "",
    });
  });

  it("returns no extension for extensionless names", () => {
    expect(splitExtension("Makefile")).toEqual({ base: "Makefile", ext: "" });
  });

  it("returns no extension for a trailing dot", () => {
    expect(splitExtension("weird.")).toEqual({ base: "weird.", ext: "" });
  });
});

describe("displayName", () => {
  it("shows the full name when extensions are visible", () => {
    expect(displayName("song.mp3", false, true)).toBe("song.mp3");
  });

  it("hides the extension for files when the pref is off", () => {
    expect(displayName("song.mp3", false, false)).toBe("song");
  });

  it("never strips folders", () => {
    expect(displayName("My.Folder", true, false)).toBe("My.Folder");
  });

  it("leaves dotfiles + extensionless names untouched when hidden", () => {
    expect(displayName(".env", false, false)).toBe(".env");
    expect(displayName("Makefile", false, false)).toBe("Makefile");
  });
});

// The exact rename round-trip from the WS8 spec: a `filename.txt` shown as
// `filename`; the user types `filename.jpg`; saving re-appends the original
// `.txt` → `filename.jpg.txt`.
describe("rename re-append (WS8 spec example)", () => {
  it("re-appends the original extension to the typed base", () => {
    const original = "filename.txt";
    const shown = displayName(original, false, false); // "filename"
    expect(shown).toBe("filename");
    const typed = "filename.jpg";
    const saved = typed + splitExtension(original).ext;
    expect(saved).toBe("filename.jpg.txt");
  });
});
