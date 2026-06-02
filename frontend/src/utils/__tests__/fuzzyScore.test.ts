import { describe, it, expect } from "vitest";
import { fuzzyScore } from "@/utils/commands";

describe("fuzzyScore", () => {
  it("returns 0 for an empty query (matches everything equally)", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyScore("xyz", "new folder")).toBeNull();
  });

  it("ranks exact-prefix > substring > subsequence", () => {
    const prefix = fuzzyScore("doc", "documents");
    const substring = fuzzyScore("doc", "my documents");
    const subseq = fuzzyScore("dcm", "documents");
    expect(prefix).not.toBeNull();
    expect(substring).not.toBeNull();
    expect(subseq).not.toBeNull();
    expect(prefix!).toBeGreaterThan(substring!);
    expect(substring!).toBeGreaterThan(subseq!);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("DOC", "Documents")).toBe(fuzzyScore("doc", "documents"));
  });

  it("rewards word-boundary matches over mid-word ones", () => {
    // Both are subsequence matches (no "nf" substring). "new folder" lands the
    // "f" right after a space (word boundary) so it should out-score the same
    // letters packed into a single word.
    const boundary = fuzzyScore("nf", "new folder");
    const midword = fuzzyScore("nf", "newfolder");
    expect(boundary).not.toBeNull();
    expect(midword).not.toBeNull();
    expect(boundary!).toBeGreaterThan(midword!);
  });

  it("prefers a shorter target on otherwise-equal matches", () => {
    const short = fuzzyScore("ab", "ab");
    const long = fuzzyScore("ab", "ab" + "x".repeat(40));
    expect(short!).toBeGreaterThan(long!);
  });
});
