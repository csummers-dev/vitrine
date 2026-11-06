/**
 * Shortcut labels written once in Mac notation ("⌘⇧C") and shown in the
 * viewer's own: unchanged on a Mac, "Ctrl+Shift+C" elsewhere, where ⌘ means
 * nothing.
 */
export const isMac = /mac|iphone|ipad|ipod/i.test(
  typeof navigator === "undefined"
    ? ""
    : navigator.platform || navigator.userAgent || ""
);

const WORDS: Record<string, string> = { "⌘": "Ctrl", "⇧": "Shift", "⌥": "Alt" };

export function keyLabel(mac: string, mac_ = isMac): string {
  if (mac_) return mac;
  const parts: string[] = [];
  let rest = "";
  for (const ch of mac) {
    if (WORDS[ch]) parts.push(WORDS[ch]);
    else rest += ch;
  }
  if (rest) parts.push(rest);
  return parts.join("+");
}
