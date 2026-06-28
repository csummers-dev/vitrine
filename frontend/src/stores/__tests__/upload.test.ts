import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "vue";
import { createPinia, setActivePinia, type Pinia } from "pinia";

// The store posts uploads + flips toolbar button state at import/runtime; stub
// those so nothing hits the network or the DOM. POST returns a promise that
// never settles, so an upload stays "in flight" and the queue never resets —
// letting us inspect mid-upload state deterministically.
const postArgs: unknown[][] = [];
vi.mock("@/api", () => ({
  files: {
    post: vi.fn((...args: unknown[]) => {
      postArgs.push(args);
      return new Promise<void>(() => {});
    }),
    cancelUpload: vi.fn(),
  },
}));
vi.mock("@/utils/buttons", () => ({
  default: { loading: vi.fn(), success: vi.fn() },
}));
vi.mock("@/api/tus", () => ({ abortAllUploads: vi.fn() }));

import { useUploadStore } from "@/stores/upload";

let pinia: Pinia;
beforeEach(() => {
  postArgs.length = 0;
  const app = createApp({});
  pinia = createPinia();
  app.use(pinia); // gives the setup-store `inject("$showError")` an app context
  app.provide("$showError", vi.fn());
  setActivePinia(pinia);
});
afterEach(() => vi.useRealTimers());

const fakeFile = (size: number) => ({ size }) as unknown as File;

describe("upload store — displayedPercent", () => {
  it("is 0 when nothing is queued", () => {
    const u = useUploadStore();
    expect(u.displayedPercent).toBe(0);
  });

  it("is the sent/total ratio", () => {
    const u = useUploadStore();
    u.totalBytes = 200;
    u.sentBytes = 50;
    expect(u.displayedPercent).toBe(25);
  });

  it("clamps to 100 even if accounting overshoots", () => {
    const u = useUploadStore();
    u.totalBytes = 100;
    u.sentBytes = 250;
    expect(u.displayedPercent).toBe(100);
  });
});

describe("upload store — H10: progress never regresses when files are queued mid-upload", () => {
  it("holds the displayed percent steady after adding bytes to an in-flight queue", () => {
    vi.useFakeTimers();
    const u = useUploadStore();

    // First file (100 bytes) starts uploading.
    u.upload("/files/Dest/", "a.bin", fakeFile(100), false, "file");
    expect(u.totalBytes).toBe(100);

    // Simulate 60/100 bytes sent, then let the 1s sync interval fold it in.
    const onUpload = postArgs[0][3] as (e: { loaded: number }) => void;
    onUpload({ loaded: 60 });
    vi.advanceTimersByTime(1000);
    expect(u.sentBytes).toBe(60);
    expect(u.displayedPercent).toBe(60);

    // Add a second 100-byte file mid-upload. Raw ratio would now be
    // 60/200 = 30% — the phantom offset must keep the BAR at 60%.
    u.upload("/files/Dest/", "b.bin", fakeFile(100), false, "file");
    expect(u.totalBytes).toBe(200);
    expect(u.sentBytes).toBe(60); // real bytes-sent is unchanged
    expect(u.displayedPercent).toBe(60); // ...but the bar does NOT drop to 30
  });
});
