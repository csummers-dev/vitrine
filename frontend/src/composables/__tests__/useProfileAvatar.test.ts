import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import { useProfileAvatar } from "@/composables/useProfileAvatar";
import { usePreferences } from "@/composables/usePreferences";

beforeEach(() => resetPrefsHarness());

const TINY = "data:image/jpeg;base64,/9j/AAA=";

describe("useProfileAvatar", () => {
  it("starts with no avatar (initials fallback)", () => {
    const a = useProfileAvatar();
    a.init();
    expect(a.hasAvatar.value).toBe(false);
    expect(a.avatarUrl.value).toBe("");
  });

  it("stores a data-URI avatar in the prefs bag", () => {
    const a = useProfileAvatar();
    a.init();
    a.setAvatar(TINY);
    expect(a.hasAvatar.value).toBe(true);
    expect(a.avatarUrl.value).toBe(TINY);
    expect(usePreferences().get("profile.avatar", "")).toBe(TINY);
  });

  it("clearAvatar empties it (persisting empty, not deleting)", () => {
    const a = useProfileAvatar();
    a.init();
    a.setAvatar(TINY);
    a.clearAvatar();
    expect(a.hasAvatar.value).toBe(false);
    expect(usePreferences().get("profile.avatar", "sentinel")).toBe("");
  });

  it("rejects non-data-URI or oversize junk (stored as empty)", () => {
    const a = useProfileAvatar();
    a.init();
    a.setAvatar("https://evil.example/x.png");
    expect(a.hasAvatar.value).toBe(false);
    a.setAvatar("data:image/png;base64," + "A".repeat(600 * 1024));
    expect(a.hasAvatar.value).toBe(false);
  });

  it("ignores a non-avatar value already in the bag on read", () => {
    usePreferences().set("profile.avatar", "not-an-image");
    const a = useProfileAvatar();
    a.init();
    expect(a.hasAvatar.value).toBe(false);
  });
});
