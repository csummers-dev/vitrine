import { describe, it, expect } from "vitest";
import {
  autoSelect,
  canSelect,
  keepKnown,
  selectedBytes,
  toggleCopy,
} from "@/utils/dupeSelection";
import type { DupeGroup } from "@/api/dupes";

const g = (size: number, ...files: [string, string][]): DupeGroup => ({
  size,
  hash: files[0][0],
  files: files.map(([path, modified]) => ({
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    modified,
  })),
});

const songs = g(
  100,
  ["/Music/a.flac", "2026-01-01T00:00:00Z"],
  ["/Backup/a.flac", "2026-03-01T00:00:00Z"],
  ["/Old/a.flac", "2025-01-01T00:00:00Z"]
);
const photos = g(
  10,
  ["/Photos/p.jpg", "2026-01-01T00:00:00Z"],
  ["/Photos/copy/p.jpg", "2026-01-01T00:00:00Z"]
);

describe("autoSelect", () => {
  it("keeps the newest or the oldest copy", () => {
    expect([...autoSelect([songs], "newest")].sort()).toEqual([
      "/Music/a.flac",
      "/Old/a.flac",
    ]);
    expect([...autoSelect([songs], "oldest")].sort()).toEqual([
      "/Backup/a.flac",
      "/Music/a.flac",
    ]);
    // A tie keeps the shortest path.
    expect([...autoSelect([photos], "newest")]).toEqual(["/Photos/copy/p.jpg"]);
  });

  it("keeps copies inside a folder, and never empties a group", () => {
    expect(
      [...autoSelect([songs, photos], "folder", "/Music/")].sort()
    ).toEqual(["/Backup/a.flac", "/Old/a.flac"]);
    // Every photo copy is inside /Photos: nothing selected there.
    expect([...autoSelect([photos], "folder", "/Photos")]).toEqual([]);
    // No copy inside the folder: left alone.
    expect([...autoSelect([songs], "folder", "/Nowhere")]).toEqual([]);
  });
});

describe("manual selection", () => {
  it("refuses to select the last copy in a group", () => {
    let sel: Set<string> | null = new Set<string>();
    sel = toggleCopy(photos, sel, "/Photos/p.jpg");
    expect(sel && [...sel]).toEqual(["/Photos/p.jpg"]);
    expect(canSelect(photos, sel!, "/Photos/copy/p.jpg")).toBe(false);
    expect(toggleCopy(photos, sel!, "/Photos/copy/p.jpg")).toBeNull();
    // Unselecting is always allowed.
    expect([...toggleCopy(photos, sel!, "/Photos/p.jpg")!]).toEqual([]);
  });

  it("totals the space freed and forgets vanished paths", () => {
    const sel = new Set(["/Music/a.flac", "/Old/a.flac", "/Photos/p.jpg"]);
    expect(selectedBytes([songs, photos], sel)).toBe(210);
    expect([...keepKnown([songs], sel)].sort()).toEqual([
      "/Music/a.flac",
      "/Old/a.flac",
    ]);
  });
});
