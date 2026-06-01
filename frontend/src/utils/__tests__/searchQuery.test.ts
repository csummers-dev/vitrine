import { describe, it, expect } from "vitest";
import { parseQuery, buildSearchParams } from "@/utils/searchQuery";

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
    // Forward-compatible: future filters (size:, before:) added later
    // shouldn't silently disappear when used against an older client.
    expect(parseQuery("size:>1mb hello").q).toBe("size:>1mb hello");
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
