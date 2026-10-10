import { describe, it, expect } from "vitest";
import {
  parseQuery,
  buildSearchParams,
  hasStructuredFilters,
  parseAge,
  parseSize,
  describeQuery,
  shortSize,
} from "@/utils/searchQuery";

describe("parseQuery", () => {
  it("returns empty defaults for empty input", () => {
    expect(parseQuery("")).toEqual({ tags: [], ext: "", q: "" });
    expect(parseQuery("   ")).toEqual({ tags: [], ext: "", q: "" });
  });

  it("treats plain text as q", () => {
    expect(parseQuery("hello world")).toEqual({
      tags: [],
      ext: "",
      q: "hello world",
    });
  });

  it("parses a single tag", () => {
    expect(parseQuery("tag:work")).toEqual({
      tags: ["work"],
      ext: "",
      q: "",
    });
  });

  it("parses multiple repeated tags", () => {
    expect(parseQuery("tag:work tag:urgent")).toEqual({
      tags: ["work", "urgent"],
      ext: "",
      q: "",
    });
  });

  it("parses an extension", () => {
    expect(parseQuery("ext:pdf")).toEqual({ tags: [], ext: "pdf", q: "" });
  });

  it("strips leading dot from extension", () => {
    expect(parseQuery("ext:.pdf").ext).toBe("pdf");
  });

  it("lowercases extension", () => {
    expect(parseQuery("ext:PDF").ext).toBe("pdf");
  });

  it("combines tag, ext, and free text", () => {
    expect(parseQuery("tag:work ext:pdf draft notes")).toEqual({
      tags: ["work"],
      ext: "pdf",
      q: "draft notes",
    });
  });

  it("preserves free-text order across interspersed filters", () => {
    expect(parseQuery("draft tag:work notes").q).toBe("draft notes");
  });

  it("supports double-quoted tag values with spaces", () => {
    expect(parseQuery('tag:"two words"').tags).toEqual(["two words"]);
  });

  it("supports single-quoted tag values with spaces", () => {
    expect(parseQuery("tag:'two words'").tags).toEqual(["two words"]);
  });

  it("treats keys case-insensitively", () => {
    expect(parseQuery("TAG:foo EXT:pdf").tags).toEqual(["foo"]);
    expect(parseQuery("TAG:foo EXT:pdf").ext).toBe("pdf");
  });

  it("ignores empty filter values", () => {
    expect(parseQuery("tag: ext: hello").tags).toEqual([]);
    expect(parseQuery("tag: ext: hello").ext).toBe("");
    // The "tag:" and "ext:" tokens with empty values shouldn't leak
    // into q — they were structured filters, just empty ones.
    expect(parseQuery("tag: ext: hello").q).toBe("hello");
  });

  it("last ext: wins on repeated extension filters", () => {
    expect(parseQuery("ext:pdf ext:doc").ext).toBe("doc");
  });

  it("preserves unknown prefixes as free text", () => {
    // Forward-compatible: future filters (color:, before:) added later
    // shouldn't silently disappear when used against an older client.
    expect(parseQuery("color:red hello").q).toBe("color:red hello");
  });

  it("handles a realistic smart-folder query", () => {
    expect(parseQuery("tag:work tag:urgent ext:pdf draft")).toEqual({
      tags: ["work", "urgent"],
      ext: "pdf",
      q: "draft",
    });
  });
});

