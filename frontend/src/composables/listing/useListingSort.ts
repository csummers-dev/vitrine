/**
 * Listing sort: the primary sort (persisted to the user server-side), an
 * optional secondary tiebreaker (persisted in preferences), the column-header
 * and Sort-popover controls, and the folder-size prefetch while sorting by
 * size. Extracted from FileListing.vue (4.0 Phase 1) with no behavior change.
 *
 * The listing calls this before building its sorted `items`, which reads
 * `secondarySort` — declaring sort state first removes the ordering hazard
 * behind the v3.1.5 blank-listing bug.
 */
import { computed, ref, watch } from "vue";
import { users } from "@/api";
import type { MenuItem } from "@/components/ContextMenu.vue";
import { useAuthStore } from "@/stores/auth";
import { useFileStore } from "@/stores/file";

export interface ListingSortDeps {
  t: (key: string) => string;
  prefs: {
    get: <T>(key: string, fallback: T) => T;
    set: (key: string, value: unknown) => Promise<void> | void;
  };
  folderSizes: {
    ensureMany: (folders: { path: string; mod: string }[]) => unknown;
  };
  showError: (e: Error | string) => void;
}

export function useListingSort(deps: ListingSortDeps) {
  const authStore = useAuthStore();
  const fileStore = useFileStore();

  const nameSorted = computed(() =>
    fileStore.req ? fileStore.req.sorting.by === "name" : false
  );

  const sizeSorted = computed(() =>
    fileStore.req ? fileStore.req.sorting.by === "size" : false
  );

  const modifiedSorted = computed(() =>
    fileStore.req ? fileStore.req.sorting.by === "modified" : false
  );

  const ascOrdered = computed(() =>
    fileStore.req ? fileStore.req.sorting.asc : false
  );

  const nameIcon = computed(() => {
    if (nameSorted.value && !ascOrdered.value) {
      return "arrow-up";
    }

    return "arrow-down";
  });

  const sizeIcon = computed(() => {
    if (sizeSorted.value && ascOrdered.value) {
      return "arrow-down";
    }

    return "arrow-up";
  });

  const modifiedIcon = computed(() => {
    if (modifiedSorted.value && ascOrdered.value) {
      return "arrow-down";
    }

    return "arrow-up";
  });

  const sort = (by: string) => {
    let asc = false;

    if (by === "name") {
      if (nameIcon.value === "arrow-up") {
        asc = true;
      }
    } else if (by === "size") {
      if (sizeIcon.value === "arrow-up") {
        asc = true;
      }
    } else if (by === "modified") {
      if (modifiedIcon.value === "arrow-up") {
        asc = true;
      }
    } else if (by === "extension") {
      // v1.3 S3-5: default to ascending alphabetical extension order
      // when first selected; subsequent clicks toggle direction. No
      // column-header for extension yet (S3-4 popover will add proper
      // direction toggling for it), so the cycle-button entry point
      // just commits ascending the first time.
      asc = true;
    }

    // Delegate to the shared dispatcher (optimistic re-sort + persist). The
    // asc above is computed from the CURRENT sort icons, so re-clicking a
    // column toggles its direction.
    void sortRaw(by as SortKey, asc);
  };

  const sortLabel = computed(() => {
    const by = fileStore.req?.sorting.by ?? "name";
    if (by === "name") return deps.t("files.name");
    if (by === "size") return deps.t("files.size");
    // "Modified" instead of "Last modified" — the longer string overflowed
    // the header sort button at near-md widths once the chevron was removed.
    if (by === "modified") return "Modified";
    // v1.3 S3-5: extension sort label. "Type" is shorter than
    // "Extension" and reads naturally in the cycle button at narrow
    // widths without needing min-width adjustment.
    if (by === "extension") return "Type";
    return by;
  });

  // Human-readable sort direction, shown in the Sort button's tooltip and the
  // popover's Direction rows. Direction persists per-user via user.sorting.asc
  // (server-side), so it sticks across folders until changed. Changing it now
  // lives inside the consolidated Sort popover (see sortMenuItems) rather than a
  // separate toolbar toggle button.
  const sortDirLabel = computed(() =>
    ascOrdered.value ? "Ascending" : "Descending"
  );

  // ── Multi-column sort popover (v1.3 S3-4) ───────────────────────────
  // Replaces the legacy cycle button (and the brief S3-5-extension
  // cycle extension). Click → ContextMenu with primary + secondary
  // criterion selection. Primary persists server-side via the existing
  // users.update flow; secondary persists client-side via
  // usePreferences and applies as an in-memory tiebreaker after fetch.

  const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
    { key: "name", label: deps.t("files.name") },
    { key: "size", label: deps.t("files.size") },
    { key: "modified", label: "Modified" },
    { key: "extension", label: "Type" },
  ];

  const sortMenuShow = ref(false);
  const sortMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });

  const openSortMenu = (event: MouseEvent) => {
    // V3-C #7: clicking the trigger again closes an open menu (toggle) instead of
    // forcing a click outside. `.stop` on the trigger hides this click from
    // ContextMenu's outside-click listener, so we have to toggle explicitly.
    if (sortMenuShow.value) {
      sortMenuShow.value = false;
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    // Anchor the popover to the bottom-left corner of the button so it
    // reads as "belongs to the button." ContextMenu's positioner clamps
    // to viewport, so right-edge overflow is auto-handled.
    sortMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
    sortMenuShow.value = true;
  };

  /** Read the saved secondary criterion (if any). Stored in prefs as a
   *  SortCriterion or null. */
  const secondarySort = computed<SortCriterion | null>(() =>
    deps.prefs.get<SortCriterion | null>("sort.secondary", null)
  );

  /** Apply the user's choice to the PRIMARY axis. Same flow as before:
   *  PUT to user.sorting + trigger a reload. */
  const setPrimarySort = (by: SortKey, asc: boolean) => {
    sortMenuShow.value = false;
    void sortRaw(by, asc);
  };

  /** Update the SECONDARY axis. Stored in prefs; no server round-trip;
   *  no reload — the items computed re-applies the tiebreaker reactively. */
  const setSecondarySort = (criterion: SortCriterion | null) => {
    sortMenuShow.value = false;
    void deps.prefs.set("sort.secondary", criterion);
  };

  /** Build the ContextMenu items array — the single consolidated Sort popover
   *  (field + direction + secondary, replacing the old two-button pair). Layout:
   *
   *    PRIMARY                ← header
   *    Name           [check] ← active field is checked
   *    Size
   *    Modified
   *    Type
   *    ────────────           ← separator
   *    DIRECTION              ← header
   *    Ascending      [check] ← active direction is checked
   *    Descending
   *    ────────────           ← separator
   *    THEN BY                ← header
   *    None           [check]
   *    Name           [arrow] ← secondary shows its own direction arrow
   *    Size
   *    Modified
   *    Type
   *
   * Picking a primary field keeps the current direction; the Direction rows
   * set it explicitly. Picking an inactive secondary sets it to ascending;
   * re-picking it flips direction. "None" clears the secondary. */
  const sortMenuItems = computed<MenuItem[]>(() => {
    const primaryBy = (fileStore.req?.sorting.by ?? "name") as SortKey;
    const primaryAsc = fileStore.req?.sorting.asc ?? false;
    const sec = secondarySort.value;

    const items: MenuItem[] = [
      { type: "header", label: "Primary" },
      ...SORT_OPTIONS.map((opt) => ({
        label: opt.label,
        // A check marks the active field. Picking a field keeps the current
        // direction; direction is set in the Direction section below.
        icon: primaryBy === opt.key ? "check" : undefined,
        action: () => {
          setPrimarySort(opt.key, primaryAsc);
        },
      })),
      { type: "separator" },
      { type: "header", label: "Direction" },
      {
        label: "Ascending",
        icon: primaryAsc ? "check" : undefined,
        action: () => setPrimarySort(primaryBy, true),
      },
      {
        label: "Descending",
        icon: !primaryAsc ? "check" : undefined,
        action: () => setPrimarySort(primaryBy, false),
      },
      { type: "separator" },
      { type: "header", label: "Then by" },
      {
        label: "None",
        icon: sec === null ? "check" : undefined,
        action: () => setSecondarySort(null),
      },
      ...SORT_OPTIONS.map((opt) => ({
        // Disable picking the same key for primary + secondary — that
        // would be a no-op tiebreaker (every primary tie also ties on
        // the same key). Greyed out so the rule is visible.
        label: opt.label,
        disabled: opt.key === primaryBy,
        icon:
          sec?.by === opt.key
            ? sec.asc
              ? "arrow-up"
              : "arrow-down"
            : undefined,
        action: () => {
          const nextAsc = sec?.by === opt.key ? !sec.asc : true;
          setSecondarySort({ by: opt.key, asc: nextAsc });
        },
      })),
    ];
    return items;
  });

  /** Pure sort dispatcher — used by the popover. The legacy `sort()`
   *  function still exists below (called by column-header clicks) and
   *  reuses this codepath internally so the persistence story is
   *  centralized. */
  const sortRaw = async (by: SortKey, asc: boolean) => {
    // Optimistic + client-authoritative: update the in-memory sorting NOW so the
    // listing and the sort icons re-order this frame (the `items` computed sorts
    // client-side). Then persist to the server so the choice sticks on the next
    // fresh load. No forced reload — the client already shows the new order, and
    // relying on a silent background reload to re-sort was the source of the
    // "sort button does nothing" bug.
    const prev = fileStore.req?.sorting;
    if (fileStore.req) fileStore.req.sorting = { by, asc };
    try {
      if (authStore.user?.id) {
        await users.update({ id: authStore.user?.id, sorting: { by, asc } }, [
          "sorting",
        ]);
      }
      // Race guard: a silent background refresh (transfer/upload/tag tick) that
      // landed WHILE the PUT was in flight calls updateRequest(), which swaps in
      // the server's PRE-update sorting and snaps the list back. The PUT has now
      // committed our value server-side, so if the current sorting is still that
      // stale pre-change value, re-assert ours locally (no reload) to win the
      // race. If it's a *different* value, the user picked another sort in the
      // meantime — leave their newer choice alone.
      const cur = fileStore.req?.sorting;
      if (
        fileStore.req &&
        cur &&
        prev &&
        cur.by === prev.by &&
        cur.asc === prev.asc &&
        (cur.by !== by || cur.asc !== asc)
      ) {
        fileStore.req.sorting = { by, asc };
      }
    } catch (e) {
      // Roll the optimistic order back so the view doesn't show a sort the
      // server never accepted.
      if (fileStore.req && prev) fileStore.req.sorting = prev;
      deps.showError(e instanceof Error ? e : String(e));
    }
  };

  // When sorting by size, prefetch EVERY folder's recursive size (not just the
  // visible rows the Size column lazy-loads) so the order is complete and
  // correct rather than settling only as the user scrolls. ensureMany skips
  // already-cached/in-flight folders and bounds concurrency, and the server
  // caches + singleflights, so repeats are cheap. Fires only while size-sort is
  // active; rows re-sort reactively as each resolves.
  //
  // Reads `fileStore.req` directly rather than the listing's sorted `items`:
  // the prefetch only needs the folder SET, not the order. (Reading `items` here
  // is what caused the v3.1.5 blank-listing bug, back when this lived in
  // FileListing.vue below the code it depended on.)
  watch(
    () => ({
      by: fileStore.req?.sorting.by,
      reqItems: fileStore.req?.items,
    }),
    ({ by, reqItems }) => {
      if (by !== "size" || !reqItems) return;
      void deps.folderSizes.ensureMany(
        reqItems
          .filter((it) => it.isDir)
          .map((d) => ({ path: d.url, mod: String(d.modified ?? "") }))
      );
    },
    { immediate: true }
  );

  return {
    nameSorted,
    sizeSorted,
    modifiedSorted,
    ascOrdered,
    nameIcon,
    sizeIcon,
    modifiedIcon,
    sort,
    sortRaw,
    sortLabel,
    sortDirLabel,
    SORT_OPTIONS,
    sortMenuShow,
    sortMenuPos,
    openSortMenu,
    secondarySort,
    setPrimarySort,
    setSecondarySort,
    sortMenuItems,
  };
}
