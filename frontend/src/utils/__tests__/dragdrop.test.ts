import { describe, it, expect } from "vitest";
import { asDir, isSelfOrDescendantTarget, isNoopMove } from "@/utils/dragdrop";

describe("asDir", () => {
  it("appends a trailing slash when missing", () => {
    expect(asDir("/files/foo")).toBe("/files/foo/");
  });
  it("leaves an existing trailing slash untouched", () => {
    expect(asDir("/files/foo/")).toBe("/files/foo/");
  });
});

describe("isSelfOrDescendantTarget", () => {
  it("flags dropping a folder into itself", () => {
    expect(isSelfOrDescendantTarget("/files/foo/", true, "/files/foo/")).toBe(
      true
    );
  });
  it("flags dropping a folder into its own subtree", () => {
    expect(
      isSelfOrDescendantTarget("/files/foo/", true, "/files/foo/bar/")
    ).toBe(true);
  });
  it("allows dropping into a sibling with a shared name prefix", () => {
    // /files/foo2/ must NOT be treated as a descendant of /files/foo/.
    expect(isSelfOrDescendantTarget("/files/foo/", true, "/files/foo2/")).toBe(
      false
    );
  });
  it("allows dropping a folder into its parent (not a cycle)", () => {
    expect(isSelfOrDescendantTarget("/files/foo/", true, "/files/")).toBe(
      false
    );
  });
  it("never flags non-folders", () => {
    expect(isSelfOrDescendantTarget("/files/foo.txt", false, "/files/")).toBe(
      false
    );
  });
});

describe("isNoopMove", () => {
  it("treats a folder url and its slash-less destination as the same path", () => {
    // Folder items carry a trailing slash; the computed move destination
    // (targetDir + name) does not. This mismatch is what previously let a
    // folder be dropped onto its own location.
    expect(isNoopMove("/files/foo/", "/files/foo")).toBe(true);
  });
  it("treats identical file paths as a no-op", () => {
    expect(isNoopMove("/files/a.txt", "/files/a.txt")).toBe(true);
  });
  it("ignores percent-encoding differences", () => {
    expect(isNoopMove("/files/a%20b/", "/files/a b")).toBe(true);
  });
  it("is false for a genuine move to a different folder", () => {
    expect(isNoopMove("/files/foo/", "/files/bar/foo")).toBe(false);
  });
});
