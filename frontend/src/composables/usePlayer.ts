/**
 * usePlayer — the app-wide audio play queue (4.0 Phase 3.5).
 *
 * One <audio> element per tab, owned here rather than by a component, so
 * playback carries on while you browse. The MiniPlayer renders it; the
 * listing's "Play folder" / "Play" / "Add to queue" actions and the album
 * header feed it.
 *
 * - Queue order is the order tracks were added; shuffle keeps a separate
 *   play order (the current track stays current when toggled).
 * - Repeat: off → stop after the last track; all → wrap; one → loop.
 * - Media Session metadata + actions, so hardware media keys and the lock
 *   screen work.
 * - In-memory, like the clipboard: survives navigation, not a reload.
 */
import { computed, ref, shallowRef } from "vue";
import { files as api } from "@/api";

export interface Track {
  path: string;
  name: string;
  modified?: string;
}

export type RepeatMode = "off" | "all" | "one";

/** The parts of HTMLAudioElement the player uses; replaceable in tests. */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, fn: () => void): void;
}

let audioFactory: () => AudioLike = () => new Audio();
let audio: AudioLike | null = null;

const queue = ref<Track[]>([]);
/** Play order: indices into `queue`. */
const order = ref<number[]>([]);
/** Position in `order` of the current track (-1: nothing loaded). */
const pos = ref(-1);
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const repeat = ref<RepeatMode>("off");
const shuffle = ref(false);
/** Builds a track's stream URL (replaced in tests). */
const urlFor = shallowRef<(t: Track) => string>((t) =>
  api.getDownloadURL(
    { path: t.path, modified: t.modified ?? "" } as ResourceItem,
    true
  )
);

const current = computed<Track | null>(() => {
  const i = order.value[pos.value];
  return i === undefined ? null : (queue.value[i] ?? null);
});
/** Queue index of the current track, or -1. */
const currentIndex = computed(() => order.value[pos.value] ?? -1);

function el(): AudioLike {
  if (audio) return audio;
  audio = audioFactory();
  audio.addEventListener("play", () => (playing.value = true));
  audio.addEventListener("pause", () => (playing.value = false));
  audio.addEventListener("timeupdate", () => {
    currentTime.value = audio!.currentTime;
  });
  audio.addEventListener("loadedmetadata", () => {
    duration.value = Number.isFinite(audio!.duration) ? audio!.duration : 0;
  });
  audio.addEventListener("ended", onEnded);
  setupMediaSession();
  return audio;
}

function shuffled(n: number, first: number, random = Math.random): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 && first < n ? [first, ...rest] : rest;
}

function rebuildOrder(keepIndex: number) {
  const n = queue.value.length;
  if (shuffle.value) {
    order.value = shuffled(n, keepIndex);
    pos.value = keepIndex >= 0 ? 0 : -1;
  } else {
    order.value = [...Array(n).keys()];
    pos.value = keepIndex;
  }
}

function load(autoplay: boolean) {
  const t = current.value;
  const a = el();
  if (!t) {
    a.pause();
    a.src = "";
    currentTime.value = 0;
    duration.value = 0;
    updateMediaSession();
    return;
  }
  a.src = urlFor.value(t);
  currentTime.value = 0;
  duration.value = 0;
  updateMediaSession();
  if (autoplay) {
    a.play().catch(() => {
      /* autoplay blocked: the user presses play */
    });
  }
}

/** Replace the queue and start playing at `start` (a queue index). */
function playTracks(
  tracks: Track[],
  start = 0,
  opts: { shuffle?: boolean } = {}
) {
  if (tracks.length === 0) return;
  queue.value = [...tracks];
  if (opts.shuffle !== undefined) shuffle.value = opts.shuffle;
  const first = opts.shuffle
    ? Math.floor(Math.random() * tracks.length)
    : Math.min(Math.max(start, 0), tracks.length - 1);
  rebuildOrder(first);
  load(true);
}

