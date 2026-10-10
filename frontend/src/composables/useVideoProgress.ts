/**
 * useVideoProgress — per-video playback position + watched state (4.0
 * Phase 3.4).
 *
 * Stored in `user.Preferences` under `video.positions` (synced across
 * devices, like epub.positions / comic.positions), keyed by file path:
 *
 *   { t: seconds, dur: seconds, at: unix-ms, watched?: true }
 *
 * - `save` records where playback is. Reaching FINISHED_RATIO of the
 *   duration marks the video watched and resets its position, so the next
 *   open starts from the top.
 * - `resumeAt` returns the position to resume from, or 0 when a video is
 *   short, barely started, nearly finished or already watched.
 * - `setWatched` is the bulk "Mark watched / unwatched" action.
 *
 * The map keeps the MAX_ENTRIES most recently updated videos.
 */
import { usePreferences } from "@/composables/usePreferences";

export const VIDEO_PREF_KEY = "video.positions";
const MAX_ENTRIES = 200;
/** Videos shorter than this always start from the top. */
export const MIN_RESUME_DURATION = 300;
/** Positions before this aren't worth resuming. */
const MIN_RESUME_POSITION = 10;
/** Share of the duration after which a video counts as watched. */
export const FINISHED_RATIO = 0.98;

export interface VideoPosition {
  t: number;
  dur: number;
  at: number;
  watched?: boolean;
}

export type VideoPositionMap = Record<string, VideoPosition>;

/** The `at` timestamp is only used for ordering, so it's injectable. */
export function useVideoProgress(now: () => number = Date.now) {
  const prefs = usePreferences();

  const all = (): VideoPositionMap =>
    prefs.get<VideoPositionMap>(VIDEO_PREF_KEY, {});

  const write = (next: VideoPositionMap) => {
    const entries = Object.entries(next);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].at - a[1].at);
      next = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    void prefs.set(VIDEO_PREF_KEY, next);
  };

  const get = (path: string): VideoPosition | undefined =>
    path ? all()[path] : undefined;

  /** Seconds to resume from, or 0 to start at the top. */
  const resumeAt = (path: string): number => {
    const p = get(path);
    if (!p || p.watched) return 0;
    if (!(p.dur >= MIN_RESUME_DURATION)) return 0;
    if (p.t < MIN_RESUME_POSITION) return 0;
    if (p.t >= p.dur * FINISHED_RATIO) return 0;
    return p.t;
  };

  /** Record the playback position. Returns true once the video counts as
   *  watched (and its position was reset). */
  const save = (path: string, t: number, dur: number): boolean => {
    if (!path || !Number.isFinite(t) || !Number.isFinite(dur) || dur <= 0)
      return false;
    const finished = t >= dur * FINISHED_RATIO;
    const prev = all()[path];
    // Short clips aren't tracked until they're finished: nothing to resume.
    if (!finished && dur < MIN_RESUME_DURATION && !prev) return false;
    write({
      ...all(),
      [path]: finished
        ? { t: 0, dur, at: now(), watched: true }
        : { t: Math.floor(t), dur, at: now(), watched: prev?.watched },
    });
    return finished;
  };

  /** Bulk mark watched (true) or unwatched (false, which also forgets the
   *  position). */
  const setWatched = (paths: string[], watched: boolean) => {
    const next = { ...all() };
    for (const p of paths) {
      if (watched)
        next[p] = { t: 0, dur: next[p]?.dur ?? 0, at: now(), watched };
      else delete next[p];
    }
    write(next);
  };

  /** Forget a video (e.g. removed from the Continue shelf). */
  const remove = (path: string) => {
    const cur = all();
    if (!(path in cur)) return;
    const next = { ...cur };
    delete next[path];
    write(next);
  };

  /** Fraction played (0..1) for a tile progress bar, or 0. */
  const fraction = (path: string): number => {
    const p = get(path);
    if (!p || p.watched || !(p.dur > 0)) return 0;
    return Math.min(1, p.t / p.dur);
  };

  const isWatched = (path: string): boolean => !!get(path)?.watched;

  return { all, get, resumeAt, save, setWatched, remove, fraction, isWatched };
}

/** "1:02:03" / "4:05" for a resume chip. */
export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
