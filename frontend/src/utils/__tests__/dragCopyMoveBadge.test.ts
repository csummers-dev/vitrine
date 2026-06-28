import { describe, it, expect, afterEach } from "vitest";
import {
  startDragBadge,
  moveDragBadge,
  endDragBadge,
} from "@/utils/dragCopyMoveBadge";

// The badge is the only fixed-position direct child of <body> while a drag is
// live. (jsdom resolves the `--color-*` vars to "" so the literal fallbacks are
// used; we assert on text + position, not theme colors.)
const badgeEl = (): HTMLElement | null =>
  (Array.from(document.body.children).find(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.style.position === "fixed"
  ) as HTMLElement | undefined) ?? null;

const fixedCount = (): number =>
  Array.from(document.body.children).filter(
    (el) => el instanceof HTMLElement && el.style.position === "fixed"
  ).length;

// Always tear down so a leaked badge / window listener can't bleed across tests.
afterEach(() => endDragBadge());

describe("dragCopyMoveBadge", () => {
  it("startDragBadge appends a fixed 'Move' pill positioned at cursor+offset", () => {
    startDragBadge(false, 100, 50);
    const el = badgeEl();
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("Move");
    expect(el!.style.position).toBe("fixed");
    expect(el!.style.pointerEvents).toBe("none");
    // OFFSET_X = 16, OFFSET_Y = 30 (sits just below the drag image).
    expect(el!.style.transform).toBe("translate(116px, 80px)");
  });

  it("copy=true labels the pill 'Copy'", () => {
    startDragBadge(true, 0, 0);
    expect(badgeEl()!.textContent).toBe("Copy");
  });

  it("moveDragBadge is a no-op when no badge is active", () => {
    expect(() => moveDragBadge(true, 10, 10)).not.toThrow();
    expect(badgeEl()).toBeNull();
  });

  it("moveDragBadge re-labels and re-positions an active badge", () => {
    startDragBadge(false, 0, 0);
    moveDragBadge(true, 200, 100);
    const el = badgeEl()!;
    expect(el.textContent).toBe("Copy");
    expect(el.style.transform).toBe("translate(216px, 130px)");
  });

  it("endDragBadge removes the badge and is idempotent", () => {
    startDragBadge(false, 0, 0);
    expect(badgeEl()).not.toBeNull();
    endDragBadge();
    expect(badgeEl()).toBeNull();
    expect(() => endDragBadge()).not.toThrow();
  });

  it("holding Ctrl/Cmd toggles the label live, releasing reverts it", () => {
    startDragBadge(false, 0, 0);
    expect(badgeEl()!.textContent).toBe("Move");
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));
    expect(badgeEl()!.textContent).toBe("Copy");
    window.dispatchEvent(new KeyboardEvent("keyup"));
    expect(badgeEl()!.textContent).toBe("Move");
    window.dispatchEvent(new KeyboardEvent("keydown", { metaKey: true }));
    expect(badgeEl()!.textContent).toBe("Copy");
  });

  it("Escape tears the badge down (Esc-cancel-drag fix)", () => {
    startDragBadge(false, 0, 0);
    expect(badgeEl()).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(badgeEl()).toBeNull();
  });

  it("after Escape teardown the key listeners are gone (no stale relabel)", () => {
    startDragBadge(false, 0, 0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // A modifier keydown now must NOT resurrect or mutate anything.
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));
    expect(badgeEl()).toBeNull();
  });

  it("starting a second drag replaces the first (singleton, no leak)", () => {
    startDragBadge(false, 0, 0);
    startDragBadge(true, 0, 0);
    expect(fixedCount()).toBe(1);
    expect(badgeEl()!.textContent).toBe("Copy");
  });
});
