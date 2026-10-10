/**
 * Saved searches, or "smart folders" (4.0 Phase 5.3).
 *
 * A saved search is a query (the same syntax the search box takes: tags,
 * type:, ext:, size:, added:, free text) plus the folder it searches. They
 * live in the user's preferences under `search.saved`, show in the sidebar
 * and the command palette, and open in the normal listing at
 * `/files/<folder>/?saved=<id>` (see utils/savedSearchListing.ts).
 */
import { computed, ref } from "vue";
import { usePreferences } from "@/composables/usePreferences";
import { encodePath } from "@/utils/url";

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  /** Scope-relative folder searched, decoded ("/" or "/Photos"). */
  folder: string;
}

export const SAVED_SEARCH_PREF = "search.saved";
export const SAVED_SEARCH_MAX = 50;

/** Starting points offered when saving and in the empty search box. */
export const SEARCH_EXAMPLES: Array<{ label: string; query: string }> = [
  { label: "Photos from the last month", query: "type:image added:30d" },
  { label: "Videos over 4 GB", query: "type:video size:>4GB" },
  { label: "Anything new this week", query: "added:7d" },
  { label: "PDFs tagged work", query: "type:pdf tag:work" },
];

/** Drop malformed entries (hand-edited or from an older client). */
export function sanitizeSaved(value: unknown): SavedSearch[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SavedSearch[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const s = v as Record<string, unknown>;
    if (
      typeof s.id !== "string" ||
      !s.id ||
      seen.has(s.id) ||
      typeof s.name !== "string" ||
      typeof s.query !== "string" ||
      typeof s.folder !== "string"
    )
      continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      name: s.name,
      query: s.query,
      folder: normalizeFolder(s.folder),
    });
  }
  return out;
}

/** "Photos/" → "/Photos"; "" → "/". */
export function normalizeFolder(folder: string): string {
  const f = ("/" + folder).replace(/\/+/g, "/").replace(/\/$/, "");
  return f === "" ? "/" : f;
}

/** Where a saved search opens in the listing. */
export function savedSearchUrl(s: Pick<SavedSearch, "id" | "folder">): string {
  const folder = normalizeFolder(s.folder);
  const base = folder === "/" ? "/files/" : `/files${encodePath(folder)}/`;
  return `${base}?saved=${encodeURIComponent(s.id)}`;
}

/** The folder name shown as "in Photos" ("My files" for the root). */
export function folderLabel(folder: string, rootLabel = "My files"): string {
  const f = normalizeFolder(folder);
  return f === "/" ? rootLabel : f.slice(f.lastIndexOf("/") + 1);
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export function useSavedSearches() {
  const prefs = usePreferences();
  const list = computed<SavedSearch[]>(() =>
    sanitizeSaved(prefs.get<unknown>(SAVED_SEARCH_PREF, []))
  );

  const get = (id: string): SavedSearch | undefined =>
    list.value.find((s) => s.id === id);

  /** Add (no id) or update (known id). Returns the stored entry. */
  const save = (
    entry: Omit<SavedSearch, "id"> & { id?: string }
  ): SavedSearch => {
    const current = list.value;
    const clean: SavedSearch = {
      id: entry.id && get(entry.id) ? entry.id : newId(),
      name: entry.name.trim() || entry.query.trim() || "Saved search",
      query: entry.query.trim(),
      folder: normalizeFolder(entry.folder),
    };
    const next = current.some((s) => s.id === clean.id)
      ? current.map((s) => (s.id === clean.id ? clean : s))
      : [...current, clean].slice(-SAVED_SEARCH_MAX);
    void prefs.set(SAVED_SEARCH_PREF, next);
    return clean;
  };

  const remove = (id: string) => {
    const current = list.value;
    if (!current.some((s) => s.id === id)) return;
    void prefs.set(
      SAVED_SEARCH_PREF,
      current.filter((s) => s.id !== id)
    );
  };

  return { list, get, save, remove };
}

// ── Save / edit dialog state (one dialog, mounted in App.vue) ─────────
const dialogOpen = ref(false);
const dialogDraft = ref<Omit<SavedSearch, "id"> & { id?: string }>({
  name: "",
  query: "",
  folder: "/",
});

export function useSaveSearchDialog() {
  return {
    isOpen: dialogOpen,
    draft: dialogDraft,
    /** Save a new search for `query` in `folder`. */
    openNew(query: string, folder: string) {
      dialogDraft.value = { name: "", query, folder: normalizeFolder(folder) };
      dialogOpen.value = true;
    },
    openEdit(s: SavedSearch) {
      dialogDraft.value = { ...s };
      dialogOpen.value = true;
    },
    close() {
      dialogOpen.value = false;
    },
  };
}
