import { describe, it, expect } from "vitest";
import { tagTriState, tagBatchDelta } from "@/utils/tagBatch";

const s = (...n: number[]) => new Set(n);

describe("tagTriState", () => {
  it("classifies on-all vs on-some vs absent", () => {
    // tag 1 on all 3; tag 2 on 2 of 3; tag 3 on 1 of 3; tag 9 on none.
    const { all, some } = tagTriState([[1, 2], [1, 2, 3], [1]]);
    expect([...all].sort()).toEqual([1]);
    expect([...some].sort()).toEqual([2, 3]);
  });

  it("dedupes repeats within a single path", () => {
    // tag 1 twice on the only path still counts as on-all, not on-some.
    const { all, some } = tagTriState([[1, 1]]);
    expect([...all]).toEqual([1]);
    expect(some.size).toBe(0);
  });

  it("empty selection yields empty sets", () => {
    const { all, some } = tagTriState([]);
    expect(all.size).toBe(0);
    expect(some.size).toBe(0);
  });
});

describe("tagBatchDelta", () => {
  it("adds a newly-checked tag that wasn't on every path", () => {
    // tag 5 was on some; user checked it → add to all. Nothing removed.
    const { add, remove } = tagBatchDelta(s(), s(5), s(5), s());
    expect(add).toEqual([5]);
    expect(remove).toEqual([]);
  });

  it("removes a previously-present tag the user unchecked", () => {
    // tag 1 was on-all, now unchecked (not in checked, not indeterminate).
    const { add, remove } = tagBatchDelta(s(1), s(), s(), s());
    expect(add).toEqual([]);
    expect(remove).toEqual([1]);
  });

  it("leaves an untouched indeterminate tag alone", () => {
    // tag 2 stays indeterminate → neither added nor removed.
    const { add, remove } = tagBatchDelta(s(), s(2), s(), s(2));
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
  });

  it("no-op when nothing changed (all stays checked)", () => {
    const { add, remove } = tagBatchDelta(s(1), s(), s(1), s());
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
  });

  it("handles a mix: add one, remove one, keep one indeterminate", () => {
    // initial: 1 on-all, 2 & 3 on-some.
    // final: 1 unchecked (remove), 2 checked (add), 3 left indeterminate (keep).
    const { add, remove } = tagBatchDelta(s(1), s(2, 3), s(2), s(3));
    expect(add).toEqual([2]);
    expect(remove).toEqual([1]);
  });
});
