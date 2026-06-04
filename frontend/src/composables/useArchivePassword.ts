/**
 * useArchivePassword — a promise-based password prompt for extracting
 * password-protected archives ("detect & prompt").
 *
 * Extraction is attempted with no password first; if the server replies 422
 * (see utils/unzipErrors isArchivePasswordError) the extract flow calls
 * `requestPassword()`, which opens the one ArchivePasswordPrompt dialog (mounted
 * in App.vue) and resolves with the typed password — or `null` if the user
 * cancels. Same module-scoped-singleton shape as useRootLabel: the trigger
 * (useExtractIndicator) and the dialog component share one reactive state.
 */
import { ref, type Ref } from "vue";

/** Singleton open-state + "previous attempt was wrong" flag for the dialog. */
const dialogOpen: Ref<boolean> = ref(false);
const incorrect: Ref<boolean> = ref(false);

// The pending request's resolver. Held while the dialog is open; settled
// exactly once (with the password, or null on cancel) then cleared.
let resolver: ((value: string | null) => void) | null = null;

function settle(value: string | null) {
  dialogOpen.value = false;
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

export function useArchivePassword() {
  return {
    dialogOpen,
    incorrect,

    /**
     * Open the prompt and resolve with the entered password, or `null` if the
     * user cancels. `incorrect: true` shows the "wrong password" inline state
     * (used on a retry).
     */
    requestPassword(opts?: { incorrect?: boolean }): Promise<string | null> {
      // Defensive: if a prompt is somehow already pending, cancel it first so
      // we never strand a promise.
      if (resolver) settle(null);
      incorrect.value = opts?.incorrect ?? false;
      dialogOpen.value = true;
      return new Promise<string | null>((resolve) => {
        resolver = resolve;
      });
    },

    /** Dialog confirmed — resolve with the password. */
    submit(password: string) {
      settle(password);
    },

    /** Dialog dismissed (Cancel / Esc / scrim) — resolve with null. */
    cancel() {
      settle(null);
    },
  };
}
