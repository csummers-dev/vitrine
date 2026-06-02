<template>
  <Teleport to="body">
    <Transition name="palette">
      <div
        v-if="isOpen"
        class="cmd-palette__scrim"
        @click.self="close"
        @keydown.esc.stop="close"
      >
        <div
          class="cmd-palette"
          ref="paletteEl"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          @click.stop
        >
          <!-- Input row -->
          <div class="cmd-palette__input-row">
            <Icon name="search" :size="16" class="cmd-palette__input-icon" />
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="placeholder"
              class="cmd-palette__input"
              @keydown="onInputKeydown"
            />
            <kbd class="cmd-palette__kbd">esc</kbd>
          </div>

          <!-- Results -->
          <div ref="resultsEl" class="cmd-palette__results">
            <!-- G7: while a backend search is in flight, render an
                 inline loading row at the top so the palette doesn't
                 look empty during slow searches. Sits ABOVE static
                 results so the user sees "Searching…" alongside any
                 commands that already match the query — they can still
                 pick a command without waiting for file results. -->
            <div
              v-if="isSearching && flatResults.length === 0"
              class="cmd-palette__searching"
            >
              <Icon
                name="loader-circle"
                :size="14"
                class="cmd-palette__searching-spinner"
              />
              <span>Searching files…</span>
            </div>
            <div
              v-else-if="flatResults.length === 0"
              class="cmd-palette__empty"
            >
              <Icon name="search-x" :size="18" :stroke-width="1.4" />
              <span>No results for &ldquo;{{ query }}&rdquo;</span>
            </div>

            <template v-for="group in groupedResults" :key="group.id">
              <div class="cmd-palette__group-header">
                {{ group.label }}
              </div>
              <button
                v-for="cmd in group.items"
                :key="cmd.id"
                type="button"
                :class="[
                  'cmd-palette__row',
                  selectedIndex === cmd._flatIndex &&
                    'cmd-palette__row--selected',
                ]"
                :data-flat-index="cmd._flatIndex"
                @click="run(cmd)"
                @mousemove="selectedIndex = cmd._flatIndex"
              >
                <Icon
                  :name="cmd.icon"
                  :size="15"
                  :stroke-width="1.6"
                  class="cmd-palette__row-icon"
                  :style="{ color: rowIconColor(cmd) }"
                />
                <span class="cmd-palette__row-label">{{ cmd.label }}</span>
                <span v-if="cmd.hint" class="cmd-palette__row-hint">{{
                  cmd.hint
                }}</span>
              </button>
            </template>
          </div>

          <!-- Footer -->
          <div class="cmd-palette__footer">
            <span class="cmd-palette__footer-item">
              <kbd>↑</kbd><kbd>↓</kbd> navigate
            </span>
            <span class="cmd-palette__footer-item"> <kbd>↵</kbd> run </span>
            <span class="cmd-palette__footer-item"> <kbd>esc</kbd> close </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import { useCommandPalette } from "@/composables/useCommandPalette";
import { useFocusTrap } from "@/composables/useFocusTrap";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { searchSmart } from "@/utils/searchSmart";
import { useRecents } from "@/composables/useRecents";
import {
  useCommandMRU,
  STARTER_COMMAND_IDS,
} from "@/composables/useCommandMRU";
import { fileIcon as iconForFile } from "@/utils/fileIcon";
import url from "@/utils/url";
import { fileIcon } from "@/utils/fileIcon";
import {
  buildStaticCommands,
  fuzzyScore,
  groupLabel,
  groupOrder,
  type Command,
  type CommandGroup,
} from "@/utils/commands";

interface ScoredCommand extends Command {
  _score: number;
  _flatIndex: number;
}

