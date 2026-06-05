/**
 * useCommandMRU — MRU log of recently-run palette commands (v1.3 S3-8).
 *
 * Distinct from `useRecents` (which tracks recently-VIEWED files) — this
 * log is just command IDs (e.g. "action.newFolder", "view.list") plus
 * timestamps, so the palette can surface the user's most-frequent
 * command shortcuts at the very top when they open it with no query.
 *
 * Persisted via `usePreferences` under the key `paletteMRU`. Server
 * side, behind the same optimistic + debounced + rollback machinery
 * as every other Stage 1 preference, so MRU travels with the user
 * across devices.
 *
 * Storage cap is intentionally larger than the surface count so the
 * MRU dedup has a useful look-back window (a stale entry that's been
 * push out of view doesn't reappear just because the user hasn't run
 * the displaced command recently).
 */
import { computed } from "vue";
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "paletteMRU";
/** Maximum entries we keep in storage. Larger than SURFACE_COUNT so
 *  reorderings push old IDs further down the list before eviction. */
const MAX_ENTRIES = 12;
/** How many MRU rows the palette renders in the "Quick actions" group
 *  when the user opens it with an empty query. Mirrors the spec's
 *  "5 starter commands for first-time users." */
const SURFACE_COUNT = 5;

/**
 * One MRU entry. Lean shape — we only need the command id to look up
 * the live Command object at render time (perms / availability are
 * re-checked then). `usedAt` is kept for diagnostics + potential
 * future "last used X ago" hints; not currently surfaced.
 */
export interface CommandMRUEntry {
  /** Static command id, matching `Command.id` in utils/commands.ts. */
  id: string;
  /** Unix ms timestamp of the most-recent run. */
  usedAt: number;
}

/**
 * Starter command IDs used when the user has no MRU history yet. Picked
 * to be:
 *   • Always available (no permission gates that commonly fail).
 *   • Spread across surface areas (create, view, nav) so the user
 *     gets a sense of what the palette can do.
 *   • Five entries — matches SURFACE_COUNT so the quick-actions row
 *     looks consistent regardless of whether MRU or starter is active.
 */
export const STARTER_COMMAND_IDS: string[] = [
  "action.newFolder",
  "view.list",
  "view.grid",
  "nav.myFiles",
  "nav.accountSettings",
];

export function useCommandMRU() {
  const prefs = usePreferences();

  /** Reactive read of the MRU list. Defaults to [] for first-time users.
   *  Order is most-recent-first (newest at index 0). */
  const mru = computed<CommandMRUEntry[]>(() =>
    prefs.get<CommandMRUEntry[]>(PREF_KEY, [])
  );

  /** Reactive convenience: just the IDs in MRU order. Callers usually
   *  want this for matching against the live static-command set. */
  const mruIds = computed<string[]>(() => mru.value.map((e) => e.id));

  /**
   * Record a run. Promotes existing entries to the front (MRU dedup)
   * and caps at MAX_ENTRIES. Skips IDs prefixed `file:` or `recent:` —
   * those are per-file ephemerals (search hits, recent files) and
   * tracking them would crowd out the genuinely-reused command IDs.
   */
  const record = (commandId: string) => {
    // Ephemeral / file-targeted commands: don't pollute the MRU.
    if (commandId.startsWith("file:") || commandId.startsWith("recent:")) {
      return;
    }
    const now = Date.now();
    const current = prefs.get<CommandMRUEntry[]>(PREF_KEY, []);
    const filtered = current.filter((e) => e.id !== commandId);
    const next: CommandMRUEntry[] = [
      { id: commandId, usedAt: now },
      ...filtered,
    ].slice(0, MAX_ENTRIES);
    void prefs.set(PREF_KEY, next);
  };

  /** Wipe the MRU log. Wired to a future "Clear recents" affordance
   *  in Profile settings; exported now so the API surface is stable. */
  const clear = () => {
    void prefs.set(PREF_KEY, []);
  };

  return { mru, mruIds, record, clear, SURFACE_COUNT };
}
