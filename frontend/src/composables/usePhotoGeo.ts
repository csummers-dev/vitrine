/**
 * Photo locations for the photo map (4.0 Phase 3.6).
 *
 * Reads the GPS position from each photo's EXIF with exifr, which fetches
 * only the header bytes (Range requests) of the original file. Results are
 * cached per path + modified time for the tab's lifetime, so reopening the
 * map is instant.
 */
import { ref } from "vue";
import exifr from "exifr";
import { files as api } from "@/api";
import type { Slide } from "@/composables/useSlideshow";

export interface GeoPhoto extends Slide {
  lat: number;
  lon: number;
}

/** Most photos a single map reads, to bound the work on huge folders. */
export const MAX_GEO_PHOTOS = 2000;

type Reader = (
  url: string
) => Promise<{ latitude?: number; longitude?: number } | undefined>;

const cache = new Map<string, { lat: number; lon: number } | null>();

const defaultRead: Reader = (url) => exifr.gps(url);

/** Formats exifr can read a position from. */
const GEO_EXT = /\.(jpe?g|tiff?|heic|heif|avif|png|webp)$/i;

export function validCoords(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0) // "no fix" written as 0,0
  );
}

export async function locatePhotos(
  photos: Slide[],
  opts: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    read?: Reader;
    urlOf?: (s: Slide) => string;
  } = {}
): Promise<GeoPhoto[]> {
  const read = opts.read ?? defaultRead;
  const urlOf =
    opts.urlOf ??
    ((s: Slide) => api.getDownloadURL({ path: s.path } as ResourceItem, true));
  const list = photos
    .filter((p) => GEO_EXT.test(p.name))
    .slice(0, MAX_GEO_PHOTOS);
  const out: GeoPhoto[] = [];
  let done = 0;
  let next = 0;

  const worker = async () => {
    while (next < list.length) {
      if (opts.signal?.aborted) return;
      const p = list[next++];
      const key = `${p.path}\u0000${p.modified}`;
      let pos = cache.get(key);
      if (pos === undefined) {
        try {
          const g = await read(urlOf(p));
          pos =
            g && validCoords(g.latitude, g.longitude)
              ? { lat: g.latitude!, lon: g.longitude! }
              : null;
        } catch {
          pos = null; // unreadable or no EXIF
        }
        cache.set(key, pos);
      }
      if (pos) out.push({ ...p, ...pos });
      done++;
      opts.onProgress?.(done, list.length);
    }
  };

  const n = Math.max(1, Math.min(opts.concurrency ?? 4, list.length));
  await Promise.all(Array.from({ length: n }, worker));
  // Keep listing order regardless of which worker finished first.
  const order = new Map(list.map((p, i) => [p.path, i]));
  return out.sort((a, b) => order.get(a.path)! - order.get(b.path)!);
}

/** Group points that fall within `cellPx` of each other at a zoom, given a
 *  projection to pixels. Each cluster keeps its members in input order. */
export function clusterPoints<T>(
  points: T[],
  project: (p: T) => { x: number; y: number },
  cellPx = 56
): T[][] {
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const { x, y } = project(p);
    const k = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const c = cells.get(k);
    if (c) c.push(p);
    else cells.set(k, [p]);
  }
  return [...cells.values()];
}

export function __clearGeoCacheForTests() {
  cache.clear();
}

// ── Photo map overlay state ──────────────────────────────────────────
const mapOpen = ref(false);
const mapPhotos = ref<Slide[]>([]);
const mapTitle = ref("");

export function usePhotoMap() {
  return {
    isOpen: mapOpen,
    photos: mapPhotos,
    title: mapTitle,
    open(photos: Slide[], title: string) {
      mapPhotos.value = photos;
      mapTitle.value = title;
      mapOpen.value = true;
    },
    close() {
      mapOpen.value = false;
    },
  };
}
