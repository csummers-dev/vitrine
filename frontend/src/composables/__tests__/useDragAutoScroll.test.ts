import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useDragAutoScroll } from "@/composables/useDragAutoScroll";

// A scroller occupying y 100..500, x 0..400.
function scroller() {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top: 100, bottom: 500, left: 0, right: 400 }) as DOMRect;
  el.scrollTop = 1000;
  return el;
}

const over = (x: number, y: number) =>
  ({ clientX: x, clientY: y }) as DragEvent;

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const runFrame = () => frames.shift()?.(0);

describe("useDragAutoScroll", () => {
  it("scrolls up near the top edge, faster the deeper into the band", () => {
    const el = scroller();
    const s = useDragAutoScroll(() => el);
    s.onDragScrollOver(over(200, 150)); // 50px into the 56px band
    runFrame();
    const shallow = 1000 - el.scrollTop;
    expect(shallow).toBeGreaterThan(0);

    el.scrollTop = 1000;
    s.onDragScrollOver(over(200, 101)); // almost at the edge
    runFrame();
    const deep = 1000 - el.scrollTop;
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(s.DRAG_EDGE_SPEED);
  });

  it("scrolls down near the bottom edge, never faster than the cap", () => {
    const el = scroller();
    const s = useDragAutoScroll(() => el);
    s.onDragScrollOver(over(200, 700)); // past the bottom edge
    runFrame();
    expect(el.scrollTop - 1000).toBe(s.DRAG_EDGE_SPEED);
  });

  it("does nothing in the middle or outside the scroller horizontally", () => {
    const el = scroller();
    const s = useDragAutoScroll(() => el);
    s.onDragScrollOver(over(200, 300));
    s.onDragScrollOver(over(900, 120));
    expect(frames).toHaveLength(0);
  });

  it("stopDragScroll cancels a running scroll", () => {
    const el = scroller();
    const s = useDragAutoScroll(() => el);
    s.onDragScrollOver(over(200, 110));
    s.stopDragScroll();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    runFrame();
    expect(el.scrollTop).toBe(1000);
  });
});
