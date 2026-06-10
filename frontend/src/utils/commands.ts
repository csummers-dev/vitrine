/**
 * Command registry for the ⌘K command palette.
 *
 * Commands are built lazily (each time the palette opens) so they reflect
 * current permissions, current route, and current selection. We don't cache
 * them — the registry function is cheap to call and the data is naturally
 * derived from reactive stores.
 *
 * To add a new command: append an entry below. `id` must be unique. `keywords`
 * are matched against the user's query in addition to `label` (cheaper than
 * forcing the user to know the exact wording — e.g. "trash" → Delete).
 */

import type { Router } from "vue-router";
import type { useAuthStore } from "@/stores/auth";
import type { useFileStore } from "@/stores/file";
import type { useLayoutStore } from "@/stores/layout";
import { users, files } from "@/api";
import { useToast } from "vue-toastification";
import * as auth from "@/utils/auth";
import { unzipEnabled } from "@/utils/constants";
import { isExtractable } from "@/utils/archive";
import { useBulkRename } from "@/composables/useBulkRename";
import { useShortcutsOverlay } from "@/composables/useShortcutsOverlay";

export type CommandGroup =
  | "quickActions"
  | "recent"
  | "files"
  | "actions"
  | "view"
  | "navigation";

export interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  hint?: string;
  /** Lucide icon name. */
  icon: string;
  /** Extra search terms beyond `label`. Cheap synonyms / aliases. */
  keywords?: string[];
  /** What happens on ↵ or click. Runs after the palette closes. */
  run: () => void | Promise<void>;
}

export interface CommandContext {
  router: Router;
  authStore: ReturnType<typeof useAuthStore>;
  fileStore: ReturnType<typeof useFileStore>;
  layoutStore: ReturnType<typeof useLayoutStore>;
}

const GROUP_LABEL: Record<CommandGroup, string> = {
  quickActions: "Quick actions",
  recent: "Recent",
  files: "Files",
  actions: "Actions",
  view: "View",
  navigation: "Go to",
};

// "quickActions" sits at the very top (S3-8): the user's most-used
// commands (or starter set for first-time users) are the highest-value
// rows when the palette opens empty. "recent" (recently-opened files)
// follows. "files" (search hits) only appears with an active query but
// is listed above static commands so search results take precedence
// when the user has typed something.
const GROUP_ORDER: CommandGroup[] = [
  "quickActions",
  "recent",
  "files",
  "actions",
  "view",
  "navigation",
];

export function groupLabel(group: CommandGroup): string {
  return GROUP_LABEL[group];
}

export function groupOrder(): CommandGroup[] {
  return [...GROUP_ORDER];
}

/**
 * Build the full static command set for the current app state.
 * `files` group is built separately (it depends on the live query).
 */
