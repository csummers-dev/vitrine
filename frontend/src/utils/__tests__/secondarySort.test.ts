import { describe, it, expect } from "vitest";
import { applySecondarySort } from "@/utils/secondarySort";

// applySecondarySort only reads name/size/modified/extension off each item.
const row = (name: string, size: number, modified: string, extension = "") =>
  ({ name, size, modified, extension }) as unknown as ResourceItem;

describe("applySecondarySort", () => {
  it("is a no-op when secondary is null (returns the same array)", () => {
    const items = [row("a", 1, "2020-01-01"), row("b", 1, "2020-01-02")];
    expect(applySecondarySort(items, "size", null)).toBe(items);
  });

  it("is a no-op when the secondary key equals the primary key", () => {
    const items = [row("a", 1, "x"), row("b", 1, "y")];
    expect(applySecondarySort(items, "size", { by: "size", asc: true })).toBe(
      items
    );
  });

  it("is a no-op for fewer than 2 items", () => {
    const items = [row("a", 1, "x")];
    expect(
      applySecondarySort(items, "size", { by: "modified", asc: true })
    ).toBe(items);
  });

  it("does not mutate the input array", () => {
    const items = [row("a", 10, "2020-01-02"), row("b", 10, "2020-01-01")];
    const snapshot = items.map((r) => r.name);
    applySecondarySort(items, "size", { by: "modified", asc: true });
    expect(items.map((r) => r.name)).toEqual(snapshot);
  });

  it("reorders only within primary tie-groups, preserving primary order", () => {
    const a = row("a", 10, "2020-03-01");
    const b = row("b", 10, "2020-01-01");
    const c = row("c", 20, "2020-02-01");
    const out = applySecondarySort([a, b, c], "size", {
      by: "modified",
      asc: true,
    });
    // {a,b} tie on size → sorted by modified asc (b before a); c untouched.
    expect(out.map((r) => r.name)).toEqual(["b", "a", "c"]);
  });

  it("honors descending secondary order", () => {
    const a = row("a", 10, "2020-01-01");
    const b = row("b", 10, "2020-03-01");
    const out = applySecondarySort([a, b], "size", {
      by: "modified",
      asc: false,
    });
    expect(out.map((r) => r.name)).toEqual(["b", "a"]);
  });

  it("sorts each tie-group independently", () => {
    const rows = [
      row("a", 10, "2020-02-01"),
      row("b", 10, "2020-01-01"),
      row("c", 20, "2020-02-01"),
      row("d", 20, "2020-01-01"),
    ];
    const out = applySecondarySort(rows, "size", { by: "modified", asc: true });
    expect(out.map((r) => r.name)).toEqual(["b", "a", "d", "c"]);
  });

  it("is stable when the secondary key also ties", () => {
    const a = row("a", 10, "2020-01-01");
    const b = row("b", 10, "2020-01-01");
    const out = applySecondarySort([a, b], "size", {
      by: "modified",
      asc: true,
    });
    expect(out.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("breaks a name tie by extension", () => {
    const a = row("file", 1, "x", "zip");
    const b = row("file", 1, "x", "7z");
    const out = applySecondarySort([a, b], "name", {
      by: "extension",
      asc: true,
    });
    expect(out.map((r) => r.extension)).toEqual(["7z", "zip"]);
  });
});
