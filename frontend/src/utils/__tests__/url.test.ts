import { describe, it, expect } from "vitest";
import {
  removeLastDir,
  encodePath,
  encodeRFC5987ValueChars,
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
