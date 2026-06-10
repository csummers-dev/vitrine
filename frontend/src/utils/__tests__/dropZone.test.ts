import { describe, it, expect } from "vitest";
import { isPointInRowIntoZone, resolveRowDropMode } from "@/utils/dropZone";

// Build a list-view folder row with controllable layout rects, mirroring the
// real DOM: an icon, then `.item__name-text` (flex:1 — its box spans the WHOLE
// name column), with the rendered glyphs inside an inner `.item__name-glyph`.
//
//   icon   : x [10, 34]    (24px)
//   name   : x [40, 640]   (flex column — far wider than the text)
//   glyph  : x [40, …]      (the actual rendered name)
//   Modified/Size/actions columns live to the RIGHT of 640.
//   Row vertical band: y [0, 44].
//
// The into-zone must be scoped to icon + glyphs, NOT the flex column — otherwise
// the empty space after a short name (and the whole row in a meta-less layout)
// wrongly reads as "drop INTO this folder". That's the regression this guards.
const rect =
  (left: number, right: number, top = 0, bottom = 44) =>
  () =>
    ({
      left,
      right,
      top,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON() {},
    }) as DOMRect;

function buildRow(
  glyphRight: number,
  withGlyph = true,
  isDir = true
): HTMLElement {
  const row = document.createElement("div");
  row.className = "item";
  // `resolveRowDropMode` keys the folder check off this attribute (mirrors the
  // real row's `:data-dir`), so set it the same way ListingItem renders it.
  row.dataset.dir = isDir ? "true" : "false";
  const icon = document.createElement("div");
  icon.className = "item__icon";
  const name = document.createElement("span");
  name.className = "item__name-text";
  row.append(icon, name);
  icon.getBoundingClientRect = rect(10, 34);
  name.getBoundingClientRect = rect(40, 640); // flex column, NOT the text width

  if (withGlyph) {
    const glyph = document.createElement("span");
    glyph.className = "item__name-glyph";
    glyph.textContent = "Movies";
    name.appendChild(glyph);
    glyph.getBoundingClientRect = rect(40, glyphRight);
  }
  return row;
}

describe("isPointInRowIntoZone", () => {
  it("is true over the icon and the name glyphs (+ grab margin)", () => {
    const row = buildRow(120); // short name ends at x=120
    expect(isPointInRowIntoZone(row, 20, 22)).toBe(true); // over the icon
    expect(isPointInRowIntoZone(row, 80, 22)).toBe(true); // over the name text
    expect(isPointInRowIntoZone(row, 132, 22)).toBe(true); // within 16px grab past 120
  });

  it("is FALSE in the empty space after a short name (the regression)", () => {
    const row = buildRow(120);
    // Past the glyphs (end 120) + grab (136), but still inside the flex name
    // COLUMN (ends 640). Scoping to the column made this read as "drop into";
    // scoping to the glyph span correctly makes it "alongside".
    expect(isPointInRowIntoZone(row, 200, 22)).toBe(false);
    expect(isPointInRowIntoZone(row, 500, 22)).toBe(false); // Modified/Size area
  });

  it("caps a long (truncated) name at the name-column edge", () => {
    const row = buildRow(900); // glyphs wider than the 640 column → truncated
    expect(isPointInRowIntoZone(row, 600, 22)).toBe(true); // inside column + grab
    expect(isPointInRowIntoZone(row, 700, 22)).toBe(false); // past 640 + 16
  });

  it("returns false outside the row's vertical band", () => {
    const row = buildRow(120);
    expect(isPointInRowIntoZone(row, 80, 100)).toBe(false);
  });

  it("returns false when the row has no name element", () => {
    const row = document.createElement("div");
    row.className = "item";
    expect(isPointInRowIntoZone(row, 80, 22)).toBe(false);
  });

  it("falls back to the name-column edge when the glyph span is absent (rename input)", () => {
    const row = buildRow(120, /* withGlyph */ false);
    // No glyph span → right = name column edge (640) + grab. There's no drag
    // during a rename, so the wider fallback is harmless.
    expect(isPointInRowIntoZone(row, 200, 22)).toBe(true);
  });

  it("matches the real-world reported drop (regression): x past the glyphs is alongside", () => {
    // Exact rects from a real drop log:
    //   icon 318–346 · name (flex column) 356–736 · rendered glyphs 356–537
    // The drop logged cursorX=665 (112px past the glyphs, highlight off) yet
    // wrongly went INTO the folder — because the drop handler used a stale cached
    // flag instead of this hit-test. The hit-test itself correctly reads x=665 as
    // ALONGSIDE; the fix is to have the drop recompute it.
    const row = document.createElement("div");
    row.className = "item";
    const icon = document.createElement("div");
    icon.className = "item__icon";
    const name = document.createElement("span");
    name.className = "item__name-text";
    const glyph = document.createElement("span");
    glyph.className = "item__name-glyph";
    name.appendChild(glyph);
    row.append(icon, name);
    icon.getBoundingClientRect = rect(318, 346);
    name.getBoundingClientRect = rect(356, 736);
    glyph.getBoundingClientRect = rect(356, 537);

    expect(isPointInRowIntoZone(row, 665, 22)).toBe(false); // the reported drop → alongside
    expect(isPointInRowIntoZone(row, 560, 22)).toBe(false); // just past glyphs + 16px grab (553)
    expect(isPointInRowIntoZone(row, 545, 22)).toBe(true); // within the grab margin
    expect(isPointInRowIntoZone(row, 450, 22)).toBe(true); // over the glyphs
    expect(isPointInRowIntoZone(row, 330, 22)).toBe(true); // over the icon
  });
});

