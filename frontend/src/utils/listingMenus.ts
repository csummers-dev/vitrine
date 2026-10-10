/**
 * Builders for the listing's right-click menus, as pure functions of the
 * current selection, permissions and app state. Extracted from FileListing.vue
 * (4.0 Phase 1) so the menus can be unit-tested without mounting the view.
 *
 * Items that don't pass their gate aren't emitted at all. ContextMenu renders
 * every separator literally, so the builders never stack one on an empty or
 * already-separated tail.
 */
import type { MenuItem } from "@/components/ContextMenu.vue";
import { isAudioTaggable } from "@/utils/audio";

/** Which selection actions are allowed (the bulk pill's `headerButtons`). */
export interface SelectionGates {
  share: boolean;
  extract: boolean;
  move: boolean;
  copy: boolean;
  rename: boolean;
  download: boolean;
  delete: boolean;
}

export interface RowMenuContext {
  selectedCount: number;
  /** The selected item when exactly one is selected. */
  singleItem: ResourceItem | null;
  gates: SelectionGates;
  perms: { rename: boolean; modify: boolean };
  split: { active: boolean; available: boolean };
  isFavorited: (url: string) => boolean;
  clipboardHasItems: boolean;
  bulkAudioCount: number;
  canBulkEditTags: boolean;
  /** 3.4: selected videos and how many of them are marked watched. */
  videos?: { count: number; watched: number };
  t: (key: string) => string;
}

export interface RowMenuActions {
  open: (url: string) => void;
  openInNewPane: (url: string) => void;
  tag: (url: string) => void;
  editFavoriteTitle: (url: string) => void;
  /** Open a listing prompt (share, extract, rename, move, copy, delete…). */
  prompt: (name: string) => void;
  cut: () => void;
  copy: () => void;
  pasteInto: (folderUrl: string) => void;
  bulkRename: () => void;
  copyPath: (item: ResourceItem) => void;
  download: () => void;
  /** 3.4: mark the selected videos watched / unwatched. */
  setWatched?: (watched: boolean) => void;
}

function separate(items: MenuItem[]): void {
  if (items.length > 0 && items[items.length - 1].type !== "separator") {
    items.push({ type: "separator" });
  }
}

/**
 * The menu for a right-click on a row. `Open`, `Rename`, `Share`, `Tag` and
 * `Copy path` are single-selection; Move, Copy, Cut, Delete and Download act
 * on the whole selection.
 */
