import { useRouter } from "vue-router";
import { usePanesStore } from "@/stores/panes";

/**
 * Accessor for "the active pane", read by the global navigation surfaces
 * (sidebar, search, command palette).
 *
 * When the split is on AND pane B is the active pane, folder navigation drives
 * pane B in place; otherwise it falls through to a normal route push, which
 * drives pane A exactly as it did before the split existed. So callers swap a
 * `router.push(folderUrl)` for `navigate(folderUrl)` and get active-pane
 * targeting for free, with single-pane behaviour byte-identical.
 *
 * Only `/files/...` folder URLs should go through here. Non-listing routes
 * (trash, settings, login) are never pane B's concern — those callers keep
 * routing directly. Opening a file/preview likewise stays a pane-A/route
 * concept (resolved in Stage 4), so this is folder navigation only.
 */
export function useActivePane() {
  const panes = usePanesStore();
  const router = useRouter();

  /** True when folder navigation should drive pane B in place rather than the
   *  route. Lets `<router-link>`-based surfaces (e.g. sidebar recents) decide
   *  whether to preventDefault and divert to pane B. */
  const targetsPaneB = () => panes.split && panes.activePane === "b";

  /** Navigate the active pane to a `/files/...` folder URL. */
  const navigate = (path: string) => {
    if (targetsPaneB()) {
      void panes.navigateB(path);
    } else if (router.currentRoute.value.fullPath !== path) {
      // Guard against NavigationDuplicated when re-opening the current folder
      // (preserves navigateFavorite's original behaviour for pane A).
      void router.push(path);
    }
  };

  return { navigate, targetsPaneB };
}
