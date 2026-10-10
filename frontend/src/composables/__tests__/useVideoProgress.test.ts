import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import {
  formatTimestamp,
  useVideoProgress,
  VIDEO_PREF_KEY,
} from "@/composables/useVideoProgress";
import { usePreferences } from "@/composables/usePreferences";

beforeEach(() => resetPrefsHarness());

describe("useVideoProgress", () => {
  it("resumes a long video from the saved position", () => {
    const v = useVideoProgress();
    v.save("/m.mkv", 754.6, 3600);
    expect(v.resumeAt("/m.mkv")).toBe(754);
    expect(v.fraction("/m.mkv")).toBeCloseTo(754 / 3600);
  });

  it("doesn't resume short videos, early positions or unknown paths", () => {
    const v = useVideoProgress();
    v.save("/clip.mp4", 100, 200); // < 5 min: not tracked at all
    expect(v.get("/clip.mp4")).toBeUndefined();
    v.save("/m.mkv", 5, 3600);
    expect(v.resumeAt("/m.mkv")).toBe(0);
    expect(v.resumeAt("/nope.mkv")).toBe(0);
  });

  it("marks watched at 98% and starts over next time", () => {
    const v = useVideoProgress();
    expect(v.save("/m.mkv", 3540, 3600)).toBe(true);
    expect(v.isWatched("/m.mkv")).toBe(true);
    expect(v.resumeAt("/m.mkv")).toBe(0);
    expect(v.fraction("/m.mkv")).toBe(0);
    // Short clips count as watched when finished, too.
    expect(v.save("/clip.mp4", 60, 60)).toBe(true);
    expect(v.isWatched("/clip.mp4")).toBe(true);
  });

  it("keeps the watched flag while rewatching", () => {
    const v = useVideoProgress();
    v.save("/m.mkv", 3600, 3600);
    v.save("/m.mkv", 600, 3600);
    expect(v.isWatched("/m.mkv")).toBe(true);
  });

  it("ignores junk input", () => {
    const v = useVideoProgress();
    expect(v.save("", 1, 1000)).toBe(false);
    expect(v.save("/m.mkv", NaN, 1000)).toBe(false);
    expect(v.save("/m.mkv", 400, Infinity)).toBe(false);
    expect(v.get("/m.mkv")).toBeUndefined();
  });

  it("bulk marks watched / unwatched", () => {
    const v = useVideoProgress();
    v.save("/a.mkv", 600, 3600);
    v.setWatched(["/a.mkv", "/b.mkv"], true);
    expect(v.isWatched("/a.mkv")).toBe(true);
    expect(v.isWatched("/b.mkv")).toBe(true);
    expect(v.resumeAt("/a.mkv")).toBe(0);
    v.setWatched(["/a.mkv"], false);
    expect(v.get("/a.mkv")).toBeUndefined();
  });

  it("caps the map, evicting the least recently updated", () => {
    let clock = 0;
    const v = useVideoProgress(() => ++clock);
    for (let i = 0; i < 205; i++) v.save(`/v${i}.mkv`, 600, 3600);
    const map = usePreferences().get<Record<string, unknown>>(
      VIDEO_PREF_KEY,
      {}
    );
    expect(Object.keys(map)).toHaveLength(200);
    expect(map["/v0.mkv"]).toBeUndefined();
    expect(map["/v204.mkv"]).toBeDefined();
  });

  it("remove forgets one video", () => {
    const v = useVideoProgress();
    v.save("/m.mkv", 600, 3600);
    v.remove("/m.mkv");
    expect(v.get("/m.mkv")).toBeUndefined();
  });
});

describe("formatTimestamp", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3723.9)).toBe("1:02:03");
    expect(formatTimestamp(-4)).toBe("0:00");
  });
});
