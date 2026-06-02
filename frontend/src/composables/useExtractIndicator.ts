import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useFileStore } from "@/stores/file";
import { files as api } from "@/api";
import { mapUnzipError } from "@/utils/unzipErrors";

/**
 * Background archive extraction with floating toast feedback (mirrors the
 * move/copy transfer indicator). Extraction can take minutes for a large
 * archive; the old flow pinned the user to a blocking ExtractPanel overlay
 * the whole time. Instead the panel closes immediately on submit and the
 * work runs here — a delayed "Extracting…" toast, then a success/error
 * toast — so the user can keep navigating the app while the server works.
 *
 * Returns a `runExtract` closure that survives the (now-closed) panel
 * unmounting: it holds only app-level singletons (toast / router / store /
 * api), so the in-flight promise + toasts complete regardless of component
 * lifecycle.
 */
const PROGRESS_DELAY_MS = 300;

export interface ExtractParams {
  /** Archive resource URL (the `item.url` of the .zip/.7z/…). */
  sourceUrl: string;
  /** Display name for the toast. */
  name: string;
  /** Final, URL-encoded destination path the backend receives. */
  dest: string;
  overwrite: boolean;
  /** Delete the source archive after a successful extraction. */
  deleteOriginal: boolean;
  /** Navigate into the destination folder when done. */
  openFolder: boolean;
}

export function useExtractIndicator() {
  const toast = useToast();
  const router = useRouter();
  const fileStore = useFileStore();

  const runExtract = (params: ExtractParams): Promise<void> => {
    const { sourceUrl, name, dest, overwrite, deleteOriginal, openFolder } =
      params;

    let progressId: string | number | undefined;
    const timer = window.setTimeout(() => {
      progressId = toast.info(`Extracting “${name}”…`, {
        timeout: false,
        closeButton: false,
        draggable: false,
      });
    }, PROGRESS_DELAY_MS);

    return api
      .unzip(sourceUrl, dest, overwrite)
      .then(async () => {
        // Delete the source only on extract success — a failed remove is a
        // warning, not a failure (the extraction itself worked).
        if (deleteOriginal) {
          try {
            await api.remove(sourceUrl);
          } catch (delErr) {
            toast.warning(
              `Extracted, but couldn't delete the original: ${
                delErr instanceof Error ? delErr.message : "unknown error"
              }`
            );
          }
        }
        toast.success(`Extracted to ${decodeURIComponent(dest)}`);
        if (openFolder) {
          void router.push({ path: dest.replace(/\/?$/, "/") });
        } else {
          // Refresh the current listing so a same-folder extraction's new
          // folder animates in (harmless if the user navigated elsewhere).
          fileStore.reload = true;
        }
      })
      .catch((err: unknown) => {
        toast.error(mapUnzipError(err));
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (progressId !== undefined) toast.dismiss(progressId);
      });
  };

  return { runExtract };
}