// ── Colorful row icons ──────────────────────────────────────────────────
// Each row's icon takes a hue from the app's 6-color palette so the palette
// reads as vividly as the listing (Raycast-style). Semantic per-icon mapping
// first (delete = rose, folders = amber, code = teal, …), mirroring the file
// tile hues where it makes sense; any unmapped icon falls back to a per-group
// hue so nothing is ever flat grey. Bound inline so the color wins over the
// base `.cmd-palette__row-icon` rule (and persists on the selected row).
const ICON_HUE: Record<string, string> = {
  // Folders + creation
  folder: "var(--c-amber)",
  "folder-plus": "var(--c-amber)",
  "file-plus": "var(--c-green)",
  // File-type glyphs (from fileIcon) — track the listing tile colors
  file: "var(--c-blue)",
  "file-text": "var(--c-blue)",
  "file-pen-line": "var(--c-blue)",
  type: "var(--c-blue)",
  image: "var(--c-rose)",
  music: "var(--c-amber)",
  video: "var(--c-lilac)",
  code: "var(--c-teal)",
  terminal: "var(--c-teal)",
  sheet: "var(--c-green)",
  presentation: "var(--c-amber)",
  "file-archive": "var(--c-amber)",
  package: "var(--c-amber)",
  "package-open": "var(--c-amber)",
  disc: "var(--c-lilac)",
  unlink: "var(--c-rose)",
  // Action verbs
  download: "var(--c-blue)",
  forward: "var(--c-blue)",
  copy: "var(--c-teal)",
  pencil: "var(--c-amber)",
  "share-2": "var(--c-teal)",
  "check-check": "var(--c-green)",
  x: "var(--c-rose)",
  "rotate-ccw": "var(--c-blue)",
  "trash-2": "var(--c-rose)",
  "log-out": "var(--c-rose)",
  // Views
  list: "var(--c-blue)",
  "layout-grid": "var(--c-teal)",
  // Navigation / account
  "settings-2": "var(--c-lilac)",
  user: "var(--c-lilac)",
  users: "var(--c-blue)",
  star: "var(--c-amber)",
  search: "var(--c-blue)",
};

const GROUP_HUE: Record<string, string> = {
  quickActions: "var(--c-lilac)",
  recent: "var(--c-blue)",
  files: "var(--c-teal)",
  actions: "var(--c-green)",
  view: "var(--c-amber)",
  navigation: "var(--c-rose)",
};

const rowIconColor = (cmd: { icon: string; group: string }): string =>
  ICON_HUE[cmd.icon] ?? GROUP_HUE[cmd.group] ?? "var(--color-ink-2, #52525b)";

interface ResultGroup {
  id: CommandGroup;
  label: string;
  items: ScoredCommand[];
}

const { isOpen, query, close } = useCommandPalette();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const fileStore = useFileStore();
const layoutStore = useLayoutStore();

// File search state (live results streamed in from the backend).
const fileResults = ref<Command[]>([]);

// v1.3 S3-1: Recents log composable. Reads from user prefs; reactive,
// so the recent group updates as files are previewed.
const recents = useRecents();

// v1.3 S3-8: Palette MRU — surfaces recently-run commands (or starter
// commands for first-time users) as a top "Quick actions" group. The
// composable owns persistence; we only need to (a) read mruIds to
// build the surfaced rows and (b) call .record() on every run.
const commandMRU = useCommandMRU();

// How many recent items to surface in the palette's empty-query
// state. Smaller than the sidebar's 5 so the palette stays compact
// (the palette is meant to be navigated quickly with the keyboard).
const PALETTE_RECENT_COUNT = 5;
// G7: in-flight indicator so the palette doesn't look empty during the
// debounce + fetch window. Goes true the moment the user types (with
// enough characters) and only flips false once the fetch resolves
// (success, abort, or error).
const isSearching = ref<boolean>(false);
let searchAbortController: AbortController | null = null;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_FILE_RESULTS = 12;
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 180;

const cancelSearch = () => {
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
};

