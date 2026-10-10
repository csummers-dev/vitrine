import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api", () => ({
  files: { getDownloadURL: vi.fn(), getPreviewURL: vi.fn(), fetch: vi.fn() },
}));

import {
  __resetPlayerForTests,
  audioTracks,
  usePlayer,
  type AudioLike,
} from "@/composables/usePlayer";

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  duration = 200;
  paused = true;
  listeners: Record<string, (() => void)[]> = {};
  play = vi.fn(async () => {
    this.paused = false;
    this.emit("play");
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit("pause");
  });
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string) {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

let audio: FakeAudio;
const t = (n: string) => ({ path: `/Album/${n}`, name: n });
const tracks = [t("01.mp3"), t("02.mp3"), t("03.mp3")];

beforeEach(() => {
  audio = new FakeAudio();
  __resetPlayerForTests(() => audio);
});

describe("usePlayer", () => {
  it("plays from the chosen track and advances on end", () => {
    const p = usePlayer();
    p.playTracks(tracks, 1);
    expect(audio.src).toBe("/Album/02.mp3");
    expect(audio.play).toHaveBeenCalled();
    expect(p.playing.value).toBe(true);
    audio.emit("ended");
    expect(p.current.value?.name).toBe("03.mp3");
    audio.emit("ended"); // last track, repeat off: stops
    expect(p.current.value?.name).toBe("03.mp3");
    expect(p.playing.value).toBe(false);
  });

  it("wraps with repeat all and loops with repeat one", () => {
    const p = usePlayer();
    p.playTracks(tracks, 2);
    p.cycleRepeat(); // all
    audio.emit("ended");
    expect(p.current.value?.name).toBe("01.mp3");
    p.cycleRepeat(); // one
    audio.currentTime = 150;
    audio.emit("ended");
    expect(p.current.value?.name).toBe("01.mp3");
    expect(audio.currentTime).toBe(0);
  });

  it("prev restarts the track after 3 s, else goes back", () => {
    const p = usePlayer();
    p.playTracks(tracks, 1);
    audio.currentTime = 10;
    p.prev();
    expect(audio.currentTime).toBe(0);
    expect(p.current.value?.name).toBe("02.mp3");
    p.prev();
    expect(p.current.value?.name).toBe("01.mp3");
  });

  it("enqueue appends and starts an empty queue", () => {
    const p = usePlayer();
    p.enqueue([tracks[0]]);
    expect(p.current.value?.name).toBe("01.mp3");
    p.enqueue([tracks[1], tracks[2]]);
    expect(p.queue.value).toHaveLength(3);
    p.next();
    expect(p.current.value?.name).toBe("02.mp3");
  });

  it("shuffle keeps the current track and plays every track once", () => {
    const p = usePlayer();
    p.playTracks(tracks, 1);
    p.toggleShuffle();
    expect(p.current.value?.name).toBe("02.mp3");
    const seen = [p.current.value!.name];
    while (p.next()) seen.push(p.current.value!.name);
    expect([...seen].sort()).toEqual(["01.mp3", "02.mp3", "03.mp3"]);
  });

  it("removing the current track moves on; removing all clears", () => {
    const p = usePlayer();
    p.playTracks(tracks, 0);
    p.removeAt(0);
    expect(p.current.value?.name).toBe("02.mp3");
    expect(p.currentIndex.value).toBe(0);
    p.removeAt(1);
    p.removeAt(0);
    expect(p.queue.value).toEqual([]);
    expect(p.current.value).toBeNull();
  });

  it("playAt jumps to a queue index", () => {
    const p = usePlayer();
    p.playTracks(tracks, 0);
    p.playAt(2);
    expect(audio.src).toBe("/Album/03.mp3");
  });
});

describe("audioTracks", () => {
  it("keeps audio files in natural order", () => {
    const items = [
      {
        path: "/a/10 - x.mp3",
        name: "10 - x.mp3",
        type: "audio",
        isDir: false,
        modified: "",
      },
      {
        path: "/a/2 - y.flac",
        name: "2 - y.flac",
        type: "audio",
        isDir: false,
        modified: "",
      },
      {
        path: "/a/cover.jpg",
        name: "cover.jpg",
        type: "image",
        isDir: false,
        modified: "",
      },
      { path: "/a/CD2", name: "CD2", type: "", isDir: true, modified: "" },
    ];
    expect(audioTracks(items).map((x) => x.name)).toEqual([
      "2 - y.flac",
      "10 - x.mp3",
    ]);
  });
});
