import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";

// Mock the users API so we can observe (and control) the network call
// without standing up MSW or hitting fetch. Hoisted so the module under
// test sees the mock when it imports usersApi.
const updateMock = vi.fn();
vi.mock("@/api/users", () => ({
  update: (...args: unknown[]) => updateMock(...args),
}));

import {
  usePreferences,
  __resetPreferencesForTests,
} from "@/composables/usePreferences";

const baseUser = (): IUser => ({
  id: 7,
  username: "u",
  password: "",
  scope: "",
  perm: {
    admin: false,
    copy: true,
    create: true,
    delete: true,
    download: true,
    execute: true,
    modify: true,
    move: true,
    rename: true,
    share: true,
    shell: false,
    upload: true,
  },
  commands: [],
  rules: [],
  lockPassword: false,
  hideDotfiles: false,
  singleClick: false,
  redirectAfterCopyMove: false,
  dateFormat: false,
  viewMode: "list",
  preferences: {},
});

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().setUser(baseUser());
  __resetPreferencesForTests();
  updateMock.mockReset();
  updateMock.mockResolvedValue(undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePreferences", () => {
  it("get returns the default when key is missing", () => {
    const prefs = usePreferences();
    expect(prefs.get("nope", "fallback")).toBe("fallback");
    expect(prefs.get("missing.list", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("set updates local state immediately (optimistic)", () => {
    const prefs = usePreferences();
    prefs.set("editor.fontSize", 18);
    // The value is readable BEFORE the debounced save fires.
    expect(prefs.get("editor.fontSize", 0)).toBe(18);
  });

  it("set debounces the server PUT", async () => {
    const prefs = usePreferences();
    prefs.set("a", 1);
    prefs.set("b", 2);
    prefs.set("c", 3);
    expect(updateMock).not.toHaveBeenCalled();
    // Advance past the debounce window. Wrap in async tick so the
    // microtask queue drains.
    await vi.advanceTimersByTimeAsync(300);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [payload, which] = updateMock.mock.calls[0];
    expect(which).toEqual(["preferences"]);
    expect(payload.id).toBe(7);
    expect(payload.preferences).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("set Promise resolves when the batched save completes", async () => {
    const prefs = usePreferences();
    const p1 = prefs.set("a", 1);
    const p2 = prefs.set("b", 2);
    let p1Done = false;
    let p2Done = false;
    void p1.then(() => (p1Done = true));
    void p2.then(() => (p2Done = true));
    await vi.advanceTimersByTimeAsync(300);
    // Let resolution microtasks drain.
    await Promise.resolve();
    expect(p1Done).toBe(true);
    expect(p2Done).toBe(true);
  });

  it("remove deletes the key and triggers a save", async () => {
    const prefs = usePreferences();
    prefs.set("doomed", "x");
    await vi.advanceTimersByTimeAsync(300);
    updateMock.mockClear();

    prefs.remove("doomed");
    expect(prefs.get<string | null>("doomed", null)).toBe(null);
    await vi.advanceTimersByTimeAsync(300);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [payload] = updateMock.mock.calls[0];
    expect(payload.preferences).not.toHaveProperty("doomed");
  });

  it("remove on missing key is a no-op (no server call)", async () => {
    const prefs = usePreferences();
    await prefs.remove("never.set.this");
    await vi.advanceTimersByTimeAsync(300);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejected save rolls local state back to the pre-batch snapshot", async () => {
    const prefs = usePreferences();
    prefs.set("ok", "stays"); // pre-existing committed value
    await vi.advanceTimersByTimeAsync(300);
    expect(prefs.get("ok", "")).toBe("stays");

    updateMock.mockRejectedValueOnce(new Error("boom"));
    const p = prefs.set("ok", "mutated");
    // Attach the rejection handler immediately so vitest doesn't flag
    // the mock's internally-constructed rejected promise as unhandled
    // before we get a chance to await it below.
    const expectation = expect(p).rejects.toThrow("boom");
    expect(prefs.get("ok", "")).toBe("mutated"); // optimistic

    await vi.advanceTimersByTimeAsync(300);
    await expectation;

    // Rollback restores the snapshot taken when this batch began.
    expect(prefs.get("ok", "")).toBe("stays");
  });

  it("flushNow forces the pending save to fire immediately", async () => {
    const prefs = usePreferences();
    prefs.set("hot", true);
    expect(updateMock).not.toHaveBeenCalled();
    await prefs.flushNow();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
