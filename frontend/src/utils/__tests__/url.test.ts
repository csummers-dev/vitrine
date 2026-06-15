import { describe, it, expect } from "vitest";
import {
  removeLastDir,
  encodePath,
  encodeRFC5987ValueChars,
  buildCreatePath,
} from "@/utils/url";

describe("removeLastDir", () => {
  it("drops the last segment of a file path", () => {
    expect(removeLastDir("/a/b/c")).toBe("/a/b");
    expect(removeLastDir("files/foo")).toBe("files");
  });

  it("ignores a trailing slash (directory paths)", () => {
    expect(removeLastDir("/a/b/c/")).toBe("/a/b");
  });

  it("collapses toward empty at the root", () => {
    expect(removeLastDir("/")).toBe("");
  });
});

describe("encodePath", () => {
  it("encodes each segment but preserves the slashes", () => {
    expect(encodePath("/Documents/foo bar")).toBe("/Documents/foo%20bar");
    expect(encodePath("a/b c/d")).toBe("a/b%20c/d");
  });

  it("encodes unicode and reserved chars within a segment", () => {
    expect(encodePath("/files/café")).toBe("/files/caf%C3%A9");
    expect(encodePath("a&b")).toBe("a%26b");
  });

  it("leaves a slash-free name with safe chars untouched", () => {
    expect(encodePath("readme.txt")).toBe("readme.txt");
  });
});

describe("encodeRFC5987ValueChars", () => {
  it("percent-encodes spaces and the RFC5987 special set", () => {
    expect(encodeRFC5987ValueChars("foo bar.txt")).toBe("foo%20bar.txt");
    // ' ( ) * must be escaped (uppercase hex), unlike plain encodeURIComponent.
    expect(encodeRFC5987ValueChars("a'b(c)*")).toBe("a%27b%28c%29%2A");
  });

  it("leaves | ` ^ readable (decoded back) for nicer wire form", () => {
    expect(encodeRFC5987ValueChars("a|b`c^d")).toBe("a|b`c^d");
  });
});

describe("buildCreatePath (inline new folder/file)", () => {
  it("appends an encoded name to a trailing-slash folder; folders get a slash", () => {
    expect(buildCreatePath("/files/Docs/", "report", false)).toBe(
      "/files/Docs/report"
    );
    expect(buildCreatePath("/files/Docs/", "report", true)).toBe(
      "/files/Docs/report/"
    );
  });

  it("normalizes a missing trailing slash on the folder (no double slash)", () => {
    expect(buildCreatePath("/files/Docs", "a", false)).toBe("/files/Docs/a");
    expect(buildCreatePath("/files/Docs", "a", true)).toBe("/files/Docs/a/");
  });

  it("URL-encodes spaces, unicode and reserved chars in the name", () => {
    expect(buildCreatePath("/files/B/", "New Folder", true)).toBe(
      "/files/B/New%20Folder/"
    );
    expect(buildCreatePath("/files/B/", "café résumé", false)).toBe(
      "/files/B/caf%C3%A9%20r%C3%A9sum%C3%A9"
    );
    expect(buildCreatePath("/files/B/", "a&b#c", false)).toBe(
      "/files/B/a%26b%23c"
    );
  });

  it("handles the storage root", () => {
    expect(buildCreatePath("/files/", "x", true)).toBe("/files/x/");
  });
});
