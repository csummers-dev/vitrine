import { reactive, ref, type Ref } from "vue";

/**
 * useListingGrid — windowed (virtualized) layout model for the grid +
 * gallery views (v1.3 CH-1).
 *
 * The grid + gallery used to render an ever-growing `showLimit` slice of
 * tiles (incremental infinite-scroll); a huge folder eventually mounted
 * every tile once scrolled to the bottom. This composable instead computes,
 * per section (folders, then files), the small RANGE of tiles inside (or
 * near) the viewport and the pixel padding that stands in for the rows
 * above/below — so the DOM only ever holds the visible window + a buffer.
 *
 * Why manual windowing rather than RecycleScroller's grid mode: it leaves
 * the existing markup untouched — the `.listing-section` CSS grid, the
 * folder/file divider, the section scroll, and the in-flow drop-zone / pill
 * / context-menu all stay exactly where they are. We only render fewer
 * `.item`s and add two zero-content spacer blocks per section. The layout
 * math is dead simple and, crucially, deterministic:
 *
 *   stride            = tileHeight + gap          (row-to-row pitch)
 *   topPad            = firstRow * stride         (rows skipped above)
 *   rendered section  = a normal CSS grid of rows [firstRow..lastRow]
 *   botPad            = fullHeight - topPad - renderedGridHeight
 *
 * Because spacers are block siblings of the grid (not grid cells), there's
 * no gap accounting to get wrong, and each section's total height stays
 * constant regardless of the window — so the second section's offset never
 * shifts as you scroll.
 *
 * Because we own the exact layout math, the lasso (useDragSelect) can hit-
 * test by geometry instead of by querying on-screen DOM nodes — which is
 * what keeps rubber-band selection correct across windowed-out tiles.
 */

export interface SectionWindow {
  /** First item index (within the section's array) to render. */
  start: number;
  /** One past the last item index to render. */
  end: number;
  /** Pixel height of the spacer standing in for skipped rows above. */
  topPad: number;
  /** Pixel height of the spacer standing in for skipped rows below. */
  botPad: number;
}

export interface ListingGridOptions {
  /** 'grid' | 'gallery' active when this returns true (else inert). */
  enabled: () => boolean;
  /** True when the active view is the wider 4:3 gallery. */
  gallery: () => boolean;
  /** The scroll container (the <section> for grid/gallery). */
  scrollEl: () => HTMLElement | null;
  /** The folders grid element (`.listing-section`), if rendered. */
  dirsSectionEl: () => HTMLElement | null;
  /** The files grid element (`.listing-section`), if rendered. */
  filesSectionEl: () => HTMLElement | null;
  dirsCount: () => number;
  filesCount: () => number;
}

const GUTTER = 12; // matches CSS `gap: 12px`
const MIN_GRID = 160; // matches `minmax(160px, 1fr)`
const MIN_GALLERY = 220; // matches `minmax(220px, 1fr)`
// Extra rows rendered above + below the viewport so a flick doesn't reveal
// blank space before the scroll handler catches up.
const BUFFER_ROWS = 3;
// Fallbacks used before a real tile has been measured.
const GRID_TILE_H = 116;

const emptyWin = (): SectionWindow => ({
  start: 0,
  end: 0,
  topPad: 0,
  botPad: 0,
});