const runSearch = async (q: string) => {
  cancelSearch();
  fileResults.value = [];
  if (q.length < SEARCH_MIN_CHARS) {
    isSearching.value = false;
    return;
  }
  // Flip the indicator on immediately — the user already committed to
  // searching by typing enough characters. Don't wait for the debounce.
  isSearching.value = true;

  searchDebounceTimer = setTimeout(async () => {
    searchAbortController = new AbortController();
    const ctrl = searchAbortController;
    // Pass the raw `route.path` (e.g. "/files/Documents/Projects/"). The
    // search API internally calls `removePrefix()` which strips the first
    // two path segments — pre-stripping here causes it to strip one too
    // many and search the wrong folder.
    //
    // BUT: if the user opened the palette while previewing a single file
    // (route is e.g. "/files/Documents/report.pdf"), that path isn't a
    // directory and the search endpoint 404s. Strip the last segment in
    // that case so we search the parent folder instead. Mirrors the
    // same logic in Search.vue (the header search bar).
    let base = route.path;
    if (!fileStore.isListing) {
      base = url.removeLastDir(base) + "/";
    }
    try {
      // searchSmart routes through /api/search/recursive when the
      // query carries structured filters (tag:, ext:); otherwise it
      // falls through to the existing streaming search. Callback
      // shape is the same either way.
      await searchSmart(base, q, ctrl.signal, (hit) => {
        if (ctrl.signal.aborted) return;
        if (fileResults.value.length >= MAX_FILE_RESULTS) return;
        fileResults.value.push({
          id: `file:${hit.path}`,
          group: "files",
          label: hit.name,
          hint: hit.path,
          icon: fileIcon({
            isDir: hit.dir,
            type: hit.dir ? "dir" : "blob",
            name: hit.name,
          }),
          run: () => void router.push(hit.url),
        });
      });
    } catch (err: unknown) {
      // Abort errors are expected — swallow them. Anything else is logged
      // but shouldn't bubble (the static commands stay usable).
      if (err instanceof Error && err.name !== "AbortError") {
        console.warn("Command palette search failed:", err);
      }
    } finally {
      // Only clear the indicator if THIS request is still the active
      // one. If the user typed more during the fetch, runSearch was
      // re-entered, the abort fired, and a fresh isSearching=true was
      // set — don't clobber it with a stale finally.
      if (searchAbortController === ctrl) {
        isSearching.value = false;
      }
    }
  }, SEARCH_DEBOUNCE_MS);
};

watch(query, (q) => {
  if (!isOpen.value) return;
  runSearch(q.trim());
});

onUnmounted(() => cancelSearch());

const inputEl = ref<HTMLInputElement | null>(null);
const paletteEl = ref<HTMLElement | null>(null);
const resultsEl = ref<HTMLElement | null>(null);
const selectedIndex = ref(0);

const placeholder = computed(() => {
  const folder = fileStore.req?.name;
  return folder
    ? `Search ${folder} or run a command…`
    : "Search files or run a command…";
});

// Rebuild commands each time the palette opens (cheap; ensures fresh perms).
/** Recent-files commands surfaced when the query is empty (S3-1).
 *  Suppressed while the user is typing — search results take over the
 *  top of the list. Iterating recents directly keeps the palette in
 *  sync with the MRU log without a separate watcher. */
const recentCommands = computed<Command[]>(() => {
  if (!isOpen.value) return [];
  if (query.value.trim() !== "") return [];
  return recents.recents.value.slice(0, PALETTE_RECENT_COUNT).map((r) => ({
    id: `recent:${r.path}`,
    group: "recent" as const,
    label: r.name,
    hint: r.path,
    icon: iconForFile({ isDir: r.isDir, type: "blob", name: r.name }),
    run: () => void router.push(`/files${r.path}`),
  }));
});

