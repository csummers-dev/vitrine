import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import { useRecents } from "@/composables/useRecents";

beforeEach(() => resetPrefsHarness());

const file = (path: string) => ({ path, name: path.slice(1), isDir: false });

describe("useRecents", () => {
  it("track adds entries newest-first", () => {
    const r = useRecents();
    r.track(file("/a"));
    r.track(file("/b"));
    expect(r.recents.value.map((e) => e.path)).toEqual(["/b", "/a"]);
  });

  it("re-tracking promotes to the front (MRU dedup, no duplicates)", () => {
    const r = useRecents();
    r.track(file("/a"));
    r.track(file("/b"));
    r.track(file("/a"));
    expect(r.recents.value.map((e) => e.path)).toEqual(["/a", "/b"]);
  });

  it("caps at 50, trimming the oldest", () => {
    const r = useRecents();
    for (let i = 0; i < 60; i++) r.track(file(`/f${i}`));
    expect(r.recents.value).toHaveLength(50);
    expect(r.recents.value[0].path).toBe("/f59"); // newest
    expect(r.recents.value[49].path).toBe("/f10"); // oldest still kept
  });

  it("remove deletes by path; clear empties the log", () => {
    const r = useRecents();
    r.track(file("/a"));
    r.track(file("/b"));
    r.remove("/a");
    expect(r.recents.value.map((e) => e.path)).toEqual(["/b"]);
    r.clear();
    expect(r.recents.value).toEqual([]);
  });

  it("stamps accessedAt", () => {
    const r = useRecents();
    r.track(file("/a"));
    expect(typeof r.recents.value[0].accessedAt).toBe("number");
  });
});
