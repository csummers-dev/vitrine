import { describe, it, expect } from "vitest";
import { toPath } from "@/utils/progressSync";

describe("progressSync.toPath", () => {
  it("strips the /files prefix and decodes listing URLs", () => {
    expect(toPath("/files/My%20Movies/a.mkv")).toBe("/My Movies/a.mkv");
    expect(toPath("/files/Books/x.epub?permanent=true")).toBe("/Books/x.epub");
  });
  it("keeps scope paths as they are", () => {
    expect(toPath("/Movies/a.mkv")).toBe("/Movies/a.mkv");
    expect(toPath("/filesystem/a.mkv")).toBe("/filesystem/a.mkv");
  });
});
