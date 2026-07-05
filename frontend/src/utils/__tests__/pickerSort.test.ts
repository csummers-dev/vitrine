import { describe, it, expect } from "vitest";
import {
  sortFolders,
  pickerSortLabel,
  readPickerSort,
} from "@/utils/pickerSort";

const f = (name: string, modified = "") => ({ name, modified });

describe("sortFolders — name", () => {
  it("orders A→Z case-insensitively, numeric-aware", () => {
    const out = sortFolders(
      [f("folder10"), f("Beta"), f("folder2"), f("alpha")],
      "name",
      true
    ).map((x) => x.name);
    // numeric: folder2 before folder10; case-insensitive: alpha before Beta
    expect(out).toEqual(["alpha", "Beta", "folder2", "folder10"]);
  });

  it("reverses for descending (Z→A)", () => {
    const out = sortFolders(
      [f("alpha"), f("Beta"), f("folder2"), f("folder10")],
      "name",
      false
    ).map((x) => x.name);
    expect(out).toEqual(["folder10", "folder2", "Beta", "alpha"]);
  });

  it("does not mutate the input array", () => {
    const input = [f("b"), f("a")];
    const copy = [...input];
    sortFolders(input, "name", true);
    expect(input).toEqual(copy);
  });
});

describe("sortFolders — modified", () => {
  it("orders oldest→newest ascending", () => {
    const out = sortFolders(
      [
        f("new", "2026-03-01T00:00:00Z"),
        f("old", "2026-01-01T00:00:00Z"),
        f("mid", "2026-02-01T00:00:00Z"),
      ],
      "modified",
      true
    ).map((x) => x.name);
    expect(out).toEqual(["old", "mid", "new"]);
  });

  it("orders newest→oldest descending", () => {
    const out = sortFolders(
      [f("old", "2026-01-01T00:00:00Z"), f("new", "2026-03-01T00:00:00Z")],
      "modified",
      false
    ).map((x) => x.name);
    expect(out).toEqual(["new", "old"]);
  });

  it("sinks unknown/empty dates and tie-breaks equal dates by name", () => {
    const same = "2026-01-01T00:00:00Z";
    const out = sortFolders(
      [f("zzz", same), f("aaa", same), f("nodate", "")],
      "modified",
      true
    ).map((x) => x.name);
    // nodate (epoch 0) is oldest → first ascending; equal dates tie-break A→Z
    expect(out).toEqual(["nodate", "aaa", "zzz"]);
  });
});

describe("pickerSortLabel", () => {
  it("labels name direction as A→Z / Z→A", () => {
    expect(pickerSortLabel("name", true)).toBe("Name, A→Z");
    expect(pickerSortLabel("name", false)).toBe("Name, Z→A");
  });
  it("labels modified direction as Oldest / Newest", () => {
    expect(pickerSortLabel("modified", true)).toBe("Modified, Oldest");
    expect(pickerSortLabel("modified", false)).toBe("Modified, Newest");
  });
});

describe("readPickerSort", () => {
  it("defaults to Name, ascending", () => {
    expect(readPickerSort(null)).toEqual({ by: "name", asc: true });
    expect(readPickerSort({})).toEqual({ by: "name", asc: true });
  });
  it("round-trips a stored preference", () => {
    expect(readPickerSort({ by: "modified", asc: false })).toEqual({
      by: "modified",
      asc: false,
    });
  });
  it("coerces an unknown field to name and keeps ascending default", () => {
    expect(readPickerSort({ by: "size" })).toEqual({ by: "name", asc: true });
  });
});
