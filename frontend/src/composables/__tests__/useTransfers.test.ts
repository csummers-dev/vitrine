import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/api/jobs", () => ({
  startJob: vi.fn(),
  listJobs: vi.fn(),
  cancelJob: vi.fn(),
  dismissJob: vi.fn(),
  retryJob: vi.fn(),
}));

import * as jobsApi from "@/api/jobs";
import type { TransferJob } from "@/api/jobs";
import {
  useTransfers,
  __resetTransfersForTests,
} from "@/composables/useTransfers";

const job = (over: Partial<TransferJob> = {}): TransferJob => ({
  id: "j1",
  kind: "move",
  status: "running",
  name: "a",
  dest: "/d",
  itemCount: 1,
  totalBytes: 100,
  doneBytes: 50,
  fileCount: 1,
  filesDone: 0,
  currentName: "a",
  currentTo: "/d/a",
  createdAt: "",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  __resetTransfersForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  __resetTransfersForTests();
  vi.useRealTimers();
});

describe("useTransfers", () => {
  it("bootstrap rehydrates the list from the server", async () => {
    vi.mocked(jobsApi.listJobs).mockResolvedValue([job()]);
    const t = useTransfers();
    await t.bootstrap();
    expect(t.jobs.value).toHaveLength(1);
    expect(jobsApi.listJobs).toHaveBeenCalledTimes(1);
  });

  it("bootstrap is idempotent (only rehydrates once)", async () => {
    vi.mocked(jobsApi.listJobs).mockResolvedValue([]);
    const t = useTransfers();
    await t.bootstrap();
    await t.bootstrap();
    expect(jobsApi.listJobs).toHaveBeenCalledTimes(1);
  });

  it("polls while a job is active and stops once all are terminal", async () => {
    vi.mocked(jobsApi.listJobs)
      .mockResolvedValueOnce([job({ doneBytes: 50 })]) // bootstrap
      .mockResolvedValueOnce([job({ doneBytes: 80 })]) // tick 1
      .mockResolvedValue([job({ status: "completed", doneBytes: 100 })]); // tick 2 → terminal

    const t = useTransfers();
    await t.bootstrap();

    await vi.advanceTimersByTimeAsync(1000); // tick 1
    expect(t.jobs.value[0].doneBytes).toBe(80);

    await vi.advanceTimersByTimeAsync(1000); // tick 2 → completed → polling stops
    expect(t.jobs.value[0].status).toBe("completed");

    const calls = vi.mocked(jobsApi.listJobs).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); // no further polling
    expect(vi.mocked(jobsApi.listJobs).mock.calls.length).toBe(calls);
  });

  it("start enqueues and shows the job immediately", async () => {
    vi.mocked(jobsApi.startJob).mockResolvedValue(
      job({ id: "new", status: "queued" })
    );
    const t = useTransfers();
    const j = await t.start("copy", [{ from: "/a", to: "/b/a" }]);
    expect(j.id).toBe("new");
    expect(t.jobs.value.find((x) => x.id === "new")).toBeTruthy();
    expect(jobsApi.startJob).toHaveBeenCalledWith("copy", [
      { from: "/a", to: "/b/a" },
    ]);
  });

  it("dismiss removes the row locally and calls the API", async () => {
    vi.mocked(jobsApi.listJobs).mockResolvedValue([
      job({ id: "done", status: "completed" }),
    ]);
    vi.mocked(jobsApi.dismissJob).mockResolvedValue(undefined);
    const t = useTransfers();
    await t.bootstrap();
    await t.dismiss("done");
    expect(t.jobs.value.find((x) => x.id === "done")).toBeUndefined();
    expect(jobsApi.dismissJob).toHaveBeenCalledWith("done");
  });

  it("cancel calls the API then refreshes", async () => {
    vi.mocked(jobsApi.cancelJob).mockResolvedValue(undefined);
    vi.mocked(jobsApi.listJobs).mockResolvedValue([
      job({ status: "canceled" }),
    ]);
    const t = useTransfers();
    await t.cancel("j1");
    expect(jobsApi.cancelJob).toHaveBeenCalledWith("j1");
    expect(jobsApi.listJobs).toHaveBeenCalled();
  });

  it("retry swaps the old row for the fresh job and resumes polling", async () => {
    // A failed/interrupted row is showing; retry returns a brand-new running job
    // and the server has already dismissed the original.
    vi.mocked(jobsApi.listJobs).mockResolvedValue([
      job({ id: "old", status: "failed", retryable: true }),
    ]);
    vi.mocked(jobsApi.retryJob).mockResolvedValue(
      job({ id: "new", status: "queued" })
    );
    const t = useTransfers();
    await t.bootstrap();

    const j = await t.retry("old");
    expect(j.id).toBe("new");
    expect(jobsApi.retryJob).toHaveBeenCalledWith("old");
    // Old row gone, new row present.
    expect(t.jobs.value.find((x) => x.id === "old")).toBeUndefined();
    expect(t.jobs.value.find((x) => x.id === "new")).toBeTruthy();
  });

  describe("movingPaths (in-listing move shimmer)", () => {
    it("collects fromPaths of in-flight MOVE jobs", async () => {
      vi.mocked(jobsApi.listJobs).mockResolvedValue([
        job({
          id: "m",
          kind: "move",
          status: "running",
          fromPaths: ["/a/x.txt", "/a/y"],
        }),
      ]);
      const t = useTransfers();
      await t.bootstrap();
      expect([...t.movingPaths.value].sort()).toEqual(["/a/x.txt", "/a/y"]);
    });

    it("excludes COPY jobs (a copy's source isn't being moved away)", async () => {
      vi.mocked(jobsApi.listJobs).mockResolvedValue([
        job({ id: "c", kind: "copy", status: "running", fromPaths: ["/a/x"] }),
      ]);
      const t = useTransfers();
      await t.bootstrap();
      expect(t.movingPaths.value.size).toBe(0);
    });

    it("drops a move's paths once it settles (shimmer stops on completion)", async () => {
      vi.mocked(jobsApi.listJobs)
        .mockResolvedValueOnce([
          job({ id: "m", kind: "move", status: "running", fromPaths: ["/a"] }),
        ])
        .mockResolvedValue([
          job({
            id: "m",
            kind: "move",
            status: "completed",
            fromPaths: ["/a"],
          }),
        ]);
      const t = useTransfers();
      await t.bootstrap();
      expect(t.movingPaths.value.has("/a")).toBe(true);

      await vi.advanceTimersByTimeAsync(1000); // poll → completed
      expect(t.movingPaths.value.has("/a")).toBe(false);
    });
  });
});
