import { describe, it, expect } from "vitest";
import { effectiveUploadLimit } from "@/utils/uploadLimit";

describe("effectiveUploadLimit", () => {
  it("uses the preference, clamped to 1..10 and the admin cap", () => {
    expect(effectiveUploadLimit(3, 10)).toBe(3);
    expect(effectiveUploadLimit(8, 4)).toBe(4);
    expect(effectiveUploadLimit(50, 0)).toBe(10);
    expect(effectiveUploadLimit(undefined, undefined)).toBe(5);
    expect(effectiveUploadLimit("junk", 10)).toBe(5);
    expect(effectiveUploadLimit(0, 10)).toBe(5);
  });
});
