import { defineStore } from "pinia";
import { useFileStore } from "./file";
import { files as api } from "@/api";
import buttons from "@/utils/buttons";
import { computed, inject, markRaw, ref } from "vue";
import * as tus from "@/api/tus";

// TODO: make this into a user setting
const UPLOADS_LIMIT = 5;

/**
 * beforeunload guard fires on hard refresh / tab close / browser
 * close. Browsers DO NOT allow custom text in the resulting dialog
 * since ~2017 (anti-abuse measure) — Chrome shows "Leave site?",
 * Firefox "This page is asking you to confirm…", Safari similar.
 * No amount of `event.returnValue` set here will change those strings.
 *
 * BUT setting `returnValue` to a non-empty string IS still the
 * cross-browser cue that we want the dialog to appear at all. Without
 * it, some browsers skip showing any dialog. So we set it
 * defensively. The string itself is for the rare legacy browser that
 * still honors it.
 *
 * For better messaging on IN-APP navigation (sidebar / breadcrumbs /
 * back button / palette commands), see the router beforeEach guard
 * in router/index.ts — that path CAN show fully customized warnings
 * via the native confirm() with our own text.
 */
const beforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  // Set returnValue for cross-browser dialog-trigger reliability.
  // Modern browsers ignore the string but use the property's presence
  // as the cue to show the (browser-controlled) dialog.
  event.returnValue =
    "Uploads are still in progress. Leaving now will cancel them.";
};

