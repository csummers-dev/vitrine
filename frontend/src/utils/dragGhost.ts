/**
 * Custom drag-image ("ghost") for file drags (v1.3 S4-4).
 *
 * The default browser drag image is a translucent snapshot of the
 * entire row — wide, washed out, and ugly when dragging across the
 * listing. This builds a compact pill: the file's icon (cloned from
 * the row's own rendered glyph, so it's always pixel-correct + theme-
 * correct) plus either the filename (single drag) or a count badge
 * (multi-item drag).
 *
 * Why clone the row's icon instead of re-deriving it: the row already
 * has the exact SVG (or loaded thumbnail) rendered with the right
 * color class for its file type and the active theme. Reading computed
 * colors off the source node means we don't have to map Tailwind class
 * names → hex or re-implement the fileIcon lookup here.
 *
 * setDragImage() rasterizes the node synchronously at call time, but
 * the node must be attached + laid out (non-display:none) when called.
 * We append it offscreen, call setDragImage, then remove it on the
 * next frame — by then the bitmap is captured.
 */

/** Read a CSS custom property off :root with a fallback. */
function rootVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export interface DragGhostOptions {
  /** The `.item` row element initiating the drag. Used to locate the
   *  source icon to clone + read its computed colors. */
  rowEl: HTMLElement;
  /** Filename shown when exactly one item is dragged. */
  name: string;
  /** Number of items in the drag. >1 swaps the filename for a count
   *  badge ("3 items"). */
  count: number;
}

/**
 * Build + attach the ghost node and register it as the drag image.
 * Returns the node so the caller can remove it on dragend as a
 * belt-and-suspenders cleanup (we also auto-remove next frame).
 *
 * No-op safe: if `dataTransfer` is null (shouldn't happen on a real
 * dragstart) we return null and the browser falls back to its default.
 */
export function setDragGhost(
  event: DragEvent,
  opts: DragGhostOptions
): HTMLElement | null {
  const dt = event.dataTransfer;
  if (!dt) return null;

  const surface = rootVar("--color-surface", "#ffffff");
  const line = rootVar("--color-line", "#ececec");
  const ink1 = rootVar("--color-ink-1", "#18181b");
  const accent = rootVar("--color-accent", "#6e72d9");

  // ── Container pill ────────────────────────────────────────────────
  const ghost = document.createElement("div");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px 6px 6px",
    background: surface,
    border: `1px solid ${line}`,
    borderRadius: "10px",
    boxShadow: "0 8px 24px -8px rgba(0,0,0,0.35)",
    font: "500 13px/1.2 system-ui, -apple-system, sans-serif",
    color: ink1,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: "9999",
  } as Partial<CSSStyleDeclaration>);

  // ── Icon box ──────────────────────────────────────────────────────
  // Clone the row's rendered icon. We read computed bg + fg off the
  // source so the squircle keeps its file-type tint outside scoped CSS.
  const iconBox = document.createElement("div");
  Object.assign(iconBox.style, {
    width: "28px",
    height: "28px",
    borderRadius: "7px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    overflow: "hidden",
  } as Partial<CSSStyleDeclaration>);

  const sourceIcon = opts.rowEl.querySelector(
    ".item__icon"
  ) as HTMLElement | null;
  if (sourceIcon) {
    const cs = getComputedStyle(sourceIcon);
    iconBox.style.background = cs.backgroundColor || "transparent";
    iconBox.style.color = cs.color || ink1;
    // Prefer cloning a loaded thumbnail; else the SVG glyph.
    const thumb = sourceIcon.querySelector("img") as HTMLImageElement | null;
    const svg = sourceIcon.querySelector("svg") as SVGElement | null;
    if (thumb && thumb.complete && thumb.naturalWidth > 0) {
      const img = thumb.cloneNode(true) as HTMLImageElement;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
      } as Partial<CSSStyleDeclaration>);
      iconBox.appendChild(img);
    } else if (svg) {
      const clonedSvg = svg.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute("width", "16");
      clonedSvg.setAttribute("height", "16");
      iconBox.appendChild(clonedSvg);
    }
  } else {
    iconBox.style.background = rootVar("--color-elevated", "#f4f4f5");
  }
  ghost.appendChild(iconBox);

  // ── Label: filename (single) OR count badge (multi) ───────────────
  if (opts.count > 1) {
    const badge = document.createElement("span");
    badge.textContent = `${opts.count} items`;
    Object.assign(badge.style, {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "999px",
      background: accent,
      color: "#ffffff",
      fontSize: "12px",
      fontWeight: "600",
    } as Partial<CSSStyleDeclaration>);
    ghost.appendChild(badge);
  } else {
    const label = document.createElement("span");
    label.textContent = opts.name;
    Object.assign(label.style, {
      maxWidth: "220px",
      overflow: "hidden",
      textOverflow: "ellipsis",
    } as Partial<CSSStyleDeclaration>);
    ghost.appendChild(label);
  }

  document.body.appendChild(ghost);

  // Anchor the image 10px down-right of the cursor (locked spec). The
  // browser captures the bitmap synchronously here.
  dt.setDragImage(ghost, 10, 10);

  // Remove next frame — the bitmap is already captured, and leaving the
  // node in the DOM would be a leak if dragend somehow never fires.
  requestAnimationFrame(() => {
    ghost.remove();
  });

  return ghost;
}