/** Append tracks; starts playback when the queue was empty. */
function enqueue(tracks: Track[]) {
  if (tracks.length === 0) return;
  const wasEmpty = queue.value.length === 0;
  const base = queue.value.length;
  queue.value = [...queue.value, ...tracks];
  const added = tracks.map((_, i) => base + i);
  if (shuffle.value) {
    // Shuffle the new tracks into the part not yet played.
    const upcoming = order.value.slice(pos.value + 1).concat(added);
    for (let i = upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    order.value = [...order.value.slice(0, pos.value + 1), ...upcoming];
  } else {
    order.value = [...order.value, ...added];
  }
  if (wasEmpty) {
    pos.value = 0;
    load(true);
  }
}

function toggle() {
  const a = el();
  if (!current.value) return;
  if (a.paused) a.play().catch(() => {});
  else a.pause();
}

function pause() {
  audio?.pause();
}

/** Next track; wraps with repeat all. Returns false at the end. */
function next(fromEnded = false): boolean {
  if (pos.value + 1 < order.value.length) {
    pos.value++;
  } else if (repeat.value === "all" && order.value.length > 0) {
    pos.value = 0;
  } else {
    if (fromEnded) playing.value = false;
    return false;
  }
  load(true);
  return true;
}

/** Previous track, or restart this one when more than 3 s in. */
function prev() {
  const a = el();
  if (a.currentTime > 3 || pos.value <= 0) {
    a.currentTime = 0;
    return;
  }
  pos.value--;
  load(true);
}

/** Jump to a queue index. */
function playAt(index: number) {
  const p = order.value.indexOf(index);
  if (p < 0) return;
  pos.value = p;
  load(true);
}

function seek(t: number) {
  const a = el();
  a.currentTime = Math.max(0, Math.min(t, duration.value || t));
  currentTime.value = a.currentTime;
}

function removeAt(index: number) {
  if (index < 0 || index >= queue.value.length) return;
  const wasCurrent = index === currentIndex.value;
  queue.value = queue.value.filter((_, i) => i !== index);
  const p = order.value.indexOf(index);
  order.value = order.value
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));
  if (p < pos.value) pos.value--;
  if (wasCurrent) {
    if (pos.value >= order.value.length) pos.value = order.value.length - 1;
    load(playing.value);
  }
  if (queue.value.length === 0) clear();
}

function clear() {
  queue.value = [];
  order.value = [];
  pos.value = -1;
  load(false);
}

function cycleRepeat() {
  repeat.value =
    repeat.value === "off" ? "all" : repeat.value === "all" ? "one" : "off";
}

function toggleShuffle() {
  shuffle.value = !shuffle.value;
  rebuildOrder(currentIndex.value);
}

function onEnded() {
  if (repeat.value === "one" && audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  next(true);
}

// ── Media Session ────────────────────────────────────────────────────
function setupMediaSession() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
  if (!ms?.setActionHandler) return;
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(a, h);
    } catch {
      /* action unsupported by this browser */
    }
  };
  set("play", () => toggle());
  set("pause", () => pause());
  set("nexttrack", () => void next());
  set("previoustrack", () => prev());
  set("seekto", (d) => {
    if (typeof d.seekTime === "number") seek(d.seekTime);
  });
}

function updateMediaSession() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
  if (!ms || typeof MediaMetadata === "undefined") return;
  const t = current.value;
  if (!t) {
    ms.metadata = null;
    return;
  }
  const folder = t.path.split("/").slice(-2, -1)[0] ?? "";
  ms.metadata = new MediaMetadata({
    title: t.name.replace(/\.[^.]+$/, ""),
    album: folder,
    artwork: [
      {
        src: api.getPreviewURL(
          { path: t.path, modified: t.modified ?? "" } as ResourceItem,
          "thumb"
        ),
        sizes: "256x256",
        type: "image/jpeg",
      },
    ],
  });
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** A folder's audio files as tracks, in natural name order ("2" < "10"). */
export function audioTracks(
  items: Pick<ResourceItem, "path" | "name" | "type" | "isDir" | "modified">[]
): Track[] {
  return items
    .filter((i) => !i.isDir && i.type === "audio")
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((i) => ({ path: i.path, name: i.name, modified: i.modified }));
}

/** Fetch a folder and return its audio tracks. */
export async function folderTracks(folderUrl: string): Promise<Track[]> {
  const res = await api.fetch(folderUrl);
  return res.isDir ? audioTracks(res.items) : [];
}

export function usePlayer() {
  return {
    queue,
    order,
    current,
    currentIndex,
    playing,
    currentTime,
    duration,
    repeat,
    shuffle,
    playTracks,
    enqueue,
    toggle,
    pause,
    next: () => next(),
    prev,
    playAt,
    seek,
    removeAt,
    clear,
    cycleRepeat,
    toggleShuffle,
  };
}

/** Pause the queue (e.g. when a preview starts its own playback). */
export function pausePlayer() {
  audio?.pause();
}

/** Test hooks. */
export function __resetPlayerForTests(
  factory: () => AudioLike,
  url: (t: Track) => string = (t) => t.path
) {
  audioFactory = factory;
  audio = null;
  urlFor.value = url;
  queue.value = [];
  order.value = [];
  pos.value = -1;
  playing.value = false;
  currentTime.value = 0;
  duration.value = 0;
  repeat.value = "off";
  shuffle.value = false;
}
