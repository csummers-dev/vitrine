/**
 * useSlideshow — full-screen slideshow over a folder's images (4.0 Phase
 * 3.6). Module state, so the listing can open it and the Slideshow overlay
 * mounted once in the layout renders it.
 */
import { computed, ref } from "vue";

export interface Slide {
  path: string;
  name: string;
  modified: string;
}

export const SLIDE_INTERVALS = [3, 5, 10, 20] as const;

const slides = ref<Slide[]>([]);
/** Play order: indices into `slides`. */
const order = ref<number[]>([]);
const pos = ref(0);
const isOpen = ref(false);
const playing = ref(true);
const intervalSec = ref<number>(5);
const shuffle = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const current = computed<Slide | null>(() =>
  isOpen.value ? (slides.value[order.value[pos.value]] ?? null) : null
);
const upcoming = computed<Slide | null>(() => {
  if (!isOpen.value || order.value.length < 2) return null;
  return slides.value[order.value[(pos.value + 1) % order.value.length]];
});

function shuffledFrom(first: number, n: number): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

function stopTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function schedule() {
  stopTimer();
  if (!isOpen.value || !playing.value || slides.value.length < 2) return;
  timer = setTimeout(() => {
    timer = null;
    step(1);
  }, intervalSec.value * 1000);
}

function step(delta: number) {
  const n = order.value.length;
  if (n === 0) return;
  pos.value = (pos.value + delta + n) % n;
  schedule();
}

function open(list: Slide[], start = 0) {
  if (list.length === 0) return;
  slides.value = [...list];
  const first = Math.min(Math.max(start, 0), list.length - 1);
  order.value = shuffle.value
    ? shuffledFrom(first, list.length)
    : [...Array(list.length).keys()];
  pos.value = shuffle.value ? 0 : first;
  isOpen.value = true;
  playing.value = true;
  schedule();
}

function close() {
  stopTimer();
  isOpen.value = false;
}

function togglePlay() {
  playing.value = !playing.value;
  schedule();
}

function setIntervalSec(sec: number) {
  intervalSec.value = sec;
  schedule();
}

function toggleShuffle() {
  const cur = order.value[pos.value] ?? 0;
  shuffle.value = !shuffle.value;
  order.value = shuffle.value
    ? shuffledFrom(cur, slides.value.length)
    : [...Array(slides.value.length).keys()];
  pos.value = shuffle.value ? 0 : cur;
  schedule();
}

/** The slide number shown to the user (1-based, in play order). */
const counter = computed(() => `${pos.value + 1} / ${order.value.length}`);

export function useSlideshow() {
  return {
    isOpen,
    current,
    upcoming,
    playing,
    intervalSec,
    shuffle,
    counter,
    open,
    close,
    next: () => step(1),
    prev: () => step(-1),
    togglePlay,
    setIntervalSec,
    toggleShuffle,
  };
}

/** Listing items that the slideshow shows, in listing order. */
export function imageSlides(
  items: Pick<ResourceItem, "path" | "name" | "type" | "isDir" | "modified">[]
): Slide[] {
  return items
    .filter((i) => !i.isDir && i.type === "image")
    .map((i) => ({ path: i.path, name: i.name, modified: i.modified }));
}

export function __resetSlideshowForTests() {
  stopTimer();
  slides.value = [];
  order.value = [];
  pos.value = 0;
  isOpen.value = false;
  playing.value = true;
  intervalSec.value = 5;
  shuffle.value = false;
}
