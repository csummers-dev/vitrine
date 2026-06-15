import { describe, it, expect } from "vitest";
import {
  isPathInMove,
  isTransferRowVisible,
  shouldAutoSelectTransfer,
  transferTouchesFolder,
  rollingRate,
  etaSeconds,
  formatRate,
  formatEta,
  buildMoveCopyItems,
  TRANSFER_REVEAL_MS,
  type RateSample,
  type MoveCopySource,
} from "@/utils/transfers";
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

// Builds a settled-transfer view with just the fields the auto-select gate reads.
const settled = (over: Partial<TransferJob>): TransferJob =>
  ({
    status: "completed",
    toPaths: ["/dest/file.txt"],
    fromPaths: ["/src/file.txt"],
    ...over,
  }) as TransferJob;

describe("shouldAutoSelectTransfer", () => {
  it("does not select while still running / not completed", () => {
    expect(shouldAutoSelectTransfer(settled({ status: "running" }), [])).toBe(
      false
    );
    expect(shouldAutoSelectTransfer(settled({ status: "failed" }), [])).toBe(
      false
    );
  });

  it("does not select when the transfer produced nothing", () => {
    expect(shouldAutoSelectTransfer(settled({ toPaths: [] }), [])).toBe(false);
    expect(shouldAutoSelectTransfer(settled({ toPaths: undefined }), [])).toBe(
      false
    );
  });

  describe("cross-volume copy is auto-selected like any transfer", () => {
    it("selects a cross-volume copy (no longer gated on volume)", () => {
      // crossVolume detection was removed — a cross-volume copy now auto-selects
      // its new copies exactly like a same-volume copy, gated only by the
      // moved-on / viewing-destination logic below.
      expect(shouldAutoSelectTransfer(settled({}), [])).toBe(true);
    });
  });

  describe("user moved on", () => {
    it("selects when nothing is selected", () => {
      expect(shouldAutoSelectTransfer(settled({}), [])).toBe(true);
    });

    it("selects when the current selection IS the transfer's source", () => {
      // e.g. a same-folder copy: the source is still selected at settle.
      expect(
        shouldAutoSelectTransfer(settled({ fromPaths: ["/a", "/b"] }), [
          "/b",
          "/a", // order-independent
        ])
      ).toBe(true);
    });

    it("skips when the user selected DIFFERENT file(s) mid-transfer", () => {
      expect(
        shouldAutoSelectTransfer(settled({ fromPaths: ["/a"] }), ["/other"])
      ).toBe(false);
    });

    it("skips when the user ADDED to the selection (no longer just the source)", () => {
      expect(
        shouldAutoSelectTransfer(settled({ fromPaths: ["/a"] }), ["/a", "/b"])
      ).toBe(false);
    });

    it("with no source reported, a non-empty selection counts as moved-on (safe default)", () => {
      expect(
        shouldAutoSelectTransfer(settled({ fromPaths: undefined }), ["/x"])
      ).toBe(false);
    });
  });
});

describe("isPathInMove", () => {
  const moving = (...p: string[]) => new Set(p);

  it("matches the moved item itself (exact)", () => {
    expect(isPathInMove("/a/file.txt", moving("/a/file.txt"))).toBe(true);
    expect(isPathInMove("/a/sub", moving("/a/sub"))).toBe(true);
  });

  it("matches anything inside a moved folder, at any depth", () => {
    const m = moving("/a/sub");
    expect(isPathInMove("/a/sub/child.txt", m)).toBe(true);
    expect(isPathInMove("/a/sub/deeper/leaf.txt", m)).toBe(true);
  });

  it("does NOT match a sibling that shares a name prefix", () => {
    // "/a/sub" must not light up "/a/subtle" — the boundary is "/".
    expect(isPathInMove("/a/subtle", moving("/a/sub"))).toBe(false);
    expect(isPathInMove("/a/sub-notes.txt", moving("/a/sub"))).toBe(false);
  });

  it("does NOT match unrelated paths or a moved item's parent", () => {
    expect(isPathInMove("/b/other.txt", moving("/a/sub"))).toBe(false);
    expect(isPathInMove("/a", moving("/a/sub"))).toBe(false); // parent isn't moving
  });

  it("is empty-set safe (nothing is moving)", () => {
    expect(isPathInMove("/a/file.txt", moving())).toBe(false);
  });

  it("matches across multiple concurrent move sources", () => {
    const m = moving("/a/sub", "/c/file.txt");
    expect(isPathInMove("/a/sub/x", m)).toBe(true);
    expect(isPathInMove("/c/file.txt", m)).toBe(true);
    expect(isPathInMove("/d/y", m)).toBe(false);
  });
});