describe("buildSearchParams", () => {
  it("maps tag names to IDs", () => {
    const params = buildSearchParams(
      { tags: ["work", "urgent"], ext: "pdf", q: "draft" },
      { work: 1, urgent: 2 }
    );
    // URLSearchParams toString order: append order preserved per spec.
    const pairs = params.split("&");
    expect(pairs).toContain("tag=1");
    expect(pairs).toContain("tag=2");
    expect(pairs).toContain("ext=pdf");
    expect(pairs).toContain("q=draft");
  });

  it("skips tag names that aren't in the lookup", () => {
    // Typo'd / stale tag names shouldn't 400 the request — they just
    // narrow the search to "no match" semantically. Filter them at
    // build time so the request never gets sent with a bad value.
    const params = buildSearchParams(
      { tags: ["work", "nonexistent"], ext: "", q: "" },
      { work: 1 }
    );
    expect(params).toBe("tag=1");
  });

  it("looks up tag names case-insensitively", () => {
    const params = buildSearchParams(
      { tags: ["Work"], ext: "", q: "" },
      { work: 1 }
    );
    expect(params).toBe("tag=1");
  });

  it("omits empty ext and q", () => {
    const params = buildSearchParams({ tags: [], ext: "", q: "" }, {});
    expect(params).toBe("");
  });

  it("URL-encodes special characters in q", () => {
    const params = buildSearchParams(
      { tags: [], ext: "", q: "hello & world" },
      {}
    );
    expect(params).toContain("q=hello+%26+world");
  });
});

describe("kind, size and age filters (4.0 5.3)", () => {
  const GB = 1024 ** 3;
  const DAY = 86_400_000;

  it("parses type, size bounds and age", () => {
    expect(
      parseQuery("type:videos size:>4GB size:<10gb added:7d trip")
    ).toEqual({
      tags: [],
      ext: "",
      q: "trip",
      type: "video",
      minSize: 4 * GB,
      maxSize: 10 * GB,
      withinMs: 7 * DAY,
    });
    expect(parseQuery("is:photo modified:2w").type).toBe("image");
    expect(parseQuery("modified:2w").withinMs).toBe(14 * DAY);
    expect(parseQuery("size:1.5mb").minSize).toBe(Math.round(1.5 * 1024 ** 2));
  });

  it("keeps values it can't read as free text", () => {
    expect(parseQuery("type:spreadsheet size:huge added:soon")).toEqual({
      tags: [],
      ext: "",
      q: "type:spreadsheet size:huge added:soon",
    });
    expect(parseSize("4 parsecs")).toBeNull();
    expect(parseAge("0d")).toBeNull();
  });

  it("only treats real filters as structured", () => {
    expect(hasStructuredFilters(parseQuery("holiday"))).toBe(false);
    expect(hasStructuredFilters(parseQuery("added:1d"))).toBe(true);
    expect(hasStructuredFilters(parseQuery("size:<1k"))).toBe(true);
    expect(hasStructuredFilters(parseQuery("is:untagged"))).toBe(true);
    expect(buildSearchParams(parseQuery("is:untagged"), {})).toBe("untagged=1");
  });

  it("resolves the age against now, so saved searches roll forward", () => {
    const now = Date.UTC(2026, 9, 10);
    const params = new URLSearchParams(
      buildSearchParams(parseQuery("type:image added:7d size:>1k"), {}, now)
    );
    expect(params.get("type")).toBe("image");
    expect(params.get("minSize")).toBe("1024");
    expect(params.get("newer")).toBe(String((now - 7 * DAY) / 1000));
    expect(params.has("maxSize")).toBe(false);
  });
});

describe("describeQuery", () => {
  it("reads a query back in plain words", () => {
    expect(
      describeQuery(parseQuery("type:video size:>4GB added:1w tag:family trip"))
    ).toBe(
      "Videos · at least 4 GB · new or changed in the last week · tagged “family” · name contains “trip”"
    );
    expect(describeQuery(parseQuery("added:30d"))).toBe(
      "New or changed in the last month"
    );
    expect(describeQuery(parseQuery("ext:pdf size:>1mb size:<1.5gb"))).toBe(
      ".pdf files · 1 MB to 1.5 GB"
    );
    expect(describeQuery(parseQuery(""))).toBe("");
    expect(describeQuery(parseQuery("ext:flac is:untagged"))).toBe(
      ".flac files · untagged"
    );
    expect(shortSize(1536)).toBe("1.5 KB");
  });
});
