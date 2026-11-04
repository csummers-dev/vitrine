/**
 * Every download in the app goes through here (4.0). A single file always
 * downloads as it is. A folder or several items download as one archive:
 * a zip straight away, or — when an admin has turned on "Ask for archive
 * format" in Settings → Global — the format prompt first. Share pages use
 * the same global setting.
 */
import { files as api } from "@/api";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

/** Read live (not cached at start-up), so saving the setting applies at once. */
export const asksArchiveFormat = (): boolean =>
  window.FileBrowser?.AskArchiveFormat === true;

export interface DownloadRequest {
  /** Set when the download is exactly one file: it downloads directly. */
  file?: () => void;
  /** Starts the archive download in the given format. */
  archive: (format: DownloadFormat) => void;
}

export function startDownload(req: DownloadRequest): void {
  if (req.file) {
    req.file();
    return;
  }
  if (!asksArchiveFormat()) {
    req.archive("zip");
    return;
  }
  const layout = useLayoutStore();
  layout.showHover({
    prompt: "download",
    confirm: (format: DownloadFormat) => {
      layout.closeHovers();
      req.archive(format);
    },
  });
}

/**
 * Downloads the listing's selection, or the whole folder when nothing is
 * selected (after a confirm, so a stray ⌘S doesn't start a huge archive).
 * Used by the selection bar, the row menu, ⌘S, the palette and the details
 * panel. `folderUrl` defaults to the folder on screen.
 */
export function downloadSelection(folderUrl?: string): void {
  const fileStore = useFileStore();
  const req = fileStore.req;
  if (!req) return;
  const items = fileStore.selected
    .map((i) => req.items[i])
    .filter((it): it is ResourceItem => !!it);
  if (items.length === 1 && !items[0].isDir) {
    startDownload({
      file: () => api.download(null, items[0].url),
      archive: () => {},
    });
    return;
  }
  const folder = folderUrl ?? req.url;
  if (items.length === 0) {
    const name = req.name || "this folder";
    const ok = window.confirm(
      `Nothing is selected. This will download the entire contents of "${name}" as an archive. Continue?`
    );
    if (!ok) return;
  }
  startDownload({
    archive: (format) =>
      api.download(
        format,
        ...(items.length ? items.map((i) => i.url) : [folder])
      ),
  });
}