describe("transferTouchesFolder", () => {
  const move = (over: Partial<TransferJob> = {}): TransferJob =>
    ({
      kind: "move",
      fromPaths: [],
      toPaths: [],
      dest: "",
      ...over,
    }) as TransferJob;
  const copy = (over: Partial<TransferJob> = {}): TransferJob =>
    ({
      kind: "copy",
      fromPaths: [],
      toPaths: [],
      dest: "",
      ...over,
    }) as TransferJob;

  it("matches the DESTINATION folder where items land (move + copy)", () => {
    const j = { toPaths: ["/dst/a.txt", "/dst/b.txt"], dest: "/dst" };
    expect(transferTouchesFolder(move(j), "/dst")).toBe(true);
    expect(transferTouchesFolder(copy(j), "/dst")).toBe(true);
  });

  it("matches the SOURCE folder for a move, but NOT for a copy", () => {
    const fromPaths = ["/src/a.txt"];
    expect(transferTouchesFolder(move({ fromPaths }), "/src")).toBe(true);
    // a copy leaves the source in place — nothing changes there
    expect(transferTouchesFolder(copy({ fromPaths }), "/src")).toBe(false);
  });

  it("matches a folder you've browsed INTO at either end", () => {
    // inside a folder being created at the destination → its children appear
    expect(
      transferTouchesFolder(copy({ toPaths: ["/dst/sub"] }), "/dst/sub")
    ).toBe(true);
    expect(
      transferTouchesFolder(copy({ toPaths: ["/dst/sub"] }), "/dst/sub/deep")
    ).toBe(true);
    // inside a folder being moved away → its children leave
    expect(
      transferTouchesFolder(move({ fromPaths: ["/src/sub"] }), "/src/sub")
    ).toBe(true);
  });

  it("falls back to dest when toPaths are absent (e.g. a pending placeholder)", () => {
    expect(transferTouchesFolder(move({ dest: "/dst" }), "/dst")).toBe(true);
  });

  it("ignores an unrelated folder, and respects the '/' boundary", () => {
    const j = move({
      fromPaths: ["/src/a"],
      toPaths: ["/dst/a"],
      dest: "/dst",
    });
    expect(transferTouchesFolder(j, "/elsewhere")).toBe(false);
    // "/dst" must not match the sibling "/dstuff"
    expect(transferTouchesFolder(move({ dest: "/dst" }), "/dstuff")).toBe(
      false
    );
  });

  it("tolerates a trailing slash on the current folder", () => {
    expect(
      transferTouchesFolder(
        copy({ toPaths: ["/dst/a.txt"], dest: "/dst" }),
        "/dst/"
      )
    ).toBe(true);
  });
});

describe("rollingRate", () => {
  const s = (t: number, bytes: number): RateSample => ({ t, bytes });

  it("returns 0 with fewer than two samples (no signal yet)", () => {
    expect(rollingRate([])).toBe(0);
    expect(rollingRate([s(0, 0)])).toBe(0);
  });

  it("computes bytes/sec from the spanning samples", () => {
    // 1000 bytes over 1s = 1000 B/s.
    expect(rollingRate([s(0, 0), s(1000, 1000)])).toBe(1000);
  });

  it("spans the rolling window, excluding a burst older than windowMs", () => {
    // A fast first second (1000 B) is OLDER than the 3s window and must not
    // inflate the current rate: the anchor is the first sample at/after the
    // window edge (t=1000), so we measure t=1000→4000 → 300 B over 3s = 100 B/s,
    // reflecting the recent slow phase rather than the cumulative ~325 B/s.
    const samples = [
      s(0, 0),
      s(1000, 1000), // fast burst — excluded (lands on the window edge as anchor)
      s(2000, 1100),
      s(3000, 1200),
      s(4000, 1300), // recent: ~100 B/s
    ];
    expect(rollingRate(samples, 3000)).toBe(100);
  });

  it("returns 0 on a stall or a backward byte count (e.g. a retry reset)", () => {
    expect(rollingRate([s(0, 5000), s(1000, 5000)])).toBe(0); // no progress
    expect(rollingRate([s(0, 5000), s(1000, 1000)])).toBe(0); // went backward
  });
});

