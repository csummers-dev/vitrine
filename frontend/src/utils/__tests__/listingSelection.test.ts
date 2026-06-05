import { describe, it, expect } from "vitest";
import { resolveListingSelection } from "@/utils/listingSelection";

const items = (...paths: string[]) => paths.map((path) => ({ path }));

describe("resolveListingSelection", () => {
  it("selects nothing before the first load (oldPath null)", () => {
    expect(
      resolveListingSelection({
        oldPath: null,
        newPath: "/A/",
        isDir: true,
        items: items("/A/x"),
        preselect: ["/A/x"],
        priorSelection: [],
      })
    ).toEqual([]);
  });

  it("selects nothing for a non-directory listing", () => {
    expect(
      resolveListingSelection({
        oldPath: "/A/",
        newPath: "/A/",
        isDir: false,
        items: items("/A/x"),
        preselect: ["/A/x"],
        priorSelection: ["/A/x"],
      })
    ).toEqual([]);
  });

  describe("preselect (post-action targets, e.g. the new copies)", () => {
    it("selects the queued copies and drops the originals (copy-in-place)", () => {
      // Copied report.txt in place → server made report(1).txt; the queue
      // points at the copy, so the ORIGINAL must not stay selected.
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/A/",
          isDir: true,
          items: items("/A/report.txt", "/A/report(1).txt", "/A/other"),
          preselect: ["/A/report(1).txt", "/A/missing.txt"],
          priorSelection: ["/A/report.txt"],
        })
      ).toEqual([1]);
    });

    it("keeps the current selection when none of the queued paths are here (copied elsewhere, stayed put)", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/A/",
          isDir: true,
          items: items("/A/a", "/A/b"),
          preselect: ["/B/a", "/B/b"], // landed in B, not visible here
          priorSelection: ["/A/a", "/A/b"],
        })
      ).toEqual([0, 1]);
    });

    it("selects nothing when none match and it's an unrelated folder", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/C/",
          isDir: true,
          items: items("/C/x"),
          preselect: ["/B/a"],
          priorSelection: ["/A/a"],
        })
      ).toEqual([]);
    });
  });

  describe("same-folder refresh — keep the selection", () => {
    it("restores the prior selection by path", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/A/",
          isDir: true,
          items: items("/A/a", "/A/b", "/A/c"),
          preselect: [],
          priorSelection: ["/A/a", "/A/c"],
        })
      ).toEqual([0, 2]);
    });

    it("drops paths that vanished (deleted / renamed), keeps survivors", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/A/",
          isDir: true,
          items: items("/A/a"), // b was deleted
          preselect: [],
          priorSelection: ["/A/a", "/A/b"],
        })
      ).toEqual([0]);
    });
  });

  describe("navigation", () => {
    it("navigate-up selects the child folder we came from", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/B/",
          newPath: "/A/",
          isDir: true,
          items: items("/A/B", "/A/C"),
          preselect: [],
          priorSelection: [],
        })
      ).toEqual([0]);
    });

    it("navigating into an unrelated folder selects nothing", () => {
      expect(
        resolveListingSelection({
          oldPath: "/A/",
          newPath: "/Z/",
          isDir: true,
          items: items("/Z/x", "/Z/y"),
          preselect: [],
          priorSelection: ["/A/x"],
        })
      ).toEqual([]);
    });
  });
});
