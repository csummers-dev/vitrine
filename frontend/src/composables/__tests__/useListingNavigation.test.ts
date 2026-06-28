import { describe, it, expect, vi } from "vitest";
import { useListingNavigation } from "@/composables/useListingNavigation";
import type { ListingState } from "@/composables/usePaneContext";

// Visual order where each item's `.index` == its position (keeps assertions
// about `selected`/`activeIndex` readable). A plain `listing` object is passed
// so no Pinia/fileStore is needed.
const order = (n: number): ResourceItem[] =>
  Array.from(
    { length: n },
    (_, i) => ({ index: i }) as unknown as ResourceItem
  );

type Listing = { selected: number[]; activeIndex: number; anchorIndex: number };

function makeNav(
  o: { n?: number; grid?: boolean; cols?: number; listing?: Listing } = {}
) {
  const listing: Listing = o.listing ?? {
    selected: [],
    activeIndex: -1,
    anchorIndex: -1,
  };
  const reveal = vi.fn();
  const nav = useListingNavigation({
    ordered: () => order(o.n ?? 6),
    columnsFor: () => o.cols ?? 1,
    grid: () => o.grid ?? false,
    reveal,
    listing: listing as unknown as ListingState,
  });
  return { nav, listing, reveal };
}

describe("useListingNavigation.move", () => {
  it("is a no-op on an empty listing", () => {
    const { nav, listing, reveal } = makeNav({ n: 0 });
    nav.move("down");
    expect(listing.selected).toEqual([]);
    expect(reveal).not.toHaveBeenCalled();
  });

  it("with nothing focused, Down lands on the first item and Up on the last", () => {
    const a = makeNav({ n: 5 });
    a.nav.move("down");
    expect(a.listing.selected).toEqual([0]);
    expect(a.listing.activeIndex).toBe(0);
    expect(a.reveal).toHaveBeenCalledWith(0);

    const b = makeNav({ n: 5 });
    b.nav.move("up");
    expect(b.listing.selected).toEqual([4]);
  });

  it("list view: Down/Up step one row; Left/Right are inert", () => {
    const listing = { selected: [2], activeIndex: 2, anchorIndex: 2 };
    const { nav } = makeNav({ n: 6, listing });
    nav.move("down");
    expect(listing.selected).toEqual([3]);
    nav.move("up");
    expect(listing.selected).toEqual([2]);
    nav.move("left");
    expect(listing.selected).toEqual([2]);
    nav.move("right");
    expect(listing.selected).toEqual([2]);
  });

  it("clamps at both ends", () => {
    const top = { selected: [0], activeIndex: 0, anchorIndex: 0 };
    makeNav({ n: 6, listing: top }).nav.move("up");
    expect(top.selected).toEqual([0]);
    const bot = { selected: [5], activeIndex: 5, anchorIndex: 5 };
    makeNav({ n: 6, listing: bot }).nav.move("down");
    expect(bot.selected).toEqual([5]);
  });

  it("Home / End jump to the first / last item", () => {
    const listing = { selected: [3], activeIndex: 3, anchorIndex: 3 };
    const { nav } = makeNav({ n: 6, listing });
    nav.move("home");
    expect(listing.selected).toEqual([0]);
    nav.move("end");
    expect(listing.selected).toEqual([5]);
  });

  it("grid view: Up/Down jump by the column count; Left/Right step one tile", () => {
    const listing = { selected: [0], activeIndex: 0, anchorIndex: 0 };
    const { nav } = makeNav({ n: 12, grid: true, cols: 4, listing });
    nav.move("down");
    expect(listing.activeIndex).toBe(4);
    nav.move("right");
    expect(listing.activeIndex).toBe(5);
    nav.move("up");
    expect(listing.activeIndex).toBe(1);
    nav.move("left");
    expect(listing.activeIndex).toBe(0);
  });

  it("Shift+Down extends a contiguous range from the anchor", () => {
    const listing = { selected: [1], activeIndex: 1, anchorIndex: 1 };
    const { nav } = makeNav({ n: 6, listing });
    nav.move("down", true);
    expect(listing.selected).toEqual([1, 2]);
    expect(listing.activeIndex).toBe(2);
    expect(listing.anchorIndex).toBe(1);
    nav.move("down", true);
    expect(listing.selected).toEqual([1, 2, 3]);
  });

  it("Shift extends from a prior mouse selection that set no keyboard cursor", () => {
    const listing = { selected: [2], activeIndex: -1, anchorIndex: -1 };
    const { nav } = makeNav({ n: 6, listing });
    nav.move("down", true);
    expect(listing.selected).toEqual([2, 3]);
    expect(listing.anchorIndex).toBe(2);
  });
});
