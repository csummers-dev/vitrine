import { useLayoutStore } from "@/stores/layout";
import { useUploadStore } from "@/stores/upload";
import url from "@/utils/url";
import { files as api } from "@/api";
import { removePrefix } from "@/api/utils";

interface UploadEntryWithChild extends UploadEntry {
  children?: UploadEntryWithChild[];
  originalIndex: number;
}

/**
 * Convert UploadList into a forest (array of root nodes).
 * This properly handles uploads with multiple top-level files/folders
 * instead of assuming a single root.
 * @param flatArray
 * @param basePath
 */
function flatToForest(
  flatArray: UploadList,
  basePath: string
): UploadEntryWithChild[] {
  const nodeMap: Record<string, UploadEntryWithChild> = {};

  // First pass: create all nodes
  flatArray.forEach((item, index) => {
    // File list is created from very different action and info available are not always the same.
    // By doing a drag and drop or upload a folder (both from the browser or from the OS) we have the fullPath property available
    // By uploading a single file using the file input, we only have the "name" property
    // By doing drag and drop from filebrowser to filebrowser, we have the "to" property available but not the fullPath
    const fullPathOrTo =
      item.fullPath || item.to?.replace(basePath, "") || item.name;
    nodeMap[fullPathOrTo!] = {
      fullPath: fullPathOrTo,
      isDir: item.isDir,
      name: item.name,
      size: item.size,
      originalIndex: index,
      ...(item.isDir && { children: [] }),
      ...(item.file && { file: item.file }),
    };
  });

  const roots: UploadEntryWithChild[] = [];

  // Second pass: build hierarchy
  flatArray.forEach((item) => {
    // see comment before to explanation
    const fullPathOrTo =
      item.fullPath || item.to?.replace(basePath, "") || item.name;

    const node = nodeMap[fullPathOrTo!];
    const lastSlash = fullPathOrTo!.lastIndexOf("/");

    if (lastSlash === -1) {
      roots.push(node);
    } else {
      const parentPath = fullPathOrTo!.substring(0, lastSlash);
      const parent = nodeMap[parentPath];
      if (parent?.children) {
        parent.children.push(node);
      }
    }
  });

  return roots;
}

/**
 * Return conflict files from
 * @param files  - flat upload list to check
 * @param basePath   - server destination path (e.g. "/files/uploads/")
 */
export async function checkConflict(
  files: UploadList,
  basePath: string
): Promise<ConflictingResource[]> {
  const forest = flatToForest(files, basePath);
  if (forest.length === 0) return [];

  // Single API call: fetch the entire server tree under basePath.
  let serverEntries: RecursiveEntry[] = [];
  try {
    serverEntries = await api.fetchAll(basePath);
  } catch {
    console.error(
      `Failed to fetch recursive server listing for ${basePath}. ` +
        `Assuming directory doesn't exist and skipping conflict check.`
    );
    return [];
  }

  // Build a lookup map keyed by the normalised server path for O(1) access.
  // The server returns paths relative to the user's scope (e.g. "/uploads/foo.txt").
  // We strip the basePath prefix so the key matches the upload entry's fullPath.
  const normBase = removePrefix(basePath).replace(/\/+$/, "");
  const serverMap = new Map<string, RecursiveEntry>();
  for (const entry of serverEntries) {
    // entry.path is absolute from server root, e.g. "/uploads/sub/file.txt"
    // We need the relative part after normBase, e.g. "sub/file.txt"
    let rel = entry.path;
    if (rel.startsWith(normBase)) {
      rel = rel.slice(normBase.length);
    }
    // Strip leading slash so it matches fullPath format ("sub/file.txt")
    rel = rel.replace(/^\/+/, "");
    serverMap.set(rel, entry);
  }

  const conflicts: ConflictingResource[] = [];

  /**
   * Walk the upload tree and compare each file node against the
   * pre-fetched server map.  Directories only need to be recursed
   * when they appear in the map (otherwise no child can conflict).
   */
  function recursiveCheckConflict(nodes: UploadEntryWithChild[]): void {
    for (const node of nodes) {
      if (node.isDir && node.children) {
        // Only recurse if this directory exists on the server
        const dirKey = node.fullPath!.replace(/^\/+/, "");
        if (serverMap.has(dirKey)) {
          recursiveCheckConflict(node.children);
        }
      } else {
        // File – check for a conflict against the server map
        const fileKey = node.fullPath!.replace(/^\/+/, "");
        const serverEntry = serverMap.get(fileKey);

        if (serverEntry) {
          conflicts.push({
            index: node.originalIndex,
            name: serverEntry.path,
            origin: {
              lastModified: node.file?.lastModified,
              size: node.size,
            },
            dest: {
              lastModified: serverEntry.modified,
              size: serverEntry.size,
            },
            checked: ["origin"],
            isSmallerOnServer: node.size > serverEntry.size,
          });
        }
      }
    }
  }

  // Walk all root nodes synchronously against the pre-fetched data
  recursiveCheckConflict(forest);

  conflicts.sort((a, b) => a.index - b.index);

  return conflicts;
}

