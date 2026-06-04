import { describe, it, expect } from "vitest";
import { useFolderScrollMemory } from "@/composables/useFolderScrollMemory";

const on = () => true;

describe("useFolderScrollMemory", () => {
  it("restores a folder's scroll on return, across a cross-directory jump", () => {
    const m = useFolderScrollMemory(on);
    // Movies scrolled to 1200; jump sideways to Downloads (e.g. via favorites).
    m.record("/Movies/", 1200);
    expect(m.recall("/Downloads/")).toBeNull(); // first visit to Downloads
    // Leave Downloads (at 300), go back to Movies → restored.
    m.record("/Downloads/", 300);
    expect(m.recall("/Movies/")).toBe(1200);
    // Both sides are remembered (not a single slot): going back to Downloads
    // restores it too.
    expect(m.recall("/Downloads/")).toBe(300);
  });

  it("preserves position on a same-folder reload (e.g. after an upload)", () => {
    const m = useFolderScrollMemory(on);
    // Reload re-records then recalls the same path.
    m.record("/Movies/", 950);
    expect(m.recall("/Movies/")).toBe(950);
  });

  it("keeps the latest position each time you leave a folder", () => {
    const m = useFolderScrollMemory(on);
    m.record("/A/", 100);
    expect(m.recall("/A/")).toBe(100);
    m.record("/A/", 700);
    expect(m.recall("/A/")).toBe(700);
  });

  it("clamps negative scroll to 0", () => {
    const m = useFolderScrollMemory(on);
    m.record("/A/", -40);
    expect(m.recall("/A/")).toBe(0);
  });

  it("evicts the least-recently-recorded entry past the cap (LRU)", () => {
    const m = useFolderScrollMemory(on, { max: 2 });
    m.record("/A/", 1);
    m.record("/B/", 2);
    m.record("/C/", 3); // evicts /A/
    expect(m.recall("/A/")).toBeNull();
    expect(m.recall("/B/")).toBe(2);
    expect(m.recall("/C/")).toBe(3);
    // Re-recording /B/ makes it most-recent; next insert evicts /C/.
    m.record("/B/", 22);
    m.record("/D/", 4); // evicts /C/ (now oldest)
    expect(m.recall("/C/")).toBeNull();
    expect(m.recall("/B/")).toBe(22);
    expect(m.recall("/D/")).toBe(4);
  });

  it("is inert when disabled, and resumes when re-enabled", () => {
    let flag = false;
    const m = useFolderScrollMemory(() => flag);
    m.record("/Movies/", 1200);
    expect(m.recall("/Movies/")).toBeNull(); // disabled: nothing recorded/recalled
    flag = true;
    m.record("/Movies/", 500);
    expect(m.recall("/Movies/")).toBe(500);
  });

  it("reset() clears all positions", () => {
    const m = useFolderScrollMemory(on);
    m.record("/A/", 100);
    m.reset();
    expect(m.recall("/A/")).toBeNull();
  });
});
