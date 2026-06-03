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
const MIN_GALLERY = 220; // matches `minmax(220px, 1fr)` (file tiles)
// Folders get NARROWER gallery tracks → smaller, more-compact tiles. They
// sit in their own section above the divider and carry no media thumbnail,
// so they read as quiet "jump here" chips rather than hero tiles. Keep this
// in sync with `.listing-section--dirs` minmax() in listing.css.
const MIN_GALLERY_DIR = 150; // matches `minmax(150px, 1fr)` (folder tiles)
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
  // Per-section geometry. In grid view + list view the two sections share
  // identical dimensions; in GALLERY the folder section uses narrower
  // tracks (smaller tiles), so each section tracks its own column count +
  // tile height. computeWindow / hitTest / keyboard-scroll all read the
  // section-appropriate pair.
  /** Columns fitting the folder / file section widths. */
  const dirsCols = ref(1);
  const filesCols = ref(1);
  /** Visible tile height (px) for the folder / file sections. */
  const dirsTileH = ref(GRID_TILE_H);
  const filesTileH = ref(GRID_TILE_H);

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
  /** Column count + 4:3 tile height for a gallery section with the given
   *  minimum track width. */
  const galleryMetrics = (width: number, minTrack: number) => {
    const c = Math.max(1, Math.floor((width + GUTTER) / (minTrack + GUTTER)));
    const colW = (width - (c - 1) * GUTTER) / c;
    return { c, th: (colW * 3) / 4 };
  };

  const measure = () => {
    const width = sectionWidth();
    if (width <= 0) return;

    if (opts.gallery()) {
      // Files use the standard tracks and stay full-bleed 4:3.
      const f = galleryMetrics(width, MIN_GALLERY);
      filesCols.value = f.c;
      filesTileH.value = f.th;
      // Folders use narrower tracks AND now render as grid-style cards
      // (amber media block + name footer), so they're no longer a fixed 4:3.
      // Keep the column count from the track width, but measure the real tile
      // height from the DOM (falling back to the 4:3 metric before a tile has
      // rendered) so the windowing math matches the cards' actual height.
      const d = galleryMetrics(width, MIN_GALLERY_DIR);
      dirsCols.value = d.c;
      const dirsEl = opts.dirsSectionEl();
      const dirTile = dirsEl?.querySelector<HTMLElement>(".item:not(.header)");
      dirsTileH.value =
        dirTile && dirTile.offsetHeight > 0 ? dirTile.offsetHeight : d.th;
    } else {
      // Grid view: folders + files share identical tracks + tile height
      // (measured live from whichever section is mounted).
      const c = Math.max(1, Math.floor((width + GUTTER) / (MIN_GRID + GUTTER)));
      const el = opts.dirsSectionEl() || opts.filesSectionEl();
      const tile = el?.querySelector<HTMLElement>(".item:not(.header)");
      const h = tile && tile.offsetHeight > 0 ? tile.offsetHeight : GRID_TILE_H;
      dirsCols.value = filesCols.value = c;
      dirsTileH.value = filesTileH.value = h;
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
    viewH: number,
    c: number,
    th: number
  ): SectionWindow => {
    const stride = th + GUTTER;
    if (count === 0 || stride <= 0 || c <= 0) return emptyWin();
    const totalRows = Math.ceil(count / c);
    const fullHeight = totalRows * th + (totalRows - 1) * GUTTER;

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
    const renderedH = renderedRows * th + (renderedRows - 1) * GUTTER;
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
    const dWin = computeWindow(
      dCount,
      dTop,
      scrollTop,
      viewH,
      dirsCols.value,
      dirsTileH.value
    );
    Object.assign(dirsWin, dWin);

    const fTop = sectionTop(opts.filesSectionEl(), sc);
    const fWin = computeWindow(
      fCount,
      fTop,
      scrollTop,
      viewH,
      filesCols.value,
      filesTileH.value
    );
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
    const out: number[] = [];

    const section = (
      el: HTMLElement | null,
      indices: number[],
      c: number,
      th: number
    ): void => {
      if (!el || indices.length === 0) return;
      const stride = th + GUTTER;
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

    section(opts.dirsSectionEl(), dirIndices, dirsCols.value, dirsTileH.value);
    section(
      opts.filesSectionEl(),
      fileIndices,
      filesCols.value,
      filesTileH.value
    );
    return out;
  };

  return {
    dirsCols: dirsCols as Ref<number>,
    filesCols: filesCols as Ref<number>,
    dirsTileH: dirsTileH as Ref<number>,
    filesTileH: filesTileH as Ref<number>,
    dirsWin,
    filesWin,
    measure,
    update,
    hitTest,
  };
}
