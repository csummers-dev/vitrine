/**
 * State for the listing's single right-click menu: where it is, whether it's
 * showing, and whether it targets the selection ("row") or the folder
 * ("background"). The menu contents come from the pure builders in
 * utils/listingMenus. Extracted from FileListing.vue (4.0 Phase 1).
 */
import { computed, ref } from "vue";
import type { MenuItem } from "@/components/ContextMenu.vue";

export interface ListingContextMenuDeps {
  rowItems: () => MenuItem[];
  backgroundItems: () => MenuItem[];
}

export function useListingContextMenu(deps: ListingContextMenuDeps) {
  const isContextMenuVisible = ref<boolean>(false);
  const contextMenuPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
  const contextMenuMode = ref<"row" | "background">("row");

  // Right-click on an unselected row selects it first (handled by the row);
  // on an already-selected row the multi-selection is kept. Here we only
  // decide which menu to show and where.
  const onListingContextMenu = (event: MouseEvent) => {
    // macOS synthesizes `contextmenu` from ctrl+left-click. Treat that as a
    // (multi-)select modifier, not a right-click: suppress both menus so
    // ctrl+drag can lasso and ctrl+click just toggles selection.
    event.preventDefault();
    if (event.ctrlKey) return;
    const target = event.target as HTMLElement | null;
    // The column-header row shares the `.item` class for layout reasons but
    // isn't a selectable row, so it counts as background.
    const itemEl = target?.closest?.(".item") as HTMLElement | null;
    const onRow = itemEl != null && !itemEl.classList.contains("header");
    contextMenuMode.value = onRow ? "row" : "background";
    isContextMenuVisible.value = true;
    contextMenuPos.value = {
      x: event.clientX + 8,
      y: event.clientY + Math.floor(window.scrollY),
    };
  };

  const hideContextMenu = () => {
    isContextMenuVisible.value = false;
  };

  /** Wraps menu actions so choosing any item closes the menu first. */
  const closingFirst = <T extends Record<string, (...args: never[]) => void>>(
    actions: T
  ): T =>
    Object.fromEntries(
      Object.entries(actions).map(([name, fn]) => [
        name,
        (...args: never[]) => {
          hideContextMenu();
          fn(...args);
        },
      ])
    ) as T;

  const contextMenuItems = computed<MenuItem[]>(() =>
    contextMenuMode.value === "row" ? deps.rowItems() : deps.backgroundItems()
  );

  return {
    isContextMenuVisible,
    contextMenuPos,
    contextMenuMode,
    onListingContextMenu,
    hideContextMenu,
    closingFirst,
    contextMenuItems,
  };
}
