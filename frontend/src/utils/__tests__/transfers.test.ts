import { describe, it, expect } from "vitest";
import { isTransferRowVisible, TRANSFER_REVEAL_MS } from "@/utils/transfers";
import type { TransferJob } from "@/api/jobs";

// Only status / createdAt / finishedAt feed the reveal gate.
const job = (over: Partial<TransferJob>): TransferJob =>
  ({
    status: "running",
    createdAt: "2020-01-01T00:00:00.000Z",
    ...over,
  }) as TransferJob;

const R = TRANSFER_REVEAL_MS;

describe("isTransferRowVisible", () => {
  it("always shows failed / canceled rows (an error must never be hidden)", () => {
    expect(isTransferRowVisible(job({ status: "failed" }), undefined, 0)).toBe(
      true
    );
    expect(
      isTransferRowVisible(job({ status: "canceled" }), undefined, 0)
    ).toBe(true);
  });

  describe("finished (completed) — server-measured span", () => {
    it("hides an instant (~0ms) rename even when polled long after", () => {
      const j = job({
        status: "completed",
        createdAt: "2020-01-01T00:00:00.000Z",
        finishedAt: "2020-01-01T00:00:00.050Z", // 50ms < 350
      });
      // firstSeenAt / now are irrelevant for terminal rows — a huge `now`
      // must NOT force it visible (proves the terminal branch ignores them).
      expect(isTransferRowVisible(j, 0, 9_999_999)).toBe(false);
    });

    it("shows a transfer whose server span cleared the threshold", () => {
      const j = job({
        status: "completed",
        createdAt: "2020-01-01T00:00:00.000Z",
        finishedAt: "2020-01-01T00:00:02.000Z", // 2s
      });
      expect(isTransferRowVisible(j, undefined, 0)).toBe(true);
    });

    it("fails open (shows) when a timestamp is unparseable", () => {
      const j = job({
        status: "completed",
        createdAt: "nope",
        finishedAt: "also-nope",
      });
      expect(isTransferRowVisible(j, undefined, 0)).toBe(true);
    });
  });

  describe("running — client first-seen time (skew-immune)", () => {
    it("is hidden until first-seen is recorded", () => {
      expect(isTransferRowVisible(job({}), undefined, 1_000_000)).toBe(false);
    });

    it("hides before the threshold, shows once it elapses on this client", () => {
      const seen = 1_000_000;
      expect(isTransferRowVisible(job({}), seen, seen + R - 1)).toBe(false);
      expect(isTransferRowVisible(job({}), seen, seen + R)).toBe(true);
    });

    it("ignores the server createdAt entirely — immune to clock skew", () => {
      // Server clock runs FAR ahead (createdAt in the future vs the client).
      // The old gate compared now - createdAt and stayed hidden forever; the
      // fixed gate reveals purely on how long it's been on THIS client.
      const j = job({
        status: "running",
        createdAt: "2999-01-01T00:00:00.000Z",
      });
      const seen = 1_000_000;
      expect(isTransferRowVisible(j, seen, seen + R)).toBe(true);
    });
  });
});
