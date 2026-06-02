/**
 * Canvas-based image edit pipeline (v1.3 S5-4).
 *
 * WYSIWYG: a single `renderOriented` function produces both the live
 * editor preview and the exported result, so what the user sees is
 * exactly what gets saved. The edit runs entirely client-side; the
 * result is uploaded as a NEW file (save-as-copy — the original is
 * never touched).
 *
 * Transform model (applied in this order, matching the canvas code):
 *   1. rotate (90° clockwise steps)
 *   2. flip (mirror, in the rotated/display space so a flip toggles
 *      what the user currently sees)
 *   3. crop (rectangle in oriented-image natural pixels)
 */

export type RotateDeg = 0 | 90 | 180 | 270;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditTransform {
  /** Clockwise rotation in degrees. */
  rotate: RotateDeg;
  flipH: boolean;
  flipV: boolean;
  /** Crop rect in ORIENTED (post rotate+flip) natural pixels, or null
   *  for the full oriented image. */
  crop: CropRect | null;
}

/**
 * Fetch the full-resolution original and decode it with EXIF
 * orientation baked in. `imageOrientation: "from-image"` makes the
 * bitmap already-upright so our own rotate steps are relative to the
 * correct base (no double-applied orientation).
 */
export async function loadEditableImage(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

/**
 * Render the bitmap with rotate + flip into a fresh canvas at `scale`
 * (1 = full resolution). The returned canvas is the "oriented" image —
 * crop is applied separately in `renderFinal`.
 *
 * Canvas transform order (translate → flip → rotate → draw) means a
 * source point is rotated first, then flipped, so the flip mirrors the
 * already-rotated (i.e. on-screen) image — the intuitive behavior.
 */
export function renderOriented(
  bitmap: ImageBitmap,
  t: Pick<EditTransform, "rotate" | "flipH" | "flipV">,
  scale = 1
): HTMLCanvasElement {
  const swap = t.rotate === 90 || t.rotate === 270;
  const w = Math.max(
    1,
    Math.round((swap ? bitmap.height : bitmap.width) * scale)
  );
  const h = Math.max(
    1,
    Math.round((swap ? bitmap.width : bitmap.height) * scale)
  );

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  ctx.rotate((t.rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return canvas;
}

/** Full-resolution oriented + cropped canvas, ready for export. */
export function renderFinal(
  bitmap: ImageBitmap,
  t: EditTransform
): HTMLCanvasElement {
  const oriented = renderOriented(bitmap, t, 1);
  if (!t.crop) return oriented;
  const { x, y, w, h } = t.crop;
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const ctx = out.getContext("2d");
  if (!ctx) return oriented;
  ctx.drawImage(oriented, x, y, w, h, 0, 0, cw, ch);
  return out;
}

export interface OutputFormat {
  mime: string;
  /** undefined for lossless formats (png). */
  quality: number | undefined;
  /** Output extension (may differ from source for formats canvas
   *  can't encode — gif/bmp/tiff fall back to png). */
  ext: string;
}

/**
 * Output format derived from the source filename. Preserves the source
 * type where the canvas can encode it (jpeg/png/webp); otherwise falls
 * back to lossless PNG. JPEG/WebP encode at 0.9 (the locked default).
 */
export function outputFormatFor(sourceName: string): OutputFormat {
  const ext = sourceName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return { mime: "image/jpeg", quality: 0.9, ext };
    case "webp":
      return { mime: "image/webp", quality: 0.9, ext: "webp" };
    case "png":
      return { mime: "image/png", quality: undefined, ext: "png" };
    default:
      // gif / bmp / tiff / unknown — canvas can't re-encode these
      // losslessly in-format, so produce a PNG copy.
      return { mime: "image/png", quality: undefined, ext: "png" };
  }
}

/** Encode a canvas to a Blob in the given format. */
export function exportCanvas(
  canvas: HTMLCanvasElement,
  fmt: OutputFormat
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image export failed"))),
      fmt.mime,
      fmt.quality
    );
  });
}

/**
 * Build the default "edited" copy name for a source file, auto-
 * incrementing to avoid collisions with the provided existing names.
 * "photo.jpg" → "photo-edited.jpg" (or "-edited-2", "-edited-3", …).
 * If the output format differs from the source (gif→png), the new
 * extension is used.
 */
export function defaultEditedName(
  sourceName: string,
  outExt: string,
  existing: Set<string>
): string {
  const dot = sourceName.lastIndexOf(".");
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  let candidate = `${base}-edited.${outExt}`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-edited-${n}.${outExt}`;
    n++;
  }
  return candidate;
}
