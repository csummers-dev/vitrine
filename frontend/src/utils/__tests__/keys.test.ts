import { describe, it, expect } from "vitest";
import { keyLabel } from "@/utils/keys";

describe("keyLabel", () => {
  it("keeps Mac notation on a Mac", () => {
    expect(keyLabel("⌘⇧C", true)).toBe("⌘⇧C");
  });
  it("spells the modifiers out elsewhere", () => {
    expect(keyLabel("⌘K", false)).toBe("Ctrl+K");
    expect(keyLabel("⌘⇧C", false)).toBe("Ctrl+Shift+C");
    expect(keyLabel("⌥↑", false)).toBe("Alt+↑");
    expect(keyLabel("Del", false)).toBe("Del");
  });
});
