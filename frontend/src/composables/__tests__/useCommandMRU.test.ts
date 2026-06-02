import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import { useCommandMRU } from "@/composables/useCommandMRU";

beforeEach(() => resetPrefsHarness());

describe("useCommandMRU", () => {
  it("record adds newest-first and dedups", () => {
    const m = useCommandMRU();
    m.record("action.newFolder");
    m.record("view.grid");
    m.record("action.newFolder");
    expect(m.mruIds.value).toEqual(["action.newFolder", "view.grid"]);
  });

  it("ignores ephemeral file:/recent: command ids", () => {
    const m = useCommandMRU();
    m.record("file:/some/path");
    m.record("recent:/x");
    m.record("action.newFolder");
    expect(m.mruIds.value).toEqual(["action.newFolder"]);
  });

  it("caps stored entries at 12", () => {
    const m = useCommandMRU();
    for (let i = 0; i < 20; i++) m.record(`cmd.${i}`);
    expect(m.mru.value).toHaveLength(12);
    expect(m.mruIds.value[0]).toBe("cmd.19"); // newest
  });

  it("clear empties the log", () => {
    const m = useCommandMRU();
    m.record("action.newFolder");
    m.clear();
    expect(m.mru.value).toEqual([]);
  });
});
