/**
 * The listing's layout (list / grid / gallery) and the View popover that
 * switches it and toggles split view. Extracted from FileListing.vue (4.0
 * Phase 1) with no behavior change.
 */
import { computed, nextTick, ref, watch, type Ref } from "vue";
import { users } from "@/api";
import type { MenuItem } from "@/components/ContextMenu.vue";
import { useAuthStore } from "@/stores/auth";
import { useLayoutStore } from "@/stores/layout";
import { usePreferences } from "@/composables/usePreferences";

/** Preference holding each folder's own view (Decision 3). */
export const VIEW_BY_FOLDER_PREF = "view.mode.byFolder";
/** Folders remembered; the least recently set drop off. */
export const VIEW_BY_FOLDER_MAX = 500;

/**
 * The key a folder's view is stored under: the decoded path with no trailing
 * slash ("/files/My docs"), so "/files/My%20docs/" and "/files/My docs" are
 * the same folder.
 */
export function folderViewKey(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    /* a stray % — keep it as typed */
  }
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** Records `mode` for `folder`, newest last, capped at VIEW_BY_FOLDER_MAX. */
export function rememberFolderView(
  map: Record<string, string>,
  folder: string,
  mode: string,
  max = VIEW_BY_FOLDER_MAX
): Record<string, string> {
  const next = { ...map };
  delete next[folder];
  next[folder] = mode;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) delete next[k];
  return next;
}

export interface ListingViewModeDeps {
  split: {
    available: Readonly<Ref<boolean>>;
    active: Readonly<Ref<boolean>>;
    toggle: () => void;
  };
  /** Re-size tiles and re-window rows right after a switch. */
  onLayoutChange: () => void;
  /** Re-measure the grid once the new layout has rendered. */
  onViewModeRendered: () => void;
  /**
   * The folder on screen. When given, a switch is remembered for that folder
   * only (preferences), and folders never switched use the account default.
   * Without it the switch changes the account default (older callers).
   */
  folder?: () => string;
}

export function useListingViewMode(deps: ListingViewModeDeps) {
  const authStore = useAuthStore();
  const layoutStore = useLayoutStore();
  const prefs = usePreferences();

  const folderViews = () =>
    prefs.get<Record<string, string>>(VIEW_BY_FOLDER_PREF, {}) ?? {};
  const isMode = (m: unknown): m is ViewModeType =>
    m === "list" || m === "mosaic" || m === "mosaic gallery";
  /** The view for the folder on screen: its own, else the account's. */
  const resolved = (): ViewModeType => {
    const own = deps.folder
      ? folderViews()[folderViewKey(deps.folder())]
      : undefined;
    return isMode(own) ? own : (authStore.user?.viewMode ?? "list");
  };

  // The account default view (Profile, and callers without a folder),
  // persisted server-side via `users.update` and mirrored locally through
  // `authStore.updateUser`. Folders switched in the listing keep their own.
  const persistViewMode = async (mode: ViewModeType) => {
    if (!authStore.user) return;
    const data = { id: authStore.user.id, viewMode: mode };
    try {
      await users.update(data, ["viewMode"]);
    } catch {
      // Failing to persist shouldn't block the visible switch — the optimistic
      // ref update below already applied it for this session.
    }
    authStore.updateUser(data);
  };

  const setView = async (mode: string) => {
    if (!authStore.user) return;
    if (viewMode.value === mode) return;
    layoutStore.closeHovers();
    viewMode.value = mode as ViewModeType; // optimistic — show immediately
    deps.onLayoutChange();
    if (deps.folder) {
      void prefs.set(
        VIEW_BY_FOLDER_PREF,
        rememberFolderView(folderViews(), folderViewKey(deps.folder()), mode)
      );
    } else {
      void persistViewMode(mode as ViewModeType);
    }
  };

  // Source of truth for the active layout: the folder's own view, else the
  // account default; follows navigation and changes made elsewhere
  // (command palette, Profile, another tab).
  const viewMode = ref<ViewModeType>(resolved());

  watch(
    () => [
      authStore.user?.viewMode,
      deps.folder?.(),
      deps.folder ? folderViews()[folderViewKey(deps.folder())] : undefined,
    ],
    () => {
      const mode = resolved();
      if (mode !== viewMode.value) viewMode.value = mode;
    }
  );

  // CH-1: a view-mode switch (list ↔ grid ↔ gallery) changes the tile
  // dimensions + column count. Re-measure + re-window AFTER the DOM has
  // re-rendered with the new mode's classes (so the grid metrics are read
  // from the correct layout, not the outgoing one).
  watch(viewMode, () => {
    nextTick(() => deps.onViewModeRendered());
  });

  // ── View menu (v2.7.2 header declutter) ────────────────────────────
  // One popover replaces the 3-button layout switcher + the split toggle —
  // the cluster read as a crowd. Same anchoring + toggle-on-reclick
  // conventions as the Sort popover; a check marks the active choice.
  const VIEW_OPTIONS = [
    { key: "list", label: "List", icon: "list" },
    { key: "mosaic", label: "Icons", icon: "layout-grid" },
    { key: "mosaic gallery", label: "Gallery", icon: "image" },
  ] as const;

  const viewMenuShow = ref(false);
  const viewMenuPos = ref({ x: 0, y: 0 });

  const viewModeIcon = computed(
    () => VIEW_OPTIONS.find((o) => o.key === viewMode.value)?.icon ?? "list"
  );
  const viewModeLabel = computed(
    () => VIEW_OPTIONS.find((o) => o.key === viewMode.value)?.label ?? "List"
  );

  const openViewMenu = (event: MouseEvent) => {
    if (viewMenuShow.value) {
      viewMenuShow.value = false;
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    viewMenuPos.value = { x: rect.left, y: rect.bottom + 4 };
    viewMenuShow.value = true;
  };

  const viewMenuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [
      { type: "header", label: "Layout" },
      ...VIEW_OPTIONS.map((o) => ({
        label: o.label,
        icon: viewMode.value === o.key ? "check" : o.icon,
        action: () => void setView(o.key),
      })),
    ];
    if (deps.split.available.value) {
      items.push(
        { type: "separator" },
        {
          label: deps.split.active.value ? "Close split view" : "Split view",
          icon: deps.split.active.value ? "check" : "columns-2",
          action: () => deps.split.toggle(),
        }
      );
    }
    return items;
  });

  return {
    viewMode,
    setView,
    persistViewMode,
    VIEW_OPTIONS,
    viewMenuShow,
    viewMenuPos,
    viewModeIcon,
    viewModeLabel,
    openViewMenu,
    viewMenuItems,
  };
}
