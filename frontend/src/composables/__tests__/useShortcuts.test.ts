import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useShortcuts, installShortcuts } from "@/composables/useShortcuts";

// The dispatcher's overlay-blocking check reads Pinia stores; give it a fresh
// pinia each test (no prompt/palette/overlay open → nothing blocks).
beforeEach(() => {
  setActivePinia(createPinia());
  installShortcuts(); // idempotent: installs the window keydown listener once
});

afterEach(() => {
  document.body.innerHTML = "";
});

const press = (key: string, opts: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(e);
  return e;
};

describe("useShortcuts dispatcher", () => {
  it("fires a registered single-key shortcut and preventDefaults it", () => {
    const handler = vi.fn();
    const { register } = useShortcuts();
    const off = register({
      id: "test:x",
      keys: "x",
      label: "X",
      group: "files",
      handler,
    });
    const e = press("x");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    off();
    press("x");
    expect(handler).toHaveBeenCalledTimes(1); // not called after unregister
  });

  it("ignores keys held with Ctrl / Meta / Alt", () => {
    const handler = vi.fn();
    const { register } = useShortcuts();
    const off = register({
      id: "test:y",
      keys: "y",
      label: "Y",
      group: "files",
      handler,
    });
    press("y", { metaKey: true });
    press("y", { ctrlKey: true });
    press("y", { altKey: true });
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it("matches a two-key chord pressed within the window", () => {
    const handler = vi.fn();
    const { register } = useShortcuts();
    const off = register({
      id: "test:chord",
      keys: ["g", "z"],
      label: "GZ",
      group: "navigation",
      handler,
    });
    press("g");
    press("z");
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("does not fire single-key shortcuts while typing in an input", () => {
    const handler = vi.fn();
    const { register } = useShortcuts();
    const off = register({
      id: "test:i",
      keys: "i",
      label: "I",
      group: "files",
      handler,
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "i",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it("isolates a throwing handler (does not surface out of the listener)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { register } = useShortcuts();
    const off = register({
      id: "test:boom",
      keys: "b",
      label: "B",
      group: "files",
      handler: () => {
        throw new Error("boom");
      },
    });
    expect(() => press("b")).not.toThrow();
    expect(spy).toHaveBeenCalled();
    off();
    spy.mockRestore();
  });

  it("exposes registered shortcuts via `shortcuts`", () => {
    const { register, shortcuts } = useShortcuts();
    const off = register({
      id: "test:list",
      keys: "1",
      label: "List view",
      group: "view",
      handler: () => {},
    });
    expect(shortcuts.value.some((s) => s.id === "test:list")).toBe(true);
    off();
    expect(shortcuts.value.some((s) => s.id === "test:list")).toBe(false);
  });
});