/**
 * Conflict check for a FileBrowser→FileBrowser move/copy (drag-drop, the
 * move-tool, clipboard paste). Here `items` is always a FLAT list of the
 * top-level entries the user picked — there is no nested upload tree.
 *
 * The upload-oriented `checkConflict()` doesn't fit this shape and silently
 * misses real collisions:
 *   • It keys each node by the URL-ENCODED `to` path (`flatToForest` uses
 *     `item.to.replace(basePath, "")` = `encodeURIComponent(name)`), but the
 *     server map is keyed by DECODED names — so any name with a space or
 *     Unicode char never matches and the conflict is missed.
 *   • A dragged FOLDER only triggers recursion into its (empty) children, so a
 *     folder-vs-folder collision is never reported at all.
 * In both cases it returned `[]`, the move proceeded, and the backend rejected
 * it — the user saw an outright failure instead of the resolve-conflict prompt.
 *
 * This compares each item's DECODED `name` against the destination folder's
 * immediate listing (one non-recursive fetch — a move only collides at the top
 * level), covering files AND folders, and returns the same
 * `ConflictingResource[]` the resolve-conflict prompt consumes. `index` is the
 * item's position in `items` so callers can map a resolution back by index.
 */
export async function checkMoveConflict(
  items: Array<{
    name: string;
    isDir?: boolean;
    size?: number;
    modified?: string;
  }>,
  dest: string
): Promise<ConflictingResource[]> {
  if (items.length === 0) return [];

  let destItems: Array<{
    name: string;
    size: number;
    modified: string;
    isDir: boolean;
  }> = [];
  try {
    const res = await api.fetch(dest);
    destItems = (res.items ?? []) as typeof destItems;
  } catch {
    // Destination unreadable (just-created, permissions, gone) — let the move
    // proceed; the backend stays the source of truth for real failures.
    return [];
  }

  // Server listing names are already decoded — key by name for O(1) lookup.
  const destMap = new Map<string, (typeof destItems)[number]>();
  for (const entry of destItems) destMap.set(entry.name, entry);

  const conflicts: ConflictingResource[] = [];
  items.forEach((item, index) => {
    const hit = destMap.get(item.name);
    if (!hit) return;
    conflicts.push({
      index,
      name: item.name,
      origin: { lastModified: item.modified, size: item.size },
      dest: { lastModified: hit.modified, size: hit.size },
      checked: ["origin"],
      isSmallerOnServer: item.size !== undefined ? item.size > hit.size : false,
    });
  });

  return conflicts;
}

export function scanFiles(dt: DataTransfer): Promise<UploadList | FileList> {
  return new Promise((resolve) => {
    let reading = 0;
    const contents: UploadList = [];

    if (dt.items) {
      // ts didn't like the for of loop even tho
      // it is the official example on MDN
      // for (const item of dt.items) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (
          item.kind === "file" &&
          typeof item.webkitGetAsEntry === "function"
        ) {
          const entry = item.webkitGetAsEntry();
          entry && readEntry(entry);
        }
      }
    } else {
      resolve(dt.files);
    }

    function readEntry(entry: FileSystemEntry, directory = ""): void {
      if (entry.isFile) {
        reading++;
        (entry as FileSystemFileEntry).file((file) => {
          reading--;

          contents.push({
            file,
            name: file.name,
            size: file.size,
            isDir: false,
            fullPath: `${directory}${file.name}`,
          });

          if (reading === 0) {
            resolve(contents);
          }
        });
      } else if (entry.isDirectory) {
        const dir = {
          isDir: true,
          size: 0,
          fullPath: `${directory}${entry.name}`,
          name: entry.name,
        };

        contents.push(dir);

        readReaderContent(
          (entry as FileSystemDirectoryEntry).createReader(),
          `${directory}${entry.name}`
        );
      }
    }

    function readReaderContent(
      reader: FileSystemDirectoryReader,
      directory: string
    ): void {
      reading++;

      reader.readEntries((entries) => {
        reading--;
        if (entries.length > 0) {
          const dirWithSlash = directory.endsWith("/")
            ? directory
            : `${directory}/`;
          for (const entry of entries) {
            readEntry(entry, dirWithSlash);
          }

          readReaderContent(reader, dirWithSlash);
        }

        if (reading === 0) {
          resolve(contents);
        }
      });
    }
  });
}

function detectType(mimetype: string): ResourceType {
  if (mimetype.startsWith("video")) return "video";
  if (mimetype.startsWith("audio")) return "audio";
  if (mimetype.startsWith("image")) return "image";
  if (mimetype.startsWith("pdf")) return "pdf";
  if (mimetype.startsWith("text")) return "text";
  return "blob";
}

export function handleFiles(
  files: UploadList,
  base: string,
  overwrite = false
) {
  const uploadStore = useUploadStore();
  const layoutStore = useLayoutStore();

  layoutStore.closeHovers();

  for (const file of files) {
    let path = base;

    if (file.fullPath !== undefined) {
      path += url.encodePath(file.fullPath);
    } else {
      path += url.encodeRFC5987ValueChars(file.name);
    }

    if (file.isDir) {
      path += "/";
    }

    const type = file.isDir ? "dir" : detectType((file.file as File).type);

    uploadStore.upload(
      path,
      file.name,
      file.file ?? null,
      file.overwrite || overwrite,
      type
    );
  }
}
