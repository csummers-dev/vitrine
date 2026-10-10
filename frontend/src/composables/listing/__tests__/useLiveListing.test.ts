import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope } from "vue";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ jwt: "" }) }));

import { EventStream, type EventSourceLike } from "@/api/stream";
import {
  dirFromFilesUrl,
  normalizeDir,
  useLiveListing,
  LIVE_REFRESH_DEBOUNCE_MS,
} from "@/composables/listing/useLiveListing";

class Src implements EventSourceLike {
  readyState = 1;
  onopen = null;
  onerror = null;
  listeners = new Map<string, (ev: MessageEvent) => void>();
  addEventListener(t: string, l: (ev: MessageEvent) => void) {
    this.listeners.set(t, l);
  }
  close() {}
  emit(dir: string, names: string[] = []) {
    this.listeners.get("files.changed")?.({
      data: JSON.stringify({ dir, names }),
    } as MessageEvent);
  }
}

let src: Src;
function setup(current: string | null, paneB: string | null = null) {
  const stream = new EventStream({
    url: "/s",
    createSource: () => (src = new Src()),
    doc: {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Document,
  });
  const deps = {
    currentDir: () => current,
    paneBDir: () => paneB,
    refreshCurrent: vi.fn(),
    refreshPaneB: vi.fn(),
    stream,
  };
  const scope = effectScope();
  scope.run(() => useLiveListing(deps));
  return { deps, scope, stream };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("path helpers", () => {
  it("normalizes folders", () => {
    expect(normalizeDir("/Movies/")).toBe("/Movies");
    expect(normalizeDir("Movies")).toBe("/Movies");
    expect(normalizeDir("/")).toBe("/");
    expect(normalizeDir("")).toBe("/");
  });

  it("turns a pane URL into a folder", () => {
    expect(dirFromFilesUrl("/files/My%20Movies/")).toBe("/My Movies");
    expect(dirFromFilesUrl("/files/")).toBe("/");
    expect(dirFromFilesUrl("/share/abc")).toBeNull();
  });
});

describe("useLiveListing", () => {
  it("refreshes the open folder once per burst", () => {
    const { deps } = setup("/Movies/");
    src.emit("/Movies", ["a.mkv"]);
    src.emit("/Movies", ["b.mkv"]);
    src.emit("/Movies/", ["c.mkv"]);
    expect(deps.refreshCurrent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS);
    expect(deps.refreshCurrent).toHaveBeenCalledTimes(1);

    src.emit("/Movies");
    vi.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS);
    expect(deps.refreshCurrent).toHaveBeenCalledTimes(2);
  });

  it("ignores changes to folders that aren't on screen", () => {
    const { deps } = setup("/Movies");
    src.emit("/Music", ["x.flac"]);
    src.emit("/Movies/Extras", ["y.mkv"]);
    vi.advanceTimersByTime(1000);
    expect(deps.refreshCurrent).not.toHaveBeenCalled();
  });

  it("refreshes the second pane in split view", () => {
    const { deps } = setup("/Movies", "/Music");
    src.emit("/Music", ["x.flac"]);
    vi.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS);
    expect(deps.refreshPaneB).toHaveBeenCalledTimes(1);
    expect(deps.refreshCurrent).not.toHaveBeenCalled();
  });

  it("stops listening and cancels pending refreshes when unmounted", () => {
    const { deps, scope, stream } = setup("/Movies");
    src.emit("/Movies");
    scope.stop();
    vi.advanceTimersByTime(1000);
    expect(deps.refreshCurrent).not.toHaveBeenCalled();
    expect(stream.connected).toBe(false);
  });
});
