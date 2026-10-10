import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  __resetSlideshowForTests,
  imageSlides,
  useSlideshow,
} from "@/composables/useSlideshow";

const s = (n: string) => ({ path: `/p/${n}`, name: n, modified: "" });
const slides = [s("a.jpg"), s("b.jpg"), s("c.jpg")];

beforeEach(() => {
  vi.useFakeTimers();
  __resetSlideshowForTests();
});
afterEach(() => vi.useRealTimers());

describe("useSlideshow", () => {
  it("advances on the interval and wraps around", () => {
    const sh = useSlideshow();
    sh.open(slides, 1);
    expect(sh.current.value?.name).toBe("b.jpg");
    expect(sh.counter.value).toBe("2 / 3");
    vi.advanceTimersByTime(5000);
    expect(sh.current.value?.name).toBe("c.jpg");
    vi.advanceTimersByTime(5000);
    expect(sh.current.value?.name).toBe("a.jpg");
    expect(sh.upcoming.value?.name).toBe("b.jpg");
  });

  it("pauses, changes interval, and steps by hand", () => {
    const sh = useSlideshow();
    sh.open(slides);
    sh.togglePlay();
    vi.advanceTimersByTime(60_000);
    expect(sh.current.value?.name).toBe("a.jpg");
    sh.prev();
    expect(sh.current.value?.name).toBe("c.jpg");
    sh.togglePlay();
    sh.setIntervalSec(3);
    vi.advanceTimersByTime(3000);
    expect(sh.current.value?.name).toBe("a.jpg");
  });

  it("shuffle keeps the current photo and visits all", () => {
    const sh = useSlideshow();
    sh.open(slides, 2);
    sh.toggleShuffle();
    expect(sh.current.value?.name).toBe("c.jpg");
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      seen.add(sh.current.value!.name);
      sh.next();
    }
    expect(seen.size).toBe(3);
  });

  it("close stops the timer and hides the slide", () => {
    const sh = useSlideshow();
    sh.open(slides);
    sh.close();
    expect(sh.current.value).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(sh.isOpen.value).toBe(false);
  });

  it("imageSlides keeps images in listing order", () => {
    expect(
      imageSlides([
        {
          path: "/b.png",
          name: "b.png",
          type: "image",
          isDir: false,
          modified: "",
        },
        {
          path: "/x.mp3",
          name: "x.mp3",
          type: "audio",
          isDir: false,
          modified: "",
        },
        {
          path: "/a.jpg",
          name: "a.jpg",
          type: "image",
          isDir: false,
          modified: "",
        },
      ]).map((x) => x.name)
    ).toEqual(["b.png", "a.jpg"]);
  });
});
