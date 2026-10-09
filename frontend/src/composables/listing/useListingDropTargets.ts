/**
 * Drop targets around the listing for internal (row) drags: the section title
 * as a shortcut to the parent folder (drop to move up, hover to navigate up),
 * pane A's body during a split-view drag, and "alongside" drops on a row that
 * land in the current folder. Extracted from FileListing.vue (4.0 Phase 1)
 * with no behavior change.
 */
import { computed, ref, type Ref } from "vue";
import { useDropTarget } from "@/composables/useDropTarget";
import { useFileStore } from "@/stores/file";
import url from "@/utils/url";

export interface ListingDropTargetsDeps {
  splitActive: Readonly<Ref<boolean>>;
  navigate: (path: string) => void;
}

export function useListingDropTargets(deps: ListingDropTargetsDeps) {
  const fileStore = useFileStore();

  // ── Section title as parent-folder drop + spring-load target (F2) ──
  // During a drag, the section-title area (the row that shows the
  // current folder name + meta) acts as a shortcut to the PARENT folder:
  //   • Drop on it           → move/copy the selection up one level
  //   • Hover 2 s during drag → navigate up one level (no drop required)
  // Both are gated by the existence of a parent — at the storage root
  // we suppress the drop target entirely (no parent to navigate to).
  const PARENT_SPRING_MS = 2000;
  const sectionDropActive = ref<boolean>(false);
  let sectionSpringTimer: number | null = null;
  let sectionDragDepth = 0;

  const { performDrop: performParentDrop } = useDropTarget();

  /** Parent folder URL relative to the current route, or null at root. */
  const parentFolderUrl = computed<string | null>(() => {
    if (!fileStore.req?.isDir) return null;
    const here = fileStore.req.url; // ends with "/"
    // Strip trailing slash, then drop the last segment.
    const trimmed = here.endsWith("/") ? here.slice(0, -1) : here;
    const parent = url.removeLastDir(trimmed) + "/";
    // If removing the last segment lands us back at the same place, we
    // were already at the root — nothing to navigate to.
    // At the files root ("/files/") the computed parent is "/", which is
    // outside the file browser: there is no parent to go to.
    if (parent === here || !parent.startsWith("/files/")) return null;
    return parent;
  });

  /** Click handler for the inline ↑ button. Same destination as the
   *  spring-load drag behavior so users get one mental model regardless
   *  of which input modality they're using. */
  const goToParentFolder = () => {
    if (parentFolderUrl.value) deps.navigate(parentFolderUrl.value);
  };

  const cancelSectionSpring = () => {
    if (sectionSpringTimer !== null) {
      window.clearTimeout(sectionSpringTimer);
      sectionSpringTimer = null;
    }
  };

  const onSectionDragEnter = (event: DragEvent) => {
    // Gate on the active DRAG set (not the current selection) so a cross-pane
    // drag — whose items live in `draggedItems`, not pane A's `selected` — also
    // arms the parent spring-load when held over the split header (#18).
    if (fileStore.draggedItems.length === 0) return;
    if (!parentFolderUrl.value) return;
    event.preventDefault();
    sectionDragDepth++;
    if (sectionDragDepth === 1) {
      sectionDropActive.value = true;
      // Spring-load: hover for PARENT_SPRING_MS → navigate up.
      sectionSpringTimer = window.setTimeout(() => {
        sectionSpringTimer = null;
        sectionDropActive.value = false;
        sectionDragDepth = 0;
        if (parentFolderUrl.value) deps.navigate(parentFolderUrl.value);
      }, PARENT_SPRING_MS);
    }
  };

  const onSectionDragOver = (event: DragEvent) => {
    if (fileStore.draggedItems.length === 0) return;
    if (!parentFolderUrl.value) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        event.ctrlKey || event.metaKey ? "copy" : "move";
    }
  };

  const onSectionDragLeave = () => {
    if (!parentFolderUrl.value) return;
    sectionDragDepth = Math.max(0, sectionDragDepth - 1);
    if (sectionDragDepth === 0) {
      sectionDropActive.value = false;
      cancelSectionSpring();
    }
  };

  const onSectionDrop = (event: DragEvent) => {
    // Drop wins over spring-load: kill the timer before any conflict
    // prompts so we don't navigate mid-resolve.
    cancelSectionSpring();
    sectionDragDepth = 0;
    sectionDropActive.value = false;
    if (!parentFolderUrl.value) return;
    void performParentDrop(event, parentFolderUrl.value);
  };

  // ── Pane A cross-pane drop overlay (#17) ─────────────────────────────
  // Mirrors ComparePane's `.compare-body--drop`: while an internal selection is
  // dragged over pane A's body, draw the same dashed accent frame so pane A reads
  // as a drop target too (previously only pane B lit up). Split-only — in single
  // pane these handlers early-return, so that path is byte-for-byte unchanged.
  // `fileStore.draggedItems` is the shared cross-pane drag set (written by either
  // pane's dragstart), so this fires for both A→A and B→A drags.
  const paneADropDepth = ref<number>(0);
  const paneADropActive = computed(
    () =>
      deps.splitActive.value &&
      paneADropDepth.value > 0 &&
      fileStore.draggedItems.length > 0
  );
  const onPaneADragEnter = (event: DragEvent) => {
    if (!deps.splitActive.value || fileStore.draggedItems.length === 0) return;
    event.preventDefault();
    paneADropDepth.value++;
  };
  const onPaneADragOver = (event: DragEvent) => {
    if (!deps.splitActive.value || fileStore.draggedItems.length === 0) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        event.ctrlKey || event.metaKey ? "copy" : "move";
    }
  };
  const onPaneADragLeave = () => {
    if (paneADropDepth.value > 0) paneADropDepth.value--;
  };
  const onPaneADrop = (event: DragEvent) => {
    paneADropDepth.value = 0;
    // Only internal cross-pane drags land here; OS-file drops (no draggedItems)
    // are owned by the global document `drop` handler — don't double-handle them.
    if (!deps.splitActive.value || fileStore.draggedItems.length === 0) return;
    // A row (folder into-zone, or a file row's dropAlongside) already handled it.
    if ((event.target as HTMLElement | null)?.closest(".item")) return;
    if (!currentFolderUrl.value) return;
    void performParentDrop(event, currentFolderUrl.value);
  };

  // Drag-cancel safety net (review #1): Esc-cancelling a drag fires `dragend` but
  // NOT `dragleave`/`drop`, so a pending section spring-load timer would otherwise
  // still navigate ~PARENT_SPRING_MS later, and the pane-A drop overlay would stay
  // lit. Wired to the document `dragend` alongside `resetOpacity` (same rationale).
  const onListingDragEnd = () => {
    cancelSectionSpring();
    sectionDropActive.value = false;
    sectionDragDepth = 0;
    paneADropDepth.value = 0;
  };

  // `currentFolderUrl` — the current folder's url (trailing "/" like the
  // ListingItem rows, so a conflict prompt's `to` matches the breadcrumb).
  // Destination for an "alongside" drop (below) and for the touch drop path.
  const currentFolderUrl = computed<string>(() => fileStore.req?.url ?? "");

  // Alongside drop on any row → move into the CURRENT folder via the shared
  // useDropTarget.performDrop (target-agnostic; it just takes a destination
  // URL). A release on a row's non-into-zone area, or on any file row, routes
  // here. No-op if we somehow have no current folder.
  const onItemDropAlongside = (event: DragEvent) => {
    if (!currentFolderUrl.value) return;
    void performParentDrop(event, currentFolderUrl.value);
  };

  return {
    PARENT_SPRING_MS,
    performDrop: performParentDrop,
    sectionDropActive,
    parentFolderUrl,
    goToParentFolder,
    cancelSectionSpring,
    onSectionDragEnter,
    onSectionDragOver,
    onSectionDragLeave,
    onSectionDrop,
    paneADropActive,
    onPaneADragEnter,
    onPaneADragOver,
    onPaneADragLeave,
    onPaneADrop,
    onListingDragEnd,
    currentFolderUrl,
    onItemDropAlongside,
  };
}