/** Quick-actions row (v1.3 S3-8). Shown only when the query is empty.
 *  Maps the MRU list onto live static commands (so perm changes /
 *  contextual availability are respected — an entry only renders if
 *  the underlying command still exists). Falls back to a hardcoded
 *  starter set for first-time users with no MRU history. Capped at
 *  SURFACE_COUNT regardless of source so the row stays compact. */
const quickActionCommands = computed<Command[]>(() => {
  if (!isOpen.value) return [];
  if (query.value.trim() !== "") return [];
  const allStatic = buildStaticCommands({
    router,
    authStore,
    fileStore,
    layoutStore,
  });
  const byId = new Map(allStatic.map((c) => [c.id, c]));
  const ids =
    commandMRU.mruIds.value.length > 0
      ? commandMRU.mruIds.value
      : STARTER_COMMAND_IDS;
  const out: Command[] = [];
  for (const id of ids) {
    const cmd = byId.get(id);
    if (!cmd) continue; // command no longer available (perms / context)
    // Tag with the quickActions group so the grouping pass renders it
    // at the top. Keep the original `id` so MRU recording stays stable
    // when the user re-runs from the quick-actions surface.
    out.push({ ...cmd, group: "quickActions" });
    if (out.length >= commandMRU.SURFACE_COUNT) break;
  }
  return out;
});

const commands = computed<Command[]>(() => {
  if (!isOpen.value) return [];
  // Quick actions first (MRU / starter, only when query is empty).
  // Recent files next. File search results in the middle (only when
  // query non-empty). Static commands fill out the bottom — the
  // grouping pass below sorts by group order regardless of order
  // here, but keeping the array in display order makes the pipeline
  // easier to reason about.
  return [
    ...quickActionCommands.value,
    ...recentCommands.value,
    ...fileResults.value,
    ...buildStaticCommands({
      router,
      authStore,
      fileStore,
      layoutStore,
    }),
  ];
});

const groupedResults = computed<ResultGroup[]>(() => {
  const q = query.value.trim();
  const scored: ScoredCommand[] = [];

  for (const cmd of commands.value) {
    // File results come straight from the backend search API, which has
    // already matched against filename + path + (depending on config)
    // content. Re-running fuzzyScore against just the basename throws
    // away legitimate matches — e.g. a backend hit on a parent folder
    // name, or a content match, would have a basename the fuzzy scorer
    // can't satisfy. Trust the backend's filtering; preserve arrival
    // order with a stable positive score so file results stay at the top.
    if (
      cmd.group === "files" ||
      cmd.group === "recent" ||
      cmd.group === "quickActions"
    ) {
      // File results: trust the backend's filtering (see note below).
      // Recent + quickActions: only emitted when query is empty, so
      // fuzzy scoring is moot — preserve insertion order (MRU). All
      // three categories get a high baseline score so they outrank
      // static commands' label matches.
      scored.push({
        ...cmd,
        // Descending score by index so backend / MRU order is
        // preserved when we sort by score below. A small magnitude
        // ensures static commands with matching keywords can still
        // rank above them when the user types a command-y query.
        _score: 1_000_000 - scored.length,
        _flatIndex: 0,
      });
      continue;
    }

    // Static commands still go through fuzzy scoring against label +
    // keywords — they need it because the same registry contains
    // dozens of commands and the user types just a fragment.
    let best: number | null = fuzzyScore(q, cmd.label);
    if (cmd.keywords) {
      for (const kw of cmd.keywords) {
        const s = fuzzyScore(q, kw);
        if (s !== null && (best === null || s > best)) best = s;
      }
    }
    if (q === "") best = 0; // show everything when no query
    if (best === null) continue;
    scored.push({ ...cmd, _score: best, _flatIndex: 0 });
  }

  // When there's a query, sort by score desc and ignore group order.
  // When empty, preserve registry order within group.
  if (q !== "") {
    scored.sort((a, b) => b._score - a._score);
  }

  // Group, preserving the sorted order within each group.
  const byGroup = new Map<CommandGroup, ScoredCommand[]>();
  for (const cmd of scored) {
    if (!byGroup.has(cmd.group)) byGroup.set(cmd.group, []);
    byGroup.get(cmd.group)!.push(cmd);
  }

  const groups: ResultGroup[] = [];
  let flatIdx = 0;
  for (const groupId of groupOrder()) {
    const items = byGroup.get(groupId);
    if (!items || items.length === 0) continue;
    for (const item of items) {
      item._flatIndex = flatIdx++;
    }
    groups.push({
      id: groupId,
      label: groupLabel(groupId),
      items,
    });
  }
  return groups;
});