export const useUploadStore = defineStore("upload", () => {
  const $showError = inject<IToastError>("$showError")!;

  let progressInterval: number | null = null;

  //
  // STATE
  //

  const allUploads = ref<Upload[]>([]);
  const activeUploads = ref<Set<Upload>>(new Set());
  const lastUpload = ref<number>(-1);
  const totalBytes = ref<number>(0);
  const sentBytes = ref<number>(0);
  /**
   * Phantom offset for the displayed progress percentage (v1.3 H10).
   *
   * When the user adds files to an in-progress queue, `totalBytes`
   * grows but `sentBytes` doesn't — the raw ratio (sent/total) drops,
   * making the bar appear to regress even though no bytes were lost.
   *
   * `phantomSentBytes` absorbs the boost needed to keep the displayed
   * percentage continuous across queue additions: when adding files,
   * we bump it by `oldPercent * addedBytes` so the new ratio
   * `(sentBytes + phantom) / totalBytes` matches the pre-add percent.
   *
   * Real `sentBytes` stays accurate — it drives speed + ETA
   * calculations, completion detection, and per-file progress. Only
   * the aggregate bar reads through phantom for its display value.
   *
   * Reset to 0 alongside the other counters when the queue clears.
   */
  const phantomSentBytes = ref<number>(0);

  //
  // ACTIONS
  //

  const upload = (
    path: string,
    name: string,
    file: File | null,
    overwrite: boolean,
    type: ResourceType
  ) => {
    const wasIdle = !hasActiveUploads() && !hasPendingUploads();
    if (wasIdle) {
      window.addEventListener("beforeunload", beforeUnload);
      buttons.loading("upload");
    }

    const upload: Upload = {
      path,
      name,
      file,
      overwrite,
      type,
      totalBytes: file?.size || 1,
      sentBytes: 0,
      // Stores rapidly changing sent bytes value without causing component re-renders
      rawProgress: markRaw({
        sentBytes: 0,
      }),
    };

    // v1.3 H10: prevent the displayed percentage from regressing
    // when files are queued mid-upload. Without this, adding 20 MB
    // to a 50 MB queue at 60% sent would visually drop the bar to
    // 43% (30/70). Boost phantomSentBytes proportionally so the
    // displayed ratio stays at 60% — actual bytes-sent tracking is
    // unaffected.
    if (!wasIdle && totalBytes.value > 0) {
      const currentDisplay =
        (sentBytes.value + phantomSentBytes.value) / totalBytes.value;
      phantomSentBytes.value += currentDisplay * upload.totalBytes;
    }

    totalBytes.value += upload.totalBytes;
    allUploads.value.push(upload);

    processUploads();
  };

  const abort = () => {
    // Resets the state by preventing the processing of the remaning uploads
    lastUpload.value = Infinity;
    tus.abortAllUploads();
  };

  /**
   * Remove a single upload from the dock (v1.3 H13).
   *
   *   • Queued (never started): drop it from the queue and reclaim its
   *     bytes immediately — no network was in flight.
   *   • Active (in flight): flag it canceled + abort the transfer. The
   *     awaiting `api.post` in `processUploads` rejects with "Upload
   *     aborted" (swallowed by its `.catch`), then `finishUpload` runs
   *     and the `canceled` branch reverses the byte accounting and
   *     pumps the queue so a waiting file fills the freed slot — keeping
   *     the concurrency window at UPLOADS_LIMIT.
   */
  const removeUpload = (target: Upload) => {
    const idx = allUploads.value.indexOf(target);
    if (idx === -1) return;

    if (activeUploads.value.has(target)) {
      target.canceled = true;
      // cancelUpload settles the in-flight promise → finishUpload does
      // the accounting reversal + queue advance (see finishUpload).
      api.cancelUpload(target.path);
      return;
    }

    // Queued (index past the started cursor): drop it outright.
    totalBytes.value = Math.max(0, totalBytes.value - target.totalBytes);
    allUploads.value.splice(idx, 1);
    // idx > lastUpload, so the started-cursor is unaffected by the splice.
    // Re-run the pump: finalizes the dock if nothing's left, otherwise
    // fills any free slot with the next queued file.
    processUploads();
  };

  //
  // GETTERS
  //

  const pendingUploadCount = computed(
    () =>
      allUploads.value.length -
      (lastUpload.value + 1) +
      activeUploads.value.size
  );

  /**
   * Every upload that should appear in the floating dock's per-file
   * list: currently transferring OR queued behind the UPLOADS_LIMIT
   * concurrency cap (v1.3 H7).
   *
   * Why a derived list rather than just iterating `activeUploads`:
   * `activeUploads` is a Set capped at UPLOADS_LIMIT (5 in-flight
   * uploads at a time). Without this computed, a queue of 30 files
   * would only show the 5 currently transferring — the other 25 would
   * be invisible until each in-flight one completed and a queued one
   * moved up. Scrolling never engaged because the list never grew
   * past 5 items.
   *
   * Membership rule: an entry in `allUploads[i]` is visible when
   * `i > lastUpload` (still queued, never started) OR it's still in
   * `activeUploads` (started, not yet finished). Completed entries
   * (i <= lastUpload AND no longer in activeUploads) are excluded so
   * the list shrinks as uploads finish.
   *
   * Order preserves the user's queue order (allUploads insertion
   * order) — the file you added first sits at the top, matching
   * intent.
   */
  /**
   * Percentage to display in both progress bars (top of window +
   * upload dock aggregate). Reads sentBytes + phantomSentBytes so
   * adding files mid-upload doesn't regress the visible bar.
   * Clamped to [0, 100] defensively. Returns 0 when nothing's queued.
   */
  const displayedPercent = computed<number>(() => {
    if (totalBytes.value === 0) return 0;
    const numerator = sentBytes.value + phantomSentBytes.value;
    return Math.max(0, Math.min(100, (numerator / totalBytes.value) * 100));
  });

  const visibleUploads = computed<Upload[]>(() => {
    const out: Upload[] = [];
    const completedThrough = lastUpload.value;
    for (let i = 0; i < allUploads.value.length; i++) {
      const u = allUploads.value[i];
      if (i > completedThrough || activeUploads.value.has(u)) {
        out.push(u);
      }
    }
    return out;
  });

  //
  // PRIVATE FUNCTIONS
  //

  const hasActiveUploads = () => activeUploads.value.size > 0;

  const hasPendingUploads = () =>
    allUploads.value.length > lastUpload.value + 1;

  const isActiveUploadsOnLimit = () => activeUploads.value.size < UPLOADS_LIMIT;

  const processUploads = async () => {
    if (!hasActiveUploads() && !hasPendingUploads()) {
      const fileStore = useFileStore();
      window.removeEventListener("beforeunload", beforeUnload);
      buttons.success("upload");
      reset();
      fileStore.reload = true;
    }

    if (isActiveUploadsOnLimit() && hasPendingUploads()) {
      if (!hasActiveUploads()) {
        // Update the state in a fixed time interval
        progressInterval = window.setInterval(syncState, 1000);
      }

      const upload = nextUpload();

      if (upload.type === "dir") {
        // Swallow user-initiated cancels (v1.3 H13) the same way the
        // file branch does, so canceling a dir mid-create doesn't flash
        // an error toast.
        await api
          .post(upload.path)
          .catch(
            (err) =>
              (err as Error)?.message !== "Upload aborted" && $showError(err)
          );
      } else {
        const onUpload = (event: ProgressEvent) => {
          upload.rawProgress.sentBytes = event.loaded;
        };

        await api
          .post(upload.path, upload.file!, upload.overwrite, onUpload)
          .catch((err) => err.message !== "Upload aborted" && $showError(err));
      }

      finishUpload(upload);
    }
  };

  const nextUpload = (): Upload => {
    lastUpload.value++;

    const upload = allUploads.value[lastUpload.value];
    activeUploads.value.add(upload);

    return upload;
  };

  const finishUpload = (upload: Upload) => {
    // v1.3 H13: a canceled in-flight upload reaches here when its
    // aborted request settles. Reverse its contribution entirely
    // (remove from the queue + reclaim bytes) instead of counting it
    // as completed, then pump the queue to refill the freed slot.
    if (upload.canceled) {
      const idx = allUploads.value.indexOf(upload);
      totalBytes.value = Math.max(0, totalBytes.value - upload.totalBytes);
      // Only `upload.sentBytes` was ever folded into the global
      // `sentBytes` (via syncState); subtract exactly that.
      sentBytes.value = Math.max(0, sentBytes.value - upload.sentBytes);
      if (idx !== -1) {
        allUploads.value.splice(idx, 1);
        // The removed element sat at/before the started cursor, so the
        // remaining items shift down — keep the cursor pointing at the
        // same logical position.
        if (idx <= lastUpload.value) lastUpload.value -= 1;
      }
      upload.file = null;
      activeUploads.value.delete(upload);
      processUploads();
      return;
    }

    sentBytes.value += upload.totalBytes - upload.sentBytes;
    upload.sentBytes = upload.totalBytes;
    upload.file = null;

    activeUploads.value.delete(upload);
    processUploads();
  };

  const syncState = () => {
    for (const upload of activeUploads.value) {
      sentBytes.value += upload.rawProgress.sentBytes - upload.sentBytes;
      upload.sentBytes = upload.rawProgress.sentBytes;
    }
  };

  const reset = () => {
    if (progressInterval !== null) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    allUploads.value = [];
    activeUploads.value = new Set();
    lastUpload.value = -1;
    totalBytes.value = 0;
    sentBytes.value = 0;
    phantomSentBytes.value = 0;
  };

  return {
    // STATE
    activeUploads,
    totalBytes,
    sentBytes,

    // ACTIONS
    upload,
    abort,
    removeUpload,

    // GETTERS
    pendingUploadCount,
    visibleUploads,
    displayedPercent,
  };
});