export function useListingGrid(opts: ListingGridOptions) {
  /** Columns currently fitting the section width. */
  const cols = ref(1);
  /** Visible tile height (px) for the active mode. */
  const tileH = ref(GRID_TILE_H);

  const dirsWin = reactive<SectionWindow>(emptyWin());
  const filesWin = reactive<SectionWindow>(emptyWin());

  /** Width of one section's content box (drives column count + hit-test). */
  const sectionWidth = (): number => {
    const el = opts.dirsSectionEl() || opts.filesSectionEl();
    if (el && el.clientWidth > 0) return el.clientWidth;
    // No section rendered yet — estimate from the scroll container minus
    // the #listing horizontal padding (16px each side).
    const sc = opts.scrollEl();
    return sc ? Math.max(0, sc.clientWidth - 32) : 0;
  };

  /** Recompute columns + tile height from the live DOM. Cheap; safe to
   *  call before any tile exists (falls back to estimates). */
  const measure = () => {
    const width = sectionWidth();
    if (width <= 0) return;
    const min = opts.gallery() ? MIN_GALLERY : MIN_GRID;
    cols.value = Math.max(1, Math.floor((width + GUTTER) / (min + GUTTER)));

    if (opts.gallery()) {
      // 4:3 tile → height derived from the responsive column width.
      const colW = (width - (cols.value - 1) * GUTTER) / cols.value;
      tileH.value = (colW * 3) / 4;
    } else {
      const el = opts.dirsSectionEl() || opts.filesSectionEl();
      const tile = el?.querySelector<HTMLElement>(".item:not(.header)");
      if (tile && tile.offsetHeight > 0) tileH.value = tile.offsetHeight;
    }
  };

  /** Content-space Y (relative to the scroll container's content) of a
   *  section element's top edge. Robust to padding/margins/the hidden
   *  header because it's measured live; stays stable while scrolling since
   *  spacers keep each section's height constant. */
  const sectionTop = (el: HTMLElement | null, sc: HTMLElement): number => {
    if (!el) return 0;
    return (
      el.getBoundingClientRect().top -
      sc.getBoundingClientRect().top +
      sc.scrollTop
    );
  };

  const computeWindow = (
    count: number,
    secTop: number,
    scrollTop: number,
    viewH: number
  ): SectionWindow => {
    const c = cols.value;
    const stride = tileH.value + GUTTER;
    if (count === 0 || stride <= 0) return emptyWin();
    const totalRows = Math.ceil(count / c);
    const fullHeight = totalRows * tileH.value + (totalRows - 1) * GUTTER;

    // Viewport span relative to this section's top.
    const top = scrollTop - secTop;
    const bottom = top + viewH;

    let firstRow = Math.floor(top / stride) - BUFFER_ROWS;
    let lastRow = Math.floor(bottom / stride) + BUFFER_ROWS;
    firstRow = Math.max(0, Math.min(firstRow, totalRows - 1));
    lastRow = Math.max(0, Math.min(lastRow, totalRows - 1));

    const start = firstRow * c;
    const end = Math.min(count, (lastRow + 1) * c);

    const topPad = firstRow * stride;
    const renderedRows = lastRow - firstRow + 1;
    const renderedH = renderedRows * tileH.value + (renderedRows - 1) * GUTTER;
    const botPad = Math.max(0, fullHeight - topPad - renderedH);

    return { start, end, topPad, botPad };
  };

  /** Recompute both section windows from the current scroll position.
   *  Call on scroll (throttled), resize, view-mode change, and after each
   *  listing render. */
  const update = () => {
    const sc = opts.scrollEl();
    if (!sc || !opts.enabled()) return;
    measure();
    const scrollTop = sc.scrollTop;
    const viewH = sc.clientHeight;

    const dCount = opts.dirsCount();
    const fCount = opts.filesCount();

    const dTop = sectionTop(opts.dirsSectionEl(), sc);
    const dWin = computeWindow(dCount, dTop, scrollTop, viewH);
    Object.assign(dirsWin, dWin);

    const fTop = sectionTop(opts.filesSectionEl(), sc);
    const fWin = computeWindow(fCount, fTop, scrollTop, viewH);
    Object.assign(filesWin, fWin);
  };

  /**
   * Geometry hit-test for the lasso. `rect` is in VIEWPORT coordinates;
   * we convert to each section's local content space and return the
   * resource indices of every tile the rect overlaps — rendered or not.
   * `dirIndices` / `fileIndices` map a section ordinal back to the
   * resource's `index` (the value selection is keyed on).
   */
  const hitTest = (
    rect: { left: number; top: number; right: number; bottom: number },
    dirIndices: number[],
    fileIndices: number[]
  ): number[] => {
    const sc = opts.scrollEl();
    if (!sc) return [];
    const c = cols.value;
    const stride = tileH.value + GUTTER;
    const out: number[] = [];

    const section = (el: HTMLElement | null, indices: number[]): void => {
      if (!el || indices.length === 0) return;
      const box = el.getBoundingClientRect();
      const colW = (box.width - (c - 1) * GUTTER) / c;
      const colStride = colW + GUTTER;
      if (colStride <= 0 || stride <= 0) return;

      // Viewport rect → section-local content coords.
      const left = rect.left - box.left;
      const right = rect.right - box.left;
      const top = rect.top - box.top;
      const bottom = rect.bottom - box.top;
      if (right < 0 || bottom < 0) return;

      const colMin = Math.max(0, Math.floor(left / colStride));
      const colMax = Math.min(c - 1, Math.ceil(right / colStride) - 1);
      const rowMin = Math.max(0, Math.floor(top / stride));
      const rowMax = Math.max(0, Math.ceil(bottom / stride) - 1);
      if (colMax < colMin || rowMax < rowMin) return;

      for (let r = rowMin; r <= rowMax; r++) {
        for (let col = colMin; col <= colMax; col++) {
          const ord = r * c + col;
          if (ord >= indices.length) break;
          out.push(indices[ord]);
        }
      }
    };

    section(opts.dirsSectionEl(), dirIndices);
    section(opts.filesSectionEl(), fileIndices);
    return out;
  };

  return {
    cols: cols as Ref<number>,
    tileH: tileH as Ref<number>,
    dirsWin,
    filesWin,
    measure,
    update,
    hitTest,
  };
}