const flatResults = computed<ScoredCommand[]>(() =>
  groupedResults.value.flatMap((g) => g.items)
);

// Reset selection whenever the result set changes so the first item is always
// highlighted (and selectedIndex never points past the end).
watch(
  flatResults,
  (list) => {
    if (list.length === 0) {
      selectedIndex.value = 0;
    } else if (selectedIndex.value >= list.length) {
      selectedIndex.value = 0;
    }
  },
  { flush: "post" }
);

// Focus trap: cycles Tab inside the palette and restores focus to
// whatever was focused before (typically the ⌘K trigger, the inline
// Search button, or the page itself) when the palette closes.
useFocusTrap(paletteEl, isOpen);

// Open lifecycle: focus input, reset state, scroll list to top. The
// focus trap above focuses the palette container; we then push focus
// specifically into the input so the user can start typing immediately.
watch(isOpen, async (open) => {
  if (!open) {
    cancelSearch();
    fileResults.value = [];
    return;
  }
  selectedIndex.value = 0;
  await nextTick();
  inputEl.value?.focus();
  if (resultsEl.value) resultsEl.value.scrollTop = 0;
});

// Keep the selected row scrolled into view as the user navigates.
watch(selectedIndex, async () => {
  await nextTick();
  if (!resultsEl.value) return;
  const el = resultsEl.value.querySelector(
    `[data-flat-index="${selectedIndex.value}"]`
  ) as HTMLElement | null;
  if (!el) return;
  const containerTop = resultsEl.value.scrollTop;
  const containerBottom = containerTop + resultsEl.value.clientHeight;
  const elTop = el.offsetTop;
  const elBottom = elTop + el.offsetHeight;
  if (elTop < containerTop) {
    resultsEl.value.scrollTop = elTop - 8;
  } else if (elBottom > containerBottom) {
    resultsEl.value.scrollTop = elBottom - resultsEl.value.clientHeight + 8;
  }
});

const onInputKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (flatResults.value.length === 0) return;
      selectedIndex.value =
        (selectedIndex.value + 1) % flatResults.value.length;
      break;
    case "ArrowUp":
      event.preventDefault();
      if (flatResults.value.length === 0) return;
      selectedIndex.value =
        (selectedIndex.value - 1 + flatResults.value.length) %
        flatResults.value.length;
      break;
    case "Home":
      event.preventDefault();
      selectedIndex.value = 0;
      break;
    case "End":
      event.preventDefault();
      selectedIndex.value = Math.max(0, flatResults.value.length - 1);
      break;
    case "Enter": {
      event.preventDefault();
      const cmd = flatResults.value[selectedIndex.value];
      if (cmd) run(cmd);
      break;
    }
    case "Escape":
      event.preventDefault();
      close();
      break;
  }
};

const run = async (cmd: Command) => {
  // Close first so the command's side-effects (route changes, modals) take
  // over a clean stage.
  close();
  // S3-8: record into the MRU log so the next palette open surfaces
  // this command in the quick-actions row. The composable filters out
  // ephemeral IDs (file:, recent:) internally, so we can fire-and-forget
  // for every cmd type.
  commandMRU.record(cmd.id);
  try {
    await cmd.run();
  } catch (err) {
    console.error("Command failed:", cmd.id, err);
  }
};
</script>