describe("resolveRowDropMode", () => {
  // This is the single resolver every drop surface (highlight, desktop drop,
  // touch drop, upload drop) calls. These assert the two things that kept
  // diverging across those four call sites: (1) a FOLDER row's icon+name is the
  // ONLY "into" zone, and (2) it layers `data-dir` on top of the geometry so a
  // FILE row is never "into" no matter where the cursor lands.

  it("is 'into' over a folder row's icon + name glyphs", () => {
    const row = buildRow(120); // folder, glyphs end at 120
    expect(resolveRowDropMode(row, 20, 22)).toBe("into"); // over the icon
    expect(resolveRowDropMode(row, 80, 22)).toBe("into"); // over the name text
    expect(resolveRowDropMode(row, 132, 22)).toBe("into"); // within the 16px grab
  });

  it("is 'alongside' past a folder row's name (empty space / meta columns)", () => {
    const row = buildRow(120);
    expect(resolveRowDropMode(row, 200, 22)).toBe("alongside");
    expect(resolveRowDropMode(row, 500, 22)).toBe("alongside");
  });

  it("is ALWAYS 'alongside' on a FILE row, even over its icon + name", () => {
    const row = buildRow(120, /* withGlyph */ true, /* isDir */ false);
    // Same geometry as a folder, but data-dir="false" → you can never drop INTO
    // a file. Every point that would be "into" on a folder is "alongside" here.
    expect(resolveRowDropMode(row, 20, 22)).toBe("alongside"); // over the icon
    expect(resolveRowDropMode(row, 80, 22)).toBe("alongside"); // over the name
    expect(resolveRowDropMode(row, 132, 22)).toBe("alongside"); // in the grab band
  });

  it("treats a row with no data-dir as not-a-folder → 'alongside'", () => {
    const row = buildRow(120);
    delete row.dataset.dir; // attribute absent entirely
    expect(resolveRowDropMode(row, 80, 22)).toBe("alongside");
  });

  it("equals (isDir && isPointInRowIntoZone) for every cell of a golden table", () => {
    // The contract, asserted directly: resolveRowDropMode is exactly the folder
    // check ANDed with the geometry. If either ever drifts, this fails.
    const xs = [20, 80, 132, 200, 500, 600];
    for (const isDir of [true, false]) {
      for (const x of xs) {
        const row = buildRow(120, true, isDir);
        const expected =
          isDir && isPointInRowIntoZone(row, x, 22) ? "into" : "alongside";
        expect(resolveRowDropMode(row, x, 22)).toBe(expected);
      }
    }
  });
});
