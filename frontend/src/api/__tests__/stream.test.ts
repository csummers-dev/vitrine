import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope } from "vue";
import { EventStream, type EventSourceLike } from "@/api/stream";
import { useServerEvents } from "@/composables/useServerEvents";

class FakeSource implements EventSourceLike {
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  listeners = new Map<string, (ev: MessageEvent) => void>();
  constructor(public url: string) {}
  addEventListener(type: string, l: (ev: MessageEvent) => void) {
    this.listeners.set(type, l);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({
      data: typeof data === "string" ? data : JSON.stringify(data),
    } as MessageEvent);
  }
  fail() {
    this.readyState = 2;
    this.onerror?.(new Event("error"));
  }
}

function fakeDoc() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    setVisibility(v: DocumentVisibilityState) {
      this.visibilityState = v;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

let sources: FakeSource[];
let doc: ReturnType<typeof fakeDoc>;
function make() {
  return new EventStream({
    url: "/api/events/stream",
    createSource: (u) => {
      const s = new FakeSource(u);
      sources.push(s);
      return s;
    },
    random: () => 0.5, // no jitter
    hiddenGraceMs: 1000,
    doc: doc as unknown as Document,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sources = [];
  doc = fakeDoc();
});
afterEach(() => vi.useRealTimers());

describe("EventStream", () => {
  it("connects on the first subscriber and closes after the last", () => {
    const s = make();
    expect(sources).toHaveLength(0);
    const offA = s.on("files.changed", () => {});
    const offB = s.on("job.progress", () => {});
    expect(sources).toHaveLength(1);
    offA();
    expect(sources[0].closed).toBe(false);
    offB();
    expect(sources[0].closed).toBe(true);
    expect(doc.listenerCount()).toBe(0);
  });

  it("delivers parsed payloads to handlers of that type only", () => {
    const s = make();
    const changed = vi.fn();
    const job = vi.fn();
    s.on("files.changed", changed);
    s.on("job.progress", job);
    sources[0].emit("files.changed", { dir: "/Movies", names: ["a.mkv"] });
    expect(changed).toHaveBeenCalledWith({ dir: "/Movies", names: ["a.mkv"] });
    expect(job).not.toHaveBeenCalled();
  });

  it("drops malformed payloads and survives a throwing handler", () => {
    const s = make();
    const good = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    s.on("files.changed", () => {
      throw new Error("boom");
    });
    s.on("files.changed", good);
    sources[0].emit("files.changed", "{not json");
    expect(good).not.toHaveBeenCalled();
    sources[0].emit("files.changed", { dir: "/", names: [] });
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("reconnects with exponential backoff, reset by a successful open", () => {
    const s = make();
    s.on("files.changed", () => {});
    sources[0].fail();
    vi.advanceTimersByTime(999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2); // after 1 s
    sources[1].fail();
    vi.advanceTimersByTime(1999);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3); // after 2 s
    sources[2].open();
    sources[2].fail();
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(4); // back to 1 s
  });

  it("caps the backoff at 30 seconds", () => {
    const s = make();
    for (let i = 0; i < 10; i++) s["attempt"]++;
    expect(s.nextDelay()).toBe(30_000);
  });

  it("ignores transient errors the browser retries by itself", () => {
    const s = make();
    s.on("files.changed", () => {});
    sources[0].readyState = 0; // CONNECTING: the browser is retrying
    sources[0].onerror?.(new Event("error"));
    vi.advanceTimersByTime(60_000);
    expect(sources).toHaveLength(1);
    expect(sources[0].closed).toBe(false);
  });

  it("closes after a grace period in a hidden tab and reopens when visible", () => {
    const s = make();
    s.on("files.changed", () => {});
    doc.setVisibility("hidden");
    vi.advanceTimersByTime(999);
    expect(sources[0].closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(sources[0].closed).toBe(true);
    doc.setVisibility("visible");
    expect(sources).toHaveLength(2);
    expect(s.connected).toBe(true);
  });

  it("a quick hide-and-return keeps the same connection", () => {
    const s = make();
    s.on("files.changed", () => {});
    doc.setVisibility("hidden");
    vi.advanceTimersByTime(500);
    doc.setVisibility("visible");
    vi.advanceTimersByTime(5000);
    expect(sources).toHaveLength(1);
    expect(sources[0].closed).toBe(false);
  });
});

describe("useServerEvents", () => {
  it("unsubscribes when its scope is disposed", () => {
    const s = make();
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useServerEvents("share.accessed", handler, s));
    expect(s.connected).toBe(true);
    sources[0].emit("share.accessed", { hash: "h", views: 1, downloads: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
    scope.stop();
    expect(s.connected).toBe(false);
  });
});