<style scoped>
.cmd-palette__scrim {
  position: fixed;
  inset: 0;
  /* Solid scrim — no backdrop-filter. The palette content re-renders on
     every keystroke (filter-as-you-type) and a blurred backdrop forces a
     re-rasterize of everything behind on each frame. Slightly darker
     overlay compensates for the loss of the blur effect. */
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 96px 16px 16px;
  z-index: 1000;
}

.cmd-palette {
  width: 100%;
  max-width: 640px;
  max-height: min(520px, calc(100vh - 112px));
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  border-radius: 12px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

/* ── Input row ──────────────────────────────────────────────────────── */
.cmd-palette__input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-line, #ececec);
}

.cmd-palette__input-icon {
  color: var(--color-ink-3, #a1a1aa);
  flex-shrink: 0;
}

.cmd-palette__input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-family: inherit;
  color: var(--color-ink-1, #18181b);
  padding: 0;
  min-width: 0;
}

.cmd-palette__input::placeholder {
  color: var(--color-ink-3, #a1a1aa);
}

.cmd-palette__kbd {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  flex-shrink: 0;
}

/* ── Results ────────────────────────────────────────────────────────── */
.cmd-palette__results {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px 8px;
  scroll-behavior: smooth;
}

.cmd-palette__group-header {
  padding: 10px 10px 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-3, #a1a1aa);
}

.cmd-palette__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13.5px;
  color: var(--color-ink-1, #18181b);
  transition: background-color 0.06s ease;
}

.cmd-palette__row--selected {
  background: var(--color-elevated, #f4f4f5);
}

.cmd-palette__row-icon {
  color: var(--color-ink-2, #52525b);
  flex-shrink: 0;
}

.cmd-palette__row--selected .cmd-palette__row-icon {
  color: var(--color-accent, #5e6ad2);
}

.cmd-palette__row-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-palette__row-hint {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-ink-3, #a1a1aa);
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  flex-shrink: 0;
}

.cmd-palette__row--selected .cmd-palette__row-hint {
  background: var(--color-surface, #fff);
}

/* ── Empty state ────────────────────────────────────────────────────── */
.cmd-palette__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 13px;
}

/* ── Searching state (G7) ────────────────────────────────────────────
   Compact horizontal row at the top of the results list while a
   backend search is in-flight. Sized to match a regular result row so
   the layout doesn't jump when results arrive and replace it. */
.cmd-palette__searching {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  color: var(--color-ink-3, #a1a1aa);
  font-size: 12.5px;
}
.cmd-palette__searching-spinner {
  animation: cmd-palette-spin 0.9s linear infinite;
  color: var(--color-accent, #5e6ad2);
}
@keyframes cmd-palette-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cmd-palette__searching-spinner {
    animation: none;
  }
}

/* ── Footer ─────────────────────────────────────────────────────────── */
.cmd-palette__footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--color-line, #ececec);
  background: var(--color-canvas, #fafaf9);
  font-size: 11.5px;
  color: var(--color-ink-3, #a1a1aa);
}

.cmd-palette__footer-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cmd-palette__footer-item kbd {
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  line-height: 1.3;
}

/* ── Transitions ────────────────────────────────────────────────────── */
.palette-enter-active,
.palette-leave-active {
  transition: opacity var(--dur-base) ease;
}
.palette-enter-active .cmd-palette,
.palette-leave-active .cmd-palette {
  transition:
    transform 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    opacity var(--dur-base) ease;
}
.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
.palette-enter-from .cmd-palette,
.palette-leave-to .cmd-palette {
  transform: translateY(-8px) scale(0.98);
  opacity: 0;
}

/* Mobile: full-width sheet at the top */
@media (max-width: 540px) {
  .cmd-palette__scrim {
    padding: 16px 8px;
  }
  .cmd-palette {
    max-height: min(420px, calc(100vh - 32px));
  }
}
</style>
