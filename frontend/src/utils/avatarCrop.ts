/**
 * Pure geometry for the avatar cropper (v2.8).
 *
 * The image pans/zooms under a fixed square stage; the circular mask is
 * inscribed in it. Extracted from AvatarCropper.vue so the correctness-
 * critical math — keeping the image covering the stage, zooming around the
 * center, and mapping the visible crop onto the export canvas — is unit-
 * tested independently of the DOM/canvas the component drives.
 *
 * Conventions: `scale` multiplies the natural image size; `(tx, ty)` is the
 * top-left offset of the scaled image within the stage; a bigger scale means
 * a more zoomed-in (larger) image.
 */

export interface Offset {
  tx: number;
  ty: number;
}

/**
 * The baseline "cover" scale: the smaller natural dimension exactly fills the
 * square stage, so the image never leaves a gap inside the mask at min zoom.
 * Returns 1 for a degenerate (zero-dimension) image so callers don't divide by
 * zero or produce NaN transforms.
 */
export function coverBaseline(
  natW: number,
  natH: number,
  stage: number
): number {
  const min = Math.min(natW, natH);
  if (min <= 0) return 1;
  return stage / min;
}

/** Center a `drawW × drawH` image within a square stage. */
export function centerOffset(
  drawW: number,
  drawH: number,
  stage: number
): Offset {
  return { tx: (stage - drawW) / 2, ty: (stage - drawH) / 2 };
}

/**
 * Clamp the offset so the scaled image always covers the whole stage (no gap
 * shows inside the circular mask): the top-left can't go past 0, and the
 * bottom-right can't pull inside the stage's far edge.
 */
export function clampOffset(
  tx: number,
  ty: number,
  drawW: number,
  drawH: number,
  stage: number
): Offset {
  const minX = stage - drawW;
  const minY = stage - drawH;
  return {
    tx: Math.min(0, Math.max(minX, tx)),
    ty: Math.min(0, Math.max(minY, ty)),
  };
}

/**
 * Zoom from `currentScale` toward `nextScale` (clamped to [min, max]) about
 * the stage center, so the framed subject stays put as the slider/wheel
 * moves. Returns the new scale and the recentered, clamped offset.
 */
export function zoomAround(
  currentScale: number,
  nextScale: number,
  tx: number,
  ty: number,
  natW: number,
  natH: number,
  stage: number,
  minScale: number,
  maxScale: number
): { scale: number; tx: number; ty: number } {
  const clampedScale = Math.min(maxScale, Math.max(minScale, nextScale));
  const ratio = currentScale === 0 ? 1 : clampedScale / currentScale;
  const c = stage / 2;
  const rawTx = c - (c - tx) * ratio;
  const rawTy = c - (c - ty) * ratio;
  const drawW = natW * clampedScale;
  const drawH = natH * clampedScale;
  const clamped = clampOffset(rawTx, rawTy, drawW, drawH, stage);
  return { scale: clampedScale, tx: clamped.tx, ty: clamped.ty };
}

/**
 * The `drawImage(img, dx, dy, dw, dh)` destination rect that reproduces the
 * on-screen transform on an `output × output` canvas. The stage→output factor
 * (`output / stage`) maps the visible crop exactly to the exported pixels.
 */
export function outputRect(
  tx: number,
  ty: number,
  drawW: number,
  drawH: number,
  stage: number,
  output: number
): { dx: number; dy: number; dw: number; dh: number } {
  const k = output / stage;
  return { dx: tx * k, dy: ty * k, dw: drawW * k, dh: drawH * k };
}
