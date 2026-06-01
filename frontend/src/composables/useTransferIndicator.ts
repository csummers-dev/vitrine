import { inject } from "vue";
import { useToast } from "vue-toastification";
import { useFileStore } from "@/stores/file";

/**
 * Shared progress + completion feedback for drag-and-drop move/copy.
 *
 * The move-tool slide-over (RC-16) already shows a busy state, but a
 * drag-and-drop move went through a different code path (ListingItem's
 * into-zone drop + useDropTarget) and gave NO indication while it ran —
 * for a slow cross-mount copy the UI just sat there until the listing
 * reloaded. This wraps the API call so both drag paths share one
 * behaviour:
 *
 *   - An in-progress "Moving…/Copying…" toast, shown only after a short
 *     delay so an instant same-volume rename doesn't flash a toast.
 *   - A success toast on completion (and the listing reload).
 *   - The error toast on failure.
 */
const PROGRESS_DELAY_MS = 350;

export function useTransferIndicator() {
  const toast = useToast();
  const fileStore = useFileStore();
  const $showError = inject<IToastError>("$showError")!;
  const $showSuccess = inject<(message: string) => void>("$showSuccess")!;

  /**
   * Run a move/copy with progress + completion feedback.
   *
   * @param runOp    thunk that performs the API call and returns its promise
   *                 (the caller binds items / overwrite / rename)
   * @param isCopy   true = copy (modifier held), false = move — picks the verb
   * @param items    used only for the count + first name in the toast text
   */
  const runTransfer = (
    runOp: () => Promise<unknown>,
    isCopy: boolean,
    items: { name: string }[],
    opts: {
      /** Run on a successful transfer, before the listing reload — e.g. to
       *  preselect moved items or redirect to the destination. */
      onSuccess?: () => void;
      /** Set fileStore.reload after success (default true). Pass false when
       *  onSuccess navigates away (the destination route fetches anyway). */
      reloadOnSuccess?: boolean;
    } = {}
  ): Promise<void> => {
    const { onSuccess, reloadOnSuccess = true } = opts;
    const n = items.length;
    const what = n === 1 ? `“${items[0]?.name ?? ""}”` : `${n} items`;
    const verb = isCopy ? "Copying" : "Moving";
    const doneVerb = isCopy ? "Copied" : "Moved";

    let progressId: string | number | undefined;
    const timer = window.setTimeout(() => {
      progressId = toast.info(`${verb} ${what}…`, {
        timeout: false,
        closeButton: false,
        draggable: false,
      });
    }, PROGRESS_DELAY_MS);

    return runOp()
      .then(() => {
        // A post-transfer side effect (preselect / redirect) throwing must
        // NOT be reported as a transfer failure — the move/copy succeeded.
        try {
          onSuccess?.();
        } catch (err) {
          console.error("transfer onSuccess hook failed:", err);
        }
        if (reloadOnSuccess) fileStore.reload = true;
        $showSuccess(`${doneVerb} ${what}`);
      })
      .catch((e: unknown) => {
        $showError(e as Error);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (progressId !== undefined) toast.dismiss(progressId);
      });
  };

  return { runTransfer };
}
