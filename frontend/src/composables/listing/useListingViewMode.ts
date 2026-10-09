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
}

export function useListingViewMode(deps: ListingViewModeDeps) {
  const authStore = useAuthStore();
  const layoutStore = useLayoutStore();

  // View mode (list / grid / gallery) is a single PER-USER account preference,
  // persisted server-side via `users.update` and mirrored locally through
  // `authStore.updateUser`. It deliberately retains across folders — the chosen
  // layout is the user's, not the folder's, so navigating around never resets it.
  // (This replaces the old per-folder localStorage override.)
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
    void persistViewMode(mode as ViewModeType);
  };

  // Source of truth for the active layout. Seeded from the account default and
  // kept in sync if that default changes elsewhere (command palette, Profile, or
  // another tab via the auth store).
  const viewMode = ref<ViewModeType>(authStore.user?.viewMode ?? "list");

  watch(
    () => authStore.user?.viewMode,
    (mode) => {
      if (mode && mode !== viewMode.value) viewMode.value = mode;
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
    { key: "mosaic", label: "Grid", icon: "layout-grid" },
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
