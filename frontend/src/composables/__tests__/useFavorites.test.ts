import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/users", () => ({
  update: vi.fn().mockResolvedValue(undefined),
}));

import { resetPrefsHarness } from "./_prefsHarness";
import { useFavorites } from "@/composables/useFavorites";

beforeEach(() => resetPrefsHarness());

describe("useFavorites", () => {
  it("add / isFavorited / toggle / remove", () => {
    const f = useFavorites();
    expect(f.isFavorited("/files/A")).toBe(false);
    f.add("/files/A");
    expect(f.isFavorited("/files/A")).toBe(true);
    expect(f.favorites.value).toEqual(["/files/A"]);
    f.add("/files/A"); // idempotent
    expect(f.favorites.value).toEqual(["/files/A"]);
    f.toggle("/files/A"); // removes
    expect(f.isFavorited("/files/A")).toBe(false);
    f.toggle("/files/B"); // adds
    expect(f.favorites.value).toEqual(["/files/B"]);
  });

  it("remove also drops the custom title", () => {
    const f = useFavorites();
    f.add("/files/A");
    f.setTitle("/files/A", "Alpha");
    expect(f.titleFor("/files/A")).toBe("Alpha");
    f.remove("/files/A");
    expect(f.titleFor("/files/A")).toBe("");
  });

  it("displayName falls back to the URL-decoded basename; custom title is trimmed", () => {
    const f = useFavorites();
    expect(f.displayName("/files/Docs/Letters%20Home/")).toBe("Letters Home");
    f.setTitle("/files/Docs/Letters%20Home/", "  Mail  ");
    expect(f.displayName("/files/Docs/Letters%20Home/")).toBe("Mail");
  });

  it("reorder moves an item; clamps / no-ops on out-of-range or identical", () => {
    const f = useFavorites();
    ["/a", "/b", "/c"].forEach((p) => f.add(p));
    f.reorder(0, 2); // a → end
    expect(f.favorites.value).toEqual(["/b", "/c", "/a"]);
    f.reorder(2, 0); // back to front
    expect(f.favorites.value).toEqual(["/a", "/b", "/c"]);
    f.reorder(0, 0); // identical → no-op
    expect(f.favorites.value).toEqual(["/a", "/b", "/c"]);
    f.reorder(5, 1); // out of range → no-op
    expect(f.favorites.value).toEqual(["/a", "/b", "/c"]);
  });

  it("insert places at an index, clamps, and is idempotent", () => {
    const f = useFavorites();
    ["/a", "/b"].forEach((p) => f.add(p));
    f.insert("/x", 1);
    expect(f.favorites.value).toEqual(["/a", "/x", "/b"]);
    f.insert("/a", 0); // already present → no-op
    expect(f.favorites.value).toEqual(["/a", "/x", "/b"]);
    f.insert("/z", 99); // clamps to end
    expect(f.favorites.value).toEqual(["/a", "/x", "/b", "/z"]);
  });

  it("renamePath rewrites an exact match and its descendants + carries titles", () => {
    const f = useFavorites();
    f.add("/files/Movies");
    f.add("/files/Movies/Action");
    f.add("/files/Other");
    f.setTitle("/files/Movies", "Films");
    f.renamePath("/files/Movies", "/files/Cinema");
    expect(f.favorites.value).toEqual([
      "/files/Cinema",
      "/files/Cinema/Action",
      "/files/Other",
    ]);
    expect(f.titleFor("/files/Cinema")).toBe("Films");
    expect(f.titleFor("/files/Movies")).toBe("");
  });

  it("renamePath is trailing-slash insensitive for descendants", () => {
    const f = useFavorites();
    f.add("/files/Movies/Action");
    f.renamePath("/files/Movies/", "/files/Cinema");
    expect(f.favorites.value).toEqual(["/files/Cinema/Action"]);
  });
});
