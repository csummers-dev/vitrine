import { reactive } from "vue";
import { useToast } from "vue-toastification";
import { files as api } from "@/api";
import url from "@/utils/url";
import type { PaneId } from "@/stores/panes";

/**
 * A pane the parity actions operate on. Pane A keeps its own (battle-tested,
 * inline-edit) flows in FileListing; this powers the SECOND pane, which has its
 * own action surface. Everything is read through getters so the target always
 * reflects the live folder/selection.
 */
export interface PaneTarget {
  paneId: PaneId;
  /** Current folder URL (a `/files/...` path; trailing slash not required). */
  folderUrl: () => string;
  /** The items currently selected in this pane. */
  selectedItems: () => ResourceItem[];
  /** Re-fetch this pane after a mutation settles. */
  reload: () => void;
}

interface NamePromptState {
  open: boolean;
  title: string;
  message: string;
  icon: string;
  initialValue: string;
  placeholder: string;
  confirmLabel: string;
  selectBaseName: boolean;
}
interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Parity file actions (new folder/file, rename, delete) scoped to a `PaneTarget`,
 * driving a shared name-prompt + confirm dialog. The host component renders
 * `<PaneNamePrompt>` + `<ConfirmDialog>` bound to the returned state. Mutations
 * run the same `@/api/files` calls the primary listing uses, then `reload()` the
 * target pane. Errors surface as a toast; success gives a quiet confirmation.
 */
export function usePaneActions(target: PaneTarget) {
  const toast = useToast();

  // ── Name prompt (new folder / new file / rename) ──────────────────────
  const namePrompt = reactive<NamePromptState>({
    open: false,
    title: "",
    message: "",
    icon: "folder-plus",
    initialValue: "",
    placeholder: "",
    confirmLabel: "Create",
    selectBaseName: false,
  });
  let onNameConfirm: ((value: string) => void | Promise<void>) | null = null;

  const openNamePrompt = (
    opts: Partial<NamePromptState>,
    handler: (value: string) => void | Promise<void>
  ) => {
    Object.assign(namePrompt, {
      message: "",
      icon: "folder-plus",
      initialValue: "",
      placeholder: "",
      confirmLabel: "Create",
      selectBaseName: false,
      ...opts,
      open: true,
    });
    onNameConfirm = handler;
  };
  const cancelNamePrompt = () => {
    namePrompt.open = false;
    onNameConfirm = null;
  };
  const confirmNamePrompt = (value: string) => {
    const handler = onNameConfirm;
    namePrompt.open = false;
    onNameConfirm = null;
    void handler?.(value);
  };

  // ── Confirm (delete) ──────────────────────────────────────────────────
  const confirm = reactive<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Move to Trash",
  });
  let onConfirmYes: (() => void | Promise<void>) | null = null;
  const openConfirm = (
    opts: Partial<ConfirmState>,
    handler: () => void | Promise<void>
  ) => {
    Object.assign(confirm, opts, { open: true });
    onConfirmYes = handler;
  };
  const cancelConfirm = () => {
    confirm.open = false;
    onConfirmYes = null;
  };
  const confirmConfirm = () => {
    const handler = onConfirmYes;
    confirm.open = false;
    onConfirmYes = null;
    void handler?.();
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  /** Folder URL guaranteed to end in a slash (the create/rename base). */
  const folderBase = () => target.folderUrl().replace(/\/?$/, "/");
  const fail = (e: unknown) =>
    toast.error((e as Error)?.message || "Something went wrong");

  // ── Actions ───────────────────────────────────────────────────────────
  const newFolder = () => {
    openNamePrompt(
      {
        title: "New folder",
        icon: "folder-plus",
        placeholder: "Folder name",
        confirmLabel: "Create",
      },
      async (name) => {
        try {
          await api.post(folderBase() + encodeURIComponent(name) + "/");
          target.reload();
          toast.success(`Created “${name}”`);
        } catch (e) {
          fail(e);
        }
      }
    );
  };

  const newFile = () => {
    openNamePrompt(
      {
        title: "New file",
        icon: "file-plus",
        placeholder: "File name",
        confirmLabel: "Create",
      },
      async (name) => {
        try {
          await api.post(folderBase() + encodeURIComponent(name));
          target.reload();
          toast.success(`Created “${name}”`);
        } catch (e) {
          fail(e);
        }
      }
    );
  };

  /** Rename a single item (defaults to the lone selection). */
  const rename = (item?: ResourceItem) => {
    const it = item ?? target.selectedItems()[0];
    if (!it) return;
    openNamePrompt(
      {
        title: `Rename “${it.name}”`,
        icon: "pencil",
        initialValue: it.name,
        confirmLabel: "Rename",
        selectBaseName: !it.isDir,
      },
      async (next) => {
        if (next === it.name) return;
        const trimmed = it.url.endsWith("/") ? it.url.slice(0, -1) : it.url;
        const to = url.removeLastDir(trimmed) + "/" + encodeURIComponent(next);
        try {
          await api.move([{ from: it.url, to }]);
          target.reload();
          toast.success(`Renamed to “${next}”`);
        } catch (e) {
          fail(e);
        }
      }
    );
  };

  /** Delete items (defaults to the current selection). Moves to Trash unless
   *  `permanent`; recoverable from the Trash view either way. */
  const remove = (items?: ResourceItem[], permanent = false) => {
    const list = (items ?? target.selectedItems()).filter(Boolean);
    if (list.length === 0) return;
    const label =
      list.length === 1 ? `“${list[0].name}”` : `${list.length} items`;
    openConfirm(
      {
        title: permanent ? "Delete forever?" : "Move to Trash?",
        message: permanent
          ? `Permanently delete ${label}? This can't be undone.`
          : `Move ${label} to the Trash? You can restore from there.`,
        confirmLabel: permanent ? "Delete forever" : "Move to Trash",
      },
      async () => {
        try {
          await Promise.all(list.map((it) => api.remove(it.url, permanent)));
          target.reload();
          toast.success(
            permanent ? `Deleted ${label}` : `Moved ${label} to Trash`
          );
        } catch (e) {
          fail(e);
        }
      }
    );
  };

  return {
    namePrompt,
    confirm,
    confirmNamePrompt,
    cancelNamePrompt,
    confirmConfirm,
    cancelConfirm,
    newFolder,
    newFile,
    rename,
    remove,
  };
}
