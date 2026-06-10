import dayjs from "dayjs";

/**
 * A relative "… ago" string that never reads as the future.
 *
 * Folder / file modified times (and trash timestamps) can land slightly AHEAD
 * of the browser clock — server↔client clock skew, or a write that completed a
 * moment ago — which makes a plain `dayjs(ts).fromNow()` say "in a few seconds"
 * for something that already happened. Clamp anything at or after "now" to now,
 * so the result is always framed as past ("a few seconds ago").
 *
 * Only use this where the timestamp is genuinely in the past (modified /
 * created / trashed). Do NOT use it for values that are meant to be future,
 * like a share's expiry — there `fromNow()` ("in 3 days") is correct.
 */
export function timeAgo(input: dayjs.ConfigType): string {
  const t = dayjs(input);
  const now = dayjs();
  return (t.isAfter(now) ? now : t).fromNow();
}
