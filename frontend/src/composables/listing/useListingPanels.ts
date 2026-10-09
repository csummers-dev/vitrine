/**
 * The listing's slide-over panels — Move/Copy, Share and Extract — and the
 * rule that only one panel (including Bulk Rename) is open at a time.
 * Extracted from FileListing.vue (4.0 Phase 1) with no behavior change.
 *
 * Same intercept pattern as delete: when one of these prompts fires from the
 * listing context, snapshot what's needed, dismiss the prompt, and open the
 * slide-over. The legacy modals stay registered in Prompts.vue only as a
 * safety net for non-listing callers.
 */
import { computed, ref, watch, type Ref } from "vue";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { unzipEnabled } from "@/utils/constants";
import { isExtractable } from "@/utils/archive";

export interface ListingPanelsDeps {
  bulkRename: { isOpen: Ref<boolean>; close: () => void };
}

export function useListingPanels(deps: ListingPanelsDeps) {
  const fileStore = useFileStore();
  const layoutStore = useLayoutStore();

  const moveCopyOpen = ref(false);
  const moveCopyMode = ref<"move" | "copy">("move");
  // Dual-pane: pane B opens the move/copy picker for ITS selection by passing an
  // `override` on the prompt. Captured here (before closeHovers clears the prompt)
  // and handed to MoveCopyPanel; null for pane A, which reads fileStore as before.
  const moveCopyOverride = ref<{
    items: {
      url: string;
      name: string;
      isDir: boolean;
      size: number;
      modified: string;
    }[];
    sourceUrl: string;
  } | null>(null);
  const shareOpen = ref(false);
  const extractOpen = ref(false);
  // BulkRenamePanel's open state lives on the `bulkRename` singleton so the
  // command palette can flip it without prop drilling; it is passed in.

  const closeMoveCopy = () => {
    moveCopyOpen.value = false;
    moveCopyOverride.value = null;
  };
  const closeShare = () => {
    shareOpen.value = false;
  };
  const closeExtract = () => {
    extractOpen.value = false;
  };

  // True when ANY of the slide-over panels is open. Drives the pill-hide
  // (so the bottom pill doesn't overlap a panel) and the one-at-a-time
  // enforcement below.
  const anyPanelOpen = computed(
    () =>
      moveCopyOpen.value ||
      shareOpen.value ||
      extractOpen.value ||
      deps.bulkRename.isOpen.value
  );

  // Only one slide-over may be open at a time. Each open-path calls this
  // first so opening (say) Rename dismisses an already-open Copy panel
  // instead of stacking them.
  const closeAllPanels = () => {
    moveCopyOpen.value = false;
    shareOpen.value = false;
    extractOpen.value = false;
    deps.bulkRename.close();
  };

  // BulkRename is opened from outside FileListing (pill button, command
  // palette, row context menu) via the composable singleton — so close the
  // sibling panels reactively whenever it opens.
  watch(
    () => deps.bulkRename.isOpen.value,
    (open) => {
      if (open) {
        moveCopyOpen.value = false;
        shareOpen.value = false;
        extractOpen.value = false;
      }
    }
  );

  watch(
    () => layoutStore.currentPromptName,
    (name) => {
      if (name === "move" || name === "copy") {
        // Pane B passes its own items via `props.override`; capture it BEFORE
        // closeHovers clears the prompt. With an override we skip the pane-A
        // fileStore gate (pane B's selection lives in its own store).
        const override = layoutStore.currentPrompt?.props?.override ?? null;
        if (
          !override &&
          (!fileStore.isListing || fileStore.selectedCount === 0)
        )
          return;
        moveCopyMode.value = name;
        moveCopyOverride.value = override;
        layoutStore.closeHovers();
        closeAllPanels();
        moveCopyOpen.value = true;
        return;
      }
      if (name === "share") {
        // Share targets a single item — either the file being viewed, or the
        // sole selected item in the listing. If the listing has 0 or 2+
        // selected, do nothing (legacy modal would have noop'd too).
        const singleListingSelection =
          fileStore.isListing && fileStore.selectedCount === 1;
        const fileView = !fileStore.isListing;
        if (!singleListingSelection && !fileView) return;
        layoutStore.closeHovers();
        closeAllPanels();
        shareOpen.value = true;
        return;
      }
      if (name === "extract") {
        // Extract targets one OR MORE selected archives in the current listing
        // (each extracts into its own subfolder). Mirror the gate from
        // `headerButtons.extract` so a stray `layoutStore.showHover("extract")`
        // from a stale code path can't open the panel with no valid source:
        // every selected item must be extractable.
        if (!unzipEnabled) return;
        const req = fileStore.req;
        if (!fileStore.isListing || fileStore.selectedCount < 1 || !req) return;
        const allArchives = fileStore.selected.every((i) =>
          isExtractable(req.items[i]?.name ?? "")
        );
        if (!allArchives) return;
        layoutStore.closeHovers();
        closeAllPanels();
        extractOpen.value = true;
        return;
      }
    }
  );

  return {
    moveCopyOpen,
    moveCopyMode,
    moveCopyOverride,
    shareOpen,
    extractOpen,
    closeMoveCopy,
    closeShare,
    closeExtract,
    anyPanelOpen,
    closeAllPanels,
  };
}
