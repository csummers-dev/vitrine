import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";

// Mock the users API so setRootLabel's debounced save is observable and
// never hits the network. Hoisted so the module under test sees the mock.
const updateMock = vi.fn();
vi.mock("@/api/users", () => ({
  update: (...args: unknown[]) => updateMock(...args),
}));

import { __resetPreferencesForTests } from "@/composables/usePreferences";
import { useRootLabel } from "@/composables/useRootLabel";

const baseUser = (preferences: Record<string, unknown> = {}): IUser => ({
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
  preferences,
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

describe("useRootLabel", () => {
  it("is empty when the user hasn't set a label", () => {
    expect(useRootLabel().rootLabel.value).toBe("");
  });

  it("reflects a stored label, trimmed", () => {
    useAuthStore().setUser(baseUser({ "nav.rootLabel": "  Homelab  " }));
    expect(useRootLabel().rootLabel.value).toBe("Homelab");
  });

  it("setRootLabel trims and is readable immediately (optimistic)", () => {
    const root = useRootLabel();
    root.setRootLabel("  Media Library  ");
    expect(root.rootLabel.value).toBe("Media Library");
  });

  it("setRootLabel persists the trimmed value to the preferences PUT", async () => {
    useRootLabel().setRootLabel("  Media Library  ");
    expect(updateMock).not.toHaveBeenCalled(); // debounced
    await vi.advanceTimersByTimeAsync(300);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [payload, which] = updateMock.mock.calls[0];
    expect(which).toEqual(["preferences"]);
    expect(payload.preferences["nav.rootLabel"]).toBe("Media Library");
  });

  it("a blank label clears back to empty (falls back to the default in the UI)", () => {
    const root = useRootLabel();
    root.setRootLabel("Homelab");
    expect(root.rootLabel.value).toBe("Homelab");
    root.setRootLabel("   ");
    expect(root.rootLabel.value).toBe("");
  });
});
