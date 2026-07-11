import { describe, it, expect } from "vitest";
import { pressStartedOnEmptyListing } from "@/utils/listingPress";

// A tiny DOM tree mirroring the listing: a clear-on-click container holding a
// row (.item) with an inline rename input, plus bare empty space.
function build() {
  const listing = document.createElement("div");
  listing.dataset.clearOnClick = "true";

  const row = document.createElement("div");
  row.className = "item";
  const input = document.createElement("input");
  input.className = "item__rename-input";
  row.appendChild(input);

  const nameSpan = document.createElement("span");
  nameSpan.className = "item__name-text";
  row.appendChild(nameSpan);

  const emptySpace = document.createElement("div"); // bare child, not a row
  listing.appendChild(row);
  listing.appendChild(emptySpace);
  document.body.appendChild(listing);
  return { listing, row, input, nameSpan, emptySpace };
}

describe("pressStartedOnEmptyListing", () => {
  it("is true for a press on bare empty listing space", () => {
    const { emptySpace, listing } = build();
    expect(pressStartedOnEmptyListing(emptySpace)).toBe(true);
    expect(pressStartedOnEmptyListing(listing)).toBe(true);
  });

  it("is FALSE for a press that starts inside the rename input (the bug)", () => {
    const { input } = build();
    // This is the case that regressed: a drag begins in the input; its
    // release-outside must NOT be treated as an empty-space click.
    expect(pressStartedOnEmptyListing(input)).toBe(false);
  });

  it("is false for a press on a row or its name", () => {
    const { row, nameSpan } = build();
    expect(pressStartedOnEmptyListing(row)).toBe(false);
    expect(pressStartedOnEmptyListing(nameSpan)).toBe(false);
  });

  it("is false for a press on a control (button/anchor)", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const a = document.createElement("a");
    document.body.appendChild(a);
    expect(pressStartedOnEmptyListing(btn)).toBe(false);
    expect(pressStartedOnEmptyListing(a)).toBe(false);
  });

  it("is true for a null target (defensive)", () => {
    expect(pressStartedOnEmptyListing(null)).toBe(true);
  });
});