describe("etaSeconds", () => {
  it("returns whole seconds remaining at the given rate", () => {
    // 5000 of 10000 bytes done, 1000 B/s → 5000 remaining / 1000 = 5s.
    expect(etaSeconds(5000, 10000, 1000)).toBe(5);
  });

  it("rounds up to a 1s floor for a near-complete transfer", () => {
    expect(etaSeconds(9990, 10000, 1000)).toBe(1);
  });

  it("returns null when it can't be estimated", () => {
    expect(etaSeconds(0, 10000, 0)).toBeNull(); // no rate
    expect(etaSeconds(0, 0, 1000)).toBeNull(); // unknown total
    expect(etaSeconds(10000, 10000, 1000)).toBeNull(); // already complete
  });

  it("returns null rather than an absurd multi-day ETA at a near-zero rate", () => {
    // 1 TB remaining at 1 B/s would be ~31000 years — capped to null.
    expect(etaSeconds(0, 1_000_000_000_000, 1)).toBeNull();
  });
});

describe("formatRate", () => {
  // A trivial filesize stand-in so the test doesn't depend on the real one.
  const fs = (n: number) => `${n}B`;

  it("appends /s to the formatted byte rate", () => {
    expect(formatRate(1500, fs)).toBe("1500B/s");
  });
});

describe("formatEta", () => {
  it("shows seconds under a minute", () => {
    expect(formatEta(8)).toBe("8s left");
    expect(formatEta(59)).toBe("59s left");
  });

  it("shows whole minutes under an hour", () => {
    expect(formatEta(180)).toBe("3m left");
  });

  it("shows hours and minutes past an hour, dropping a zero minute", () => {
    expect(formatEta(3840)).toBe("1h 4m left"); // 1h 04m
    expect(formatEta(3600)).toBe("1h left"); // exactly an hour
  });
});

describe("buildMoveCopyItems (move/copy destination math)", () => {
  const src = (over: Partial<MoveCopySource>): MoveCopySource => ({
    url: "/files/A/file.txt",
    name: "file.txt",
    isDir: false,
    size: 10,
    modified: "2020-01-01T00:00:00.000Z",
    ...over,
  });

  it("sets each item's `to` = dest folder + its URL-encoded name", () => {
    const items = buildMoveCopyItems(
      [src({ url: "/files/A/My Doc.txt", name: "My Doc.txt" })],
      "/files/B/"
    );
    expect(items[0].from).toBe("/files/A/My Doc.txt");
    expect(items[0].to).toBe("/files/B/My%20Doc.txt");
  });

  it("carries name/size/modified/isDir and defaults overwrite+rename to false", () => {
    const items = buildMoveCopyItems(
      [src({ url: "/files/A/sub", name: "sub", isDir: true, size: 0 })],
      "/files/B/"
    );
    expect(items[0]).toMatchObject({
      from: "/files/A/sub",
      to: "/files/B/sub",
      name: "sub",
      size: 0,
      isDir: true,
      overwrite: false,
      rename: false,
    });
  });

  it("encodes unicode + reserved chars and maps every item", () => {
    const items = buildMoveCopyItems(
      [
        src({ url: "/files/A/café.txt", name: "café.txt" }),
        src({ url: "/files/A/a&b.txt", name: "a&b.txt" }),
      ],
      "/files/B/"
    );
    expect(items.map((i) => i.to)).toEqual([
      "/files/B/caf%C3%A9.txt",
      "/files/B/a%26b.txt",
    ]);
  });

  it("returns [] for an empty selection", () => {
    expect(buildMoveCopyItems([], "/files/B/")).toEqual([]);
  });
});