export function buildStaticCommands(ctx: CommandContext): Command[] {
  const { router, authStore, fileStore, layoutStore } = ctx;
  const user = authStore.user;
  const canCreate = !!user?.perm.create;
  const canDelete = !!user?.perm.delete;
  const canRename = !!user?.perm.rename;
  const canShare = !!user?.perm.share;
  const canDownload = !!user?.perm.download;
  const isFolder = fileStore.req?.isDir === true;
  const isAdmin = !!user?.perm.admin;
  const currentViewMode = user?.viewMode ?? "list";

  const setViewMode = async (mode: string) => {
    if (!user) return;
    if (user.viewMode === mode) return;
    const data = { id: user.id, viewMode: mode as ViewModeType };
    try {
      await users.update(data, ["viewMode"]);
    } catch {
      /* swallow — failure to persist shouldn't block the palette UX */
    }
    authStore.updateUser(data);
  };

  const cmds: Command[] = [];

  // ── Actions ────────────────────────────────────────────────────────────
  if (canCreate) {
    cmds.push({
      id: "action.newFolder",
      group: "actions",
      label: "New folder",
      icon: "folder-plus",
      keywords: ["create", "directory", "mkdir"],
      run: () => layoutStore.showHover("newDir"),
    });
    cmds.push({
      id: "action.newFile",
      group: "actions",
      label: "New file",
      icon: "file-plus",
      keywords: ["create", "touch"],
      run: () => layoutStore.showHover("newFile"),
    });
  }

  if (isFolder && canShare && canDownload) {
    cmds.push({
      id: "action.shareFolder",
      group: "actions",
      label: "Share this folder",
      icon: "share-2",
      keywords: ["link", "public"],
      run: () => layoutStore.showHover("share"),
    });
  }

  if (isFolder) {
    cmds.push({
      id: "action.refresh",
      group: "actions",
      label: "Refresh",
      hint: "/",
      icon: "rotate-ccw",
      keywords: ["reload", "fetch"],
      run: () => {
        fileStore.reload = true;
      },
    });
  }

  // Selection commands (only meaningful when items exist in the current dir)
  const totalItems =
    (fileStore.req?.numDirs ?? 0) + (fileStore.req?.numFiles ?? 0);
  if (totalItems > 0) {
    cmds.push({
      id: "action.selectAll",
      group: "actions",
      label: "Select all",
      hint: "⌘A",
      icon: "check-check",
      keywords: ["mark", "highlight"],
      run: () => {
        const indices = Array.from({ length: totalItems }, (_, i) => i);
        fileStore.selected = indices;
        fileStore.multiple = true;
      },
    });
  }
  if ((fileStore.selectedCount ?? 0) > 0) {
    cmds.push({
      id: "action.clearSelection",
      group: "actions",
      label: "Clear selection",
      hint: "Esc",
      icon: "x",
      keywords: ["deselect", "unselect"],
      run: () => {
        fileStore.selected = [];
        fileStore.multiple = false;
      },
    });
  }

  // 2.4.0 Stage 5 / H: force a rebuild of the server's in-memory search index
  // if results ever look stale (the index normally keeps itself fresh).
  cmds.push({
    id: "action.rebuildSearchIndex",
    group: "actions",
    label: "Rebuild search index",
    icon: "refresh-cw",
    keywords: ["reindex", "search", "stale", "refresh index"],
    run: async () => {
      const toast = useToast();
      try {
        await files.rebuildSearchIndex();
        toast.success("Search index rebuilt");
      } catch {
        toast.error("Couldn't rebuild the search index");
      }
    },
  });

  // Bulk operations on the current selection
  const selCount = fileStore.selectedCount ?? 0;
  if (selCount > 0) {
    if (canDownload) {
      cmds.push({
        id: "action.downloadSelection",
        group: "actions",
        label: `Download ${selCount} selected`,
        icon: "download",
        keywords: ["save", "get"],
        run: () => layoutStore.showHover("download"),
      });
    }
    if (canRename && selCount === 1) {
      cmds.push({
        id: "action.renameSelection",
        group: "actions",
        label: "Rename",
        hint: "F2",
        icon: "pencil",
        run: () => layoutStore.showHover("rename"),
      });
    }
    // v1.3 S4-2: bulk rename. Distinct from the single-item Rename
    // above — opens the SlideOver pipeline (pattern/find-replace +
    // preview) instead of the inline rename input. Multi-selection
    // only; single-selection users want the inline rename UX.
    if (canRename && selCount > 1) {
      cmds.push({
        id: "action.bulkRename",
        group: "actions",
        label: `Bulk rename ${selCount} items…`,
        icon: "pencil",
        keywords: ["batch", "pattern", "find", "replace"],
        run: () => useBulkRename().open(),
      });
    }
    // Move requires perm.rename (same backend op as rename). Available for
    // any selection size — the slide-over picker handles both single and
    // multi item flows uniformly.
    if (canRename) {
      cmds.push({
        id: "action.moveSelection",
        group: "actions",
        label: selCount === 1 ? "Move…" : `Move ${selCount} items…`,
        icon: "forward",
        keywords: ["relocate", "transfer"],
        run: () => layoutStore.showHover("move"),
      });
    }
    // Copy requires perm.create.
    if (user?.perm.create) {
      cmds.push({
        id: "action.copySelection",
        group: "actions",
        label: selCount === 1 ? "Copy…" : `Copy ${selCount} items…`,
        icon: "copy",
        keywords: ["duplicate", "clone"],
        run: () => layoutStore.showHover("copy"),
      });
    }
    if (canDelete) {
      cmds.push({
        id: "action.deleteSelection",
        group: "actions",
        label: `Delete ${selCount} selected`,
        hint: "⌫",
        icon: "trash-2",
        keywords: ["remove", "trash"],
        run: () => layoutStore.showHover("delete"),
      });
    }
    // Extract archive (PR #5746, generalized) — single supported archive
    // (zip / 7z / rar / tar family) + perm.create + feature on. Conditional
    // inside the same selection-count guard so the entry only renders when
    // the action is genuinely available.
    if (selCount === 1 && canCreate && unzipEnabled) {
      const item = fileStore.req?.items[fileStore.selected[0]];
      if (item && isExtractable(item.name)) {
        cmds.push({
          id: "action.extractZip",
          group: "actions",
          label: "Extract…",
          hint: "E",
          icon: "package-open",
          keywords: [
            "unzip",
            "decompress",
            "archive",
            "open",
            "7z",
            "rar",
            "tar",
          ],
          run: () => layoutStore.showHover("extract"),
        });
      }
    }
  }

  // ── View modes ─────────────────────────────────────────────────────────
  cmds.push({
    id: "view.list",
    group: "view",
    label: "Switch to list view",
    hint: currentViewMode === "list" ? "Current" : undefined,
    icon: "list",
    keywords: ["table", "rows"],
    run: () => setViewMode("list"),
  });
  cmds.push({
    id: "view.grid",
    group: "view",
    label: "Switch to grid view",
    hint: currentViewMode === "mosaic" ? "Current" : undefined,
    icon: "layout-grid",
    keywords: ["tiles", "mosaic", "cards"],
    run: () => setViewMode("mosaic"),
  });
  cmds.push({
    id: "view.gallery",
    group: "view",
    label: "Switch to gallery view",
    hint: currentViewMode === "mosaic gallery" ? "Current" : undefined,
    icon: "image",
    keywords: ["thumbnails", "photos", "media"],
    run: () => setViewMode("mosaic gallery"),
  });

  // ── Navigation ─────────────────────────────────────────────────────────
  cmds.push({
    id: "nav.myFiles",
    group: "navigation",
    label: "My files",
    icon: "folder",
    keywords: ["home", "root"],
    run: () => void router.push("/files/"),
  });
  cmds.push({
    id: "nav.accountSettings",
    group: "navigation",
    label: "Account settings",
    icon: "user",
    keywords: ["profile", "preferences"],
    run: () => void router.push("/settings/profile"),
  });
  if (isAdmin) {
    cmds.push({
      id: "nav.globalSettings",
      group: "navigation",
      label: "Global settings",
      icon: "settings-2",
      keywords: ["admin", "system", "config"],
      run: () => void router.push("/settings/global"),
    });
    cmds.push({
      id: "nav.users",
      group: "navigation",
      label: "Manage users",
      icon: "users",
      keywords: ["admin", "accounts"],
      run: () => void router.push("/settings/users"),
    });
  }

  // WS10: the `?` key was removed, so the keyboard cheat-sheet is opened from
  // the palette instead.
  cmds.push({
    id: "action.shortcuts",
    group: "actions",
    label: "Keyboard shortcuts",
    icon: "keyboard",
    keywords: ["help", "keys", "cheat sheet", "hotkeys"],
    run: () => useShortcutsOverlay().open(),
  });

  cmds.push({
    id: "action.logout",
    group: "actions",
    label: "Log out",
    icon: "log-out",
    keywords: ["signout", "exit"],
    run: () => auth.logout(),
  });

  return cmds;
}

/**
 * Fuzzy subsequence matcher. Returns a numeric score (higher = better) or
 * null if no match. Cheap enough to call on every keystroke against ~50
 * commands without a debounce.
 *
 * Heuristic:
 *  - exact prefix: huge bonus
 *  - word-boundary matches: medium bonus per match
 *  - consecutive matches: small bonus per consecutive pair
 *  - earlier matches in the string: small bonus
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Trivial: empty query
  if (q.length === 0) return 0;

  // Exact substring match → high baseline
  const exactIdx = t.indexOf(q);
  if (exactIdx === 0) return 1000 - target.length;
  if (exactIdx > 0) return 600 - exactIdx;

  // Subsequence walk
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // word boundary bonus
      if (ti === 0 || /[\s_\-./]/.test(t[ti - 1])) score += 8;
      // consecutive bonus
      if (ti === lastMatchIdx + 1) score += 4;
      score += 2;
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return null;
  // Shorter targets win ties (more specific match)
  score -= Math.floor(target.length / 4);
  return score;
}