export function buildRowMenu(
  ctx: RowMenuContext,
  act: RowMenuActions
): MenuItem[] {
  const sel = ctx.selectedCount;
  if (sel === 0) return []; // the menu never opens with no selection
  const { gates: g, singleItem, t } = ctx;
  const items: MenuItem[] = [];

  // ── Open / pane / Tag / Favorites title (single selection) ─────────
  if (singleItem) {
    items.push({
      label: singleItem.isDir ? "Open folder" : "Open",
      icon: "external-link",
      action: () => act.open(singleItem.url),
    });
  }
  // A second pane only from single-pane mode; once split is on, the
  // cross-pane Move/Copy actions cover the rest.
  if (singleItem?.isDir && !ctx.split.active && ctx.split.available) {
    items.push({
      label: "Open in new pane",
      icon: "columns-2",
      action: () => act.openInNewPane(singleItem.url),
    });
  }
  if (singleItem) {
    items.push({
      label: "Tag…",
      icon: "tag",
      action: () => act.tag(singleItem.url),
    });
  }
  // The Favorites display title only shows in the sidebar, so it's offered
  // only for a pinned folder. It never renames the real folder.
  if (singleItem?.isDir && ctx.isFavorited(singleItem.url)) {
    items.push({
      label: "Favorites display title…",
      icon: "star",
      action: () => act.editFavoriteTitle(singleItem.url),
    });
  }

  // ── Share / Extract / audio tags ───────────────────────────────────
  if (g.share) {
    items.push({
      label: t("buttons.share"),
      icon: "share",
      action: () => act.prompt("share"),
    });
  }
  if (g.extract) {
    items.push({
      label: t("buttons.unzip"),
      icon: "package-open",
      action: () => act.prompt("extract"),
    });
  }
  if (singleItem && isAudioTaggable(singleItem.name) && ctx.perms.modify) {
    items.push({
      label: "Edit tags…",
      icon: "music",
      action: () => act.prompt("audio-tags"),
    });
  } else if (ctx.canBulkEditTags) {
    // Batch variant: the editor opens blank and applies only changed fields.
    items.push({
      label: `Edit tags on ${ctx.bulkAudioCount} files…`,
      icon: "music",
      action: () => act.prompt("audio-tags"),
    });
  }

  // ── Videos: Mark watched / unwatched (3.4) ─────────────────────────
  const v = ctx.videos;
  if (v && v.count > 0 && act.setWatched) {
    const n = v.count === 1 ? "" : ` (${v.count} videos)`;
    if (v.watched < v.count) {
      items.push({
        label: `Mark watched${n}`,
        icon: "eye",
        action: () => act.setWatched!(true),
      });
    }
    if (v.watched > 0) {
      items.push({
        label: `Mark unwatched${n}`,
        icon: "eye-off",
        action: () => act.setWatched!(false),
      });
    }
  }

  // ── Clipboard: Cut / Copy / Paste into folder ──────────────────────
  // Same gates as the Move/Copy pickers (cut pastes as a move, copy as a
  // copy). "Paste into folder" pastes INTO a selected folder without
  // navigating first.
  if (items.length > 0) items.push({ type: "separator" });
  if (g.move) {
    items.push({
      label: sel === 1 ? "Cut" : `Cut ${sel} items`,
      icon: "scissors",
      kbd: "⌘X",
      action: () => act.cut(),
    });
  }
  if (g.copy) {
    items.push({
      label: sel === 1 ? "Copy" : `Copy ${sel} items`,
      icon: "copy",
      kbd: "⌘C",
      action: () => act.copy(),
    });
  }
  if (singleItem?.isDir && ctx.clipboardHasItems) {
    items.push({
      label: "Paste into folder",
      icon: "clipboard",
      action: () => act.pasteInto(singleItem.url),
    });
  }

  // ── Rename / Move to / Copy to / Copy path / Download ──────────────
  separate(items);
  if (g.rename) {
    items.push({
      label: t("buttons.rename"),
      icon: "pencil",
      action: () => act.prompt("rename"),
    });
  } else if (ctx.perms.rename && sel > 1) {
    items.push({
      label: `Bulk rename ${sel} items…`,
      icon: "pencil",
      action: () => act.bulkRename(),
    });
  }
  // "… to…" = the destination-picker panels, distinct from Cut/Copy above.
  const kind = singleItem?.isDir ? "folder" : "file";
  if (g.move) {
    items.push({
      label: sel === 1 ? `Move ${kind} to…` : `Move ${sel} items to…`,
      icon: "forward",
      action: () => act.prompt("move"),
    });
  }
  if (g.copy) {
    items.push({
      label: sel === 1 ? `Copy ${kind} to…` : `Copy ${sel} items to…`,
      icon: "copy-plus",
      action: () => act.prompt("copy"),
    });
  }
  if (singleItem) {
    items.push({
      label: "Copy path",
      icon: "link",
      kbd: "⌘⇧C",
      action: () => act.copyPath(singleItem),
    });
  }
  if (g.download) {
    items.push({
      label:
        sel === 1
          ? t("buttons.download")
          : `${t("buttons.download")} ${sel} items`,
      icon: "download",
      action: () => act.download(),
    });
  }

  // ── Delete (destructive: separated, red tint) ──────────────────────
  if (g.delete) {
    items.push({ type: "separator" });
    items.push({
      label: sel === 1 ? t("buttons.delete") : `Delete ${sel} items`,
      icon: "trash-2",
      destructive: true,
      kbd: "Del",
      action: () => act.prompt("delete"),
    });
  }

  return items;
}

export interface BackgroundMenuContext {
  canCreate: boolean;
  clipboardHasItems: boolean;
  t: (key: string) => string;
}

export interface BackgroundMenuActions {
  prompt: (name: string) => void;
  upload: () => void;
  paste: () => void;
  /** Open the Sort popover where the context menu was. */
  sortHere: () => void;
  refresh: () => void;
}

/** The menu for a right-click on empty listing space: act on the folder. */
export function buildBackgroundMenu(
  ctx: BackgroundMenuContext,
  act: BackgroundMenuActions
): MenuItem[] {
  const items: MenuItem[] = [];
  if (ctx.canCreate) {
    items.push(
      {
        label: "New folder",
        icon: "folder-plus",
        action: () => act.prompt("newDir"),
      },
      {
        label: "New file",
        icon: "file-plus",
        action: () => act.prompt("newFile"),
      },
      {
        label: ctx.t("buttons.upload"),
        icon: "upload",
        action: () => act.upload(),
      }
    );
  }
  if (ctx.clipboardHasItems) {
    items.push({
      label: "Paste",
      icon: "clipboard",
      kbd: "⌘V",
      action: () => act.paste(),
    });
  }
  if (items.length > 0) items.push({ type: "separator" });
  items.push(
    {
      label: "Sort by…",
      icon: "arrow-down-narrow-wide",
      action: () => act.sortHere(),
    },
    {
      label: "Refresh",
      icon: "rotate-ccw",
      kbd: "/",
      action: () => act.refresh(),
    }
  );
  return items;
}
