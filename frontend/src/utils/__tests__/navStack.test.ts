import { describe, it, expect } from "vitest";
import { NavStack, NAV_STACK_MAX } from "@/utils/navStack";

describe("NavStack", () => {
  it("starts with nowhere to go", () => {
    const s = new NavStack();
    expect(s.canBack).toBe(false);
    expect(s.canForward).toBe(false);
    s.push("a", "/files/");
    expect(s.canBack).toBe(false);
  });

  it("goes back and forward between pushed pages", () => {
    const s = new NavStack();
    s.push("a", "/files/");
    s.push("b", "/files/Music/");
    s.push("c", "/files/Music/Jazz/");
    expect(s.canBack).toBe(true);
    expect(s.canForward).toBe(false);
    expect(s.moveTo("b")).toBe(true);
    expect(s.current?.path).toBe("/files/Music/");
    expect(s.canForward).toBe(true);
    expect(s.moveTo("a")).toBe(true);
    expect(s.canBack).toBe(false);
  });

  it("drops the forward entries when a new page is pushed after going back", () => {
    const s = new NavStack();
    s.push("a", "/1");
    s.push("b", "/2");
    s.moveTo("a");
    s.push("c", "/3");
    expect(s.entries.map((e) => e.path)).toEqual(["/1", "/3"]);
    expect(s.canForward).toBe(false);
  });

  it("replace swaps the current entry", () => {
    const s = new NavStack();
    s.push("a", "/1");
    s.push("b", "/2");
    s.replace("c", "/2?x=1");
    expect(s.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(s.index).toBe(1);
  });

  it("replace on an empty stack pushes", () => {
    const s = new NavStack();
    s.replace("a", "/1");
    expect(s.entries).toHaveLength(1);
  });

  it("reports an unknown id so the caller can start fresh", () => {
    const s = new NavStack();
    s.push("a", "/1");
    expect(s.moveTo("zzz")).toBe(false);
    s.reset("z", "/9");
    expect(s.entries).toEqual([{ id: "z", path: "/9" }]);
    expect(s.canBack).toBe(false);
  });

  it("restores a snapshot (reload) and ignores a broken one", () => {
    const s = new NavStack();
    s.push("a", "/1");
    s.push("b", "/2");
    s.moveTo("a");
    const restored = new NavStack(JSON.parse(JSON.stringify(s.snapshot())));
    expect(restored.index).toBe(0);
    expect(restored.canForward).toBe(true);
    const broken = new NavStack({ entries: [], index: 5 });
    expect(broken.index).toBe(-1);
  });

  it("keeps at most NAV_STACK_MAX entries", () => {
    const s = new NavStack();
    for (let i = 0; i < NAV_STACK_MAX + 10; i++) s.push(`i${i}`, `/${i}`);
    expect(s.entries).toHaveLength(NAV_STACK_MAX);
    expect(s.entries[0].id).toBe("i10");
    expect(s.index).toBe(NAV_STACK_MAX - 1);
  });
});
