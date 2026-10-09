/**
 * Files dragged in from the operating system (upload on drop), the dimming of
 * rows during any drag, and the document-level teardown nets that clear drag
 * state when a drag ends or is cancelled with Escape. Extracted from
 * FileListing.vue (4.0 Phase 1) with no behavior change.
 */
import { ref } from "vue";
import { files as api } from "@/api";
import { useFileStore } from "@/stores/file";
import { usePanesStore } from "@/stores/panes";
import { endDragBadge } from "@/utils/dragCopyMoveBadge";
import { resolveRowDropMode } from "@/utils/dropZone";
import * as upload from "@/utils/upload";

export interface OsFileDropDeps {
  routePath: () => string;
  startUpload: (
    files: UploadList,
    path: string,
    preselect: boolean
  ) => Promise<void>;
  showError: (e: Error | string) => void;
  stopDragScroll: () => void;
  /** Clears the parent spring-load and pane-A drop overlay. */
  onListingDragEnd: () => void;
}

export function useOsFileDrop(deps: OsFileDropDeps) {
  const fileStore = useFileStore();
  const panes = usePanesStore();
  const dragCounter = ref<number>(0);

  // Document-level fallback to clear the internal-drag snapshot once a drag ends
  // (see the drop/dragend listeners in onMounted). Idempotent.
  const clearDragSnapshot = () => {
    if (fileStore.draggedItems.length > 0) fileStore.draggedItems = [];
  };

  // Esc-cancel safety net (registered as a capture keydown in onMounted): when a
  // drag is cancelled with Escape and the browser doesn't fire `dragend` — or the
  // source row unmounted mid-drag — the Copy/Move badge + drag snapshot get
  // stranded on screen. Re-run the same idempotent teardown the dragend nets do.
  // Guarded on an active drag so a plain Escape (clear selection) is unaffected.
  const onDragCancelKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (fileStore.draggedItems.length === 0) return;
    endDragBadge();
    clearDragSnapshot();
    resetOpacity();
    deps.onListingDragEnd();
    deps.stopDragScroll();
  };

  const dragEnter = () => {
    dragCounter.value++;

    // When the user starts dragging an item, put every
    // file on the listing with 50% opacity.
    const items = document.getElementsByClassName("item");

    Array.from(items).forEach((file: Element) => {
      // V3-B #4: never re-dim the active drop target. dragenter fires on every
      // child element the cursor crosses, so this runs repeatedly during a drag.
      // ListingItem.enterIntoZone set the hovered folder to opacity:1 and its
      // `inIntoZone` guard won't re-assert — so re-dimming it here is exactly
      // what made the highlighted folder flicker bright→dim. Skipping rows that
      // carry `item--drop-into` lets the highlight and the spring-load ring
      // coexist, while rows virtualized in mid-drag still get dimmed.
      if (file.classList.contains("item--drop-into")) return;
      (file as HTMLElement).style.opacity = "0.5";
    });
  };

  const dragLeave = () => {
    dragCounter.value--;

    if (dragCounter.value == 0) {
      resetOpacity();
      // The drag fully left the document. An OS-file drag that exits the window
      // without dropping fires neither `drop` nor `dragend` on us, so this is the
      // only signal to halt the edge auto-scroll rAF (otherwise it busy-loops).
      deps.stopDragScroll();
    }
  };

  const drop = async (event: DragEvent) => {
    event.preventDefault();
    dragCounter.value = 0;
    resetOpacity();

    const dt = event.dataTransfer;
    let el: HTMLElement | null = event.target as HTMLElement;

    if (fileStore.req === null || dt === null || dt.files.length <= 0) return;

    for (let i = 0; i < 5; i++) {
      if (el !== null && !el.classList.contains("item")) {
        el = el.parentElement;
      }
    }

    const files: UploadList = (await upload.scanFiles(dt)) as UploadList;

    // Dual-pane: when the OS-file drop lands inside pane B (ComparePane), the base
    // destination is pane B's folder, not pane A's route path. This single global
    // handler catches every OS-file drop (it's on `document`); without this, a drop
    // on pane B's empty space or a file row fell through to pane A's path. A drop
    // landing ON a folder row still uploads into that row's folder — resolved just
    // below from its `data-drop-url`, which is already pane-correct.
    const inPaneB =
      (event.target as HTMLElement | null)?.closest?.(".compare-pane") != null;
    const basePath = inPaneB ? panes.secondaryPath : deps.routePath();
    let path = basePath.endsWith("/") ? basePath : basePath + "/";

    // Upload INTO a folder ONLY when the cursor is over its icon + name — the same
    // shared `resolveRowDropMode` hit-test that draws the highlight (path #4 of the
    // four drop surfaces; see utils/dropZone). Anywhere else on the row (or empty
    // space) keeps `path` as the current directory, so the file uploads "alongside".
    // The target folder's url is the row's `data-drop-url` (set only for droppable,
    // non-read-only folders) — no Vue-internals poke.
    const intoFolderUrl =
      el !== null &&
      el.classList.contains("item") &&
      resolveRowDropMode(el, event.clientX, event.clientY) === "into"
        ? el.dataset.dropUrl
        : undefined;
    if (intoFolderUrl) {
      path = intoFolderUrl;

      try {
        (await api.fetch(path)).items;
      } catch (error) {
        deps.showError(error instanceof Error ? error : String(error));
        return;
      }
    }

    // Preselect is a pane-A concept; pane-B uploads refresh pane B.
    await deps.startUpload(files, path, !inPaneB);
  };

  const resetOpacity = () => {
    const items = document.getElementsByClassName("item");

    Array.from(items).forEach((file: Element) => {
      (file as HTMLElement).style.opacity = "1";
      // Clear any lingering drop-into highlight (covers Esc-cancel while the
      // cursor was still inside a folder's into-zone).
      file.classList.remove("item--drop-into");
    });
  };

  return {
    dragEnter,
    dragLeave,
    drop,
    resetOpacity,
    clearDragSnapshot,
    onDragCancelKey,
  };
}
