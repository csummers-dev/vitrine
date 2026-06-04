import { describe, it, expect } from "vitest";
import { TypeaheadSession, type TypeaheadItem } from "@/utils/typeahead";

const items: TypeaheadItem[] = [
  { index: 0, name: "Akira" },
  { index: 1, name: "Billy Bat" },
  { index: 2, name: "Banana" },
  { index: 3, name: "Bob" },
  { index: 4, name: "Bobby" },
  { index: 5, name: "Cat" },
];

describe("TypeaheadSession", () => {
  it("matches the first item starting with the typed letter", () => {
    const s = new TypeaheadSession();
    expect(s.push("a", items, -1, 0)).toBe(0); // Akira
  });

  it("refines a multi-letter prefix in place", () => {
    const s = new TypeaheadSession();
    expect(s.push("b", items, -1, 0)).toBe(1); // Billy Bat
    expect(s.push("o", items, 1, 10)).toBe(3); // "bo" → Bob (skips Billy/Banana)
  });

  it("cycles through same-prefixed siblings on a repeated key", () => {
    const s = new TypeaheadSession();
    // The bug fix: tapping "b" repeatedly steps Billy → Banana → Bob → Bobby
    // → wrap, instead of building "bb"/"bbb" and matching nothing.
    expect(s.push("b", items, -1, 0)).toBe(1); // Billy Bat
    expect(s.push("b", items, 1, 10)).toBe(2); // Banana
    expect(s.push("b", items, 2, 20)).toBe(3); // Bob
    expect(s.push("b", items, 3, 30)).toBe(4); // Bobby
    expect(s.push("b", items, 4, 40)).toBe(1); // wraps back to Billy Bat
  });

  it("is case-insensitive", () => {
    const s = new TypeaheadSession();
    expect(s.push("B", items, -1, 0)).toBe(1); // Billy Bat
  });

  it("starts a fresh session after the idle gap", () => {
    const s = new TypeaheadSession(900);
    expect(s.push("b", items, -1, 0)).toBe(1); // Billy Bat
    // 1s later (> resetMs) typing "c" is a brand-new search, not "bc".
    expect(s.push("c", items, 1, 1000)).toBe(5); // Cat
  });

  it("does NOT reset within the idle window (accumulates a prefix)", () => {
    const s = new TypeaheadSession(900);
    expect(s.push("b", items, -1, 0)).toBe(1); // Billy Bat
    expect(s.push("a", items, 1, 100)).toBe(2); // "ba" → Banana (within window)
  });

  it("returns -1 (no change) when nothing matches", () => {
    const s = new TypeaheadSession();
    expect(s.push("z", items, -1, 0)).toBe(-1);
  });

  it("returns -1 for an empty listing", () => {
    const s = new TypeaheadSession();
    expect(s.push("a", [], -1, 0)).toBe(-1);
  });

  it("reset() clears the in-progress prefix", () => {
    const s = new TypeaheadSession();
    expect(s.push("b", items, -1, 0)).toBe(1); // Billy Bat
    s.reset();
    // After reset, "o" within the old window is still a fresh single-letter
    // search, not "bo".
    expect(s.push("o", items, 1, 10)).toBe(-1); // nothing starts with "o"
  });

  it("isActive() reports whether a prefix is mid-session", () => {
    const s = new TypeaheadSession(900);
    expect(s.isActive(0)).toBe(false); // nothing typed yet
    s.push("b", items, -1, 0);
    expect(s.isActive(10)).toBe(true); // prefix in progress within window
    expect(s.isActive(1000)).toBe(false); // idled out (> resetMs)
    s.push("a", items, 1, 1010); // fresh single-letter session
    expect(s.isActive(1020)).toBe(true);
    s.reset();
    expect(s.isActive(1030)).toBe(false); // cleared
  });

  it("admits a space mid-prefix to match a name with a space (V3-C #25)", () => {
    const s = new TypeaheadSession(900);
    // "billy" → isActive → space joins → "billy " still matches "Billy Bat".
    expect(s.push("b", items, -1, 0)).toBe(1);
    expect(s.push("i", items, 1, 10)).toBe(1);
    expect(s.push("l", items, 1, 20)).toBe(1);
    expect(s.push("l", items, 1, 30)).toBe(1);
    expect(s.push("y", items, 1, 40)).toBe(1);
    expect(s.isActive(50)).toBe(true);
    expect(s.push(" ", items, 1, 50)).toBe(1); // "billy " → Billy Bat
    expect(s.push("b", items, 1, 60)).toBe(1); // "billy b" → Billy Bat
  });
});
