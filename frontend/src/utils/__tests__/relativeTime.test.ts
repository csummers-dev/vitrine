import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { timeAgo } from "@/utils/relativeTime";

// The app extends dayjs with relativeTime in main.ts; tests run in isolation,
// so extend here too (extend is idempotent).
dayjs.extend(relativeTime);

describe("timeAgo", () => {
  it("frames a past timestamp as '… ago'", () => {
    const past = dayjs().subtract(5, "minute").toISOString();
    expect(timeAgo(past)).toContain("ago");
  });

  it("clamps a near-future timestamp to now (never reads as future)", () => {
    // A folder mtime a few seconds ahead of the browser clock must NOT render
    // as "in a few seconds".
    const soon = dayjs().add(8, "second").toISOString();
    const out = timeAgo(soon);
    expect(out).not.toContain("in ");
    expect(out).toContain("ago");
  });

  it("clamps a far-future timestamp to now as well", () => {
    const later = dayjs().add(3, "day").toISOString();
    const out = timeAgo(later);
    expect(out).not.toContain("in ");
    expect(out).toContain("ago");
  });
});
