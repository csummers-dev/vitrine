/**
 * Upload entry points for the listing: the Upload button, the hidden file and
 * folder inputs (including the touch photo picker), ⌘V with files on the OS
 * clipboard, and the shared start-or-resolve-conflicts step that OS-file drops
 * also use. Extracted from FileListing.vue (4.0 Phase 1).
 *
 * The three entry points used to each carry their own copy of the conflict
 * dialog wiring; they now share `startUpload`, which keeps their behavior
 * (including whether freshly uploaded files are preselected).
 */
import type { Ref } from "vue";
import { removePrefix } from "@/api/utils";
import { useAuthStore } from "@/stores/auth";
import { useClipboardStore } from "@/stores/clipboard";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";
import { usePanesStore } from "@/stores/panes";
import { pastedFileName } from "@/utils/filename";
import * as upload from "@/utils/upload";

export interface ListingUploadDeps {
  /** The current folder's route path (pane A). */
  routePath: () => string;
  splitActive: Readonly<Ref<boolean>>;
}

/** Ensures a folder path ends with "/". */
export function asFolder(path: string): string {
  return path.endsWith("/") ? path : path + "/";
}

/**
 * Applies the conflict dialog's choices to `files` in place: both kept →
 * upload with a new name; only "origin" checked → overwrite; otherwise skip.
 */
export function applyConflictChoices(
  files: UploadList,
  result: ConflictingResource[]
): void {
  for (let i = result.length - 1; i >= 0; i--) {
    const item = result[i];
    if (item.checked.length == 2) {
      continue;
    } else if (item.checked.length == 1 && item.checked[0] == "origin") {
      files[item.index].overwrite = true;
    } else {
      files.splice(item.index, 1);
    }
  }
}

export function useListingUpload(deps: ListingUploadDeps) {
  const authStore = useAuthStore();
  const clipboardStore = useClipboardStore();
  const fileStore = useFileStore();
  const layoutStore = useLayoutStore();
  const panes = usePanesStore();

  /**
   * Uploads `files` into `path`, first asking how to resolve any name
   * conflicts. With `preselect`, the uploaded files are selected once the
   * listing reloads (a pane-A concept; pane-B uploads refresh pane B).
   */
  const startUpload = async (
    files: UploadList,
    path: string,
    preselect: boolean
  ): Promise<void> => {
    // fullPath carries a folder upload's relative path (already decoded);
    // plain files use their bare name.
    const preselectPaths = (list: UploadList) =>
      list.map((f) => removePrefix(path) + (f.fullPath || f.name));

    const conflict = await upload.checkConflict(files, path);
    if (conflict.length > 0) {
      layoutStore.showHover({
        prompt: "resolve-conflict",
        props: { conflict, isUploadAction: true, to: path },
        confirm: (event: Event, result: Array<ConflictingResource>) => {
          event.preventDefault();
          layoutStore.closeHovers();
          applyConflictChoices(files, result);
          if (files.length > 0) {
            upload.handleFiles(files, path, true);
            // Re-select only the survivors so skipped files don't end up
            // "selected but missing".
            if (preselect) fileStore.setPreselect(preselectPaths(files));
          }
        },
      });
      return;
    }

    upload.handleFiles(files, path);
    if (preselect) fileStore.setPreselect(preselectPaths(files));
  };

  /** Header Upload button: the folder-aware prompt when the browser supports
   *  directory entries, else the plain file input. */
  const uploadFunc = () => {
    if (
      typeof window.DataTransferItem !== "undefined" &&
      typeof DataTransferItem.prototype.webkitGetAsEntry !== "undefined"
    ) {
      layoutStore.showHover("upload");
    } else {
      document.getElementById("upload-input")?.click();
    }
  };

  /** `change` handler for the hidden file / folder / photo inputs. */
  const uploadInput = async (event: Event) => {
    const files = (event.currentTarget as HTMLInputElement)?.files;
    if (files === null) return;

    const folderUpload = !!files[0].webkitRelativePath;
    const uploadFiles: UploadList = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadFiles.push({
        file,
        name: file.name,
        size: file.size,
        isDir: false,
        fullPath: folderUpload ? file.webkitRelativePath : undefined,
      });
    }

    await startUpload(uploadFiles, asFolder(deps.routePath()), true);
  };

  // ── Paste-to-upload (v2.7) ─────────────────────────────────────────
  // ⌘V with FILES on the OS clipboard (a screenshot, a Finder copy) uploads
  // them into the active pane's folder. Registered on `document` (like the OS
  // drop handler) so it works wherever focus sits, with the same guards the
  // keyboard handler uses. The app's own cut/copy clipboard keeps priority:
  // when it's armed, ⌘V means "paste those items" and this stays out of it.
  const onPasteUpload = async (event: ClipboardEvent) => {
    if (layoutStore.currentPrompt !== null) return;
    if (!authStore.user?.perm.create) return;
    if (clipboardStore.key !== "") return; // internal clipboard wins
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || target?.isContentEditable)
      return;
    const clipFiles = event.clipboardData?.files;
    if (!clipFiles || clipFiles.length === 0) return; // plain text — not ours
    event.preventDefault();

    // Paste lands in the ACTIVE pane's folder (split) or the current route.
    const inPaneB = deps.splitActive.value && panes.activePane === "b";
    const path = asFolder(inPaneB ? panes.secondaryPath : deps.routePath());

    const now = new Date();
    const uploadFiles: UploadList = [];
    for (let i = 0; i < clipFiles.length; i++) {
      const file = clipFiles[i];
      uploadFiles.push({
        file,
        // Generic clipboard names ("image.png") get a timestamp so repeat
        // pastes don't fight the conflict dialog every time.
        name: pastedFileName(file.name, now),
        size: file.size,
        isDir: false,
      });
    }

    await startUpload(uploadFiles, path, !inPaneB);
  };

  return {
    startUpload,
    uploadFunc,
    uploadInput,
    onPasteUpload,
  };
}
