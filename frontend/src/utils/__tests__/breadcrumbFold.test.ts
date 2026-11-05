import { describe, it, expect } from "vitest";
import { foldedCrumbs } from "@/utils/breadcrumbFold";

describe("foldedCrumbs", () => {
  it("folds nothing for zero or a single crumb", () => {
    expect(foldedCrumbs(5, 0)).toEqual([]);
    expect(foldedCrumbs(1, 3)).toEqual([]);
    expect(foldedCrumbs(0, 1)).toEqual([]);
  });

  it("folds from just after the top folder towards the current one", () => {
    expect(foldedCrumbs(6, 1)).toEqual([1]);
    expect(foldedCrumbs(6, 3)).toEqual([1, 2, 3]);
    expect(foldedCrumbs(6, 4)).toEqual([1, 2, 3, 4]);
  });

  it("folds the top folder last and never the current one", () => {
    expect(foldedCrumbs(6, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(foldedCrumbs(6, 99)).toEqual([0, 1, 2, 3, 4]);
    expect(foldedCrumbs(2, 1)).toEqual([0]);
  });

  it("clamps negative and fractional counts", () => {
    expect(foldedCrumbs(4, -2)).toEqual([]);
    expect(foldedCrumbs(4, 1.7)).toEqual([1]);
  });
});
