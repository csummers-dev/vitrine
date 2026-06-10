import { describe, it, expect } from "vitest";
import { nextVersionedName } from "@/utils/upload";

/**
 * Reproduces the path-building logic from scanFiles() in upload.ts (lines 118-138).
 *
 * readReaderContent() is called when traversing a dropped folder. The browser's
 * FileSystemDirectoryReader.readEntries() returns entries in batches — you must
 * call it repeatedly until it returns an empty array. Each recursive call in the
 * current code appends "/" to the directory, so the second batch and beyond get
 * double (or triple, etc.) slashes in the constructed fullPath.
 */

type Entry = { name: string; isFile: boolean; isDirectory: boolean };

function simulateScanFiles(dirName: string, entryBatches: Entry[][]): string[] {
  const paths: string[] = [];
  let batchIndex = 0;

  // Mirrors readEntry() for files — records fullPath as `${directory}${file.name}`
  function readEntry(entry: Entry, directory = ""): void {
    if (entry.isFile) {
      paths.push(`${directory}${entry.name}`);
    }
  }

  // Mirrors readReaderContent() from upload.ts lines 118-138
  function readReaderContent(directory: string): void {
    const entries =
      batchIndex < entryBatches.length ? entryBatches[batchIndex] : [];
    batchIndex++;

    if (entries.length > 0) {
      const dirWithSlash = directory.endsWith("/")
        ? directory
        : `${directory}/`;
      for (const entry of entries) {
        readEntry(entry, dirWithSlash);
      }
      readReaderContent(dirWithSlash);
    }
  }

  // Initial call mirrors readEntry() for a directory — upload.ts line 111-114
  readReaderContent(dirName);
  return paths;
}

describe("scanFiles path construction", () => {
  it("should not produce double slashes when readEntries returns multiple batches", () => {
    // Two batches: simulates a large directory where the browser splits
    // readEntries() results across multiple calls
    const paths = simulateScanFiles("TestFolder", [
      [
        { name: "file1.xlsx", isFile: true, isDirectory: false },
        { name: "file2.xlsx", isFile: true, isDirectory: false },
      ],
      [{ name: "file3.xlsx", isFile: true, isDirectory: false }],
    ]);

    expect(paths).toHaveLength(3);

    for (const p of paths) {
      expect(p, `path "${p}" contains double slash`).not.toContain("//");
    }
  });

  it("single batch should work fine (no regression)", () => {
    const paths = simulateScanFiles("TestFolder", [
      [{ name: "file1.xlsx", isFile: true, isDirectory: false }],
    ]);

    expect(paths).toEqual(["TestFolder/file1.xlsx"]);
  });
});

// J (2.4.0 Stage 1): the keep-both name preview must be an EXACT mirror of the
// backend's addVersionSuffix (http/resource.go) — `base(N)ext`, N from 1,
// extension per Go's filepath.Ext (everything from the LAST dot). These tables
// pin the Go edge cases so the preview can never drift from what the server
// actually names the kept copy.
describe("nextVersionedName", () => {
  const taken = (...names: string[]) => new Set(names);

  it("returns the name unchanged when it isn't taken", () => {
    expect(nextVersionedName("a.txt", taken())).toBe("a.txt");
    expect(nextVersionedName("a.txt", taken("b.txt"))).toBe("a.txt");
  });

  it("suffixes before the extension, probing from (1)", () => {
    expect(nextVersionedName("a.txt", taken("a.txt"))).toBe("a(1).txt");
    expect(nextVersionedName("a.txt", taken("a.txt", "a(1).txt"))).toBe(
      "a(2).txt"
    );
    expect(
      nextVersionedName("a.txt", taken("a.txt", "a(1).txt", "a(2).txt"))
    ).toBe("a(3).txt");
  });

  it("fills gaps the way the backend does (first free N wins)", () => {
    // dest has a.txt and a(2).txt but NOT a(1).txt → backend lands on a(1).txt.
    expect(nextVersionedName("a.txt", taken("a.txt", "a(2).txt"))).toBe(
      "a(1).txt"
    );
  });

  it("treats everything from the LAST dot as the extension (Go filepath.Ext)", () => {
    expect(nextVersionedName("a.tar.gz", taken("a.tar.gz"))).toBe(
      "a.tar(1).gz"
    );
  });

  it("matches Go on no-extension names (files and folders)", () => {
    expect(nextVersionedName("Makefile", taken("Makefile"))).toBe(
      "Makefile(1)"
    );
    expect(nextVersionedName("Movies", taken("Movies"))).toBe("Movies(1)");
  });

  it("matches Go on dotfiles: '.bashrc' is ALL extension → '(1).bashrc'", () => {
    // Go: filepath.Ext(".bashrc") == ".bashrc", base "" → "(1).bashrc".
    expect(nextVersionedName(".bashrc", taken(".bashrc"))).toBe("(1).bashrc");
  });

  it("matches Go on a trailing dot", () => {
    // Go: Ext("file.") == ".", base "file" → "file(1).".
    expect(nextVersionedName("file.", taken("file."))).toBe("file(1).");
  });

  it("supports batch sequencing via a growing taken set", () => {
    // Mirrors checkMoveConflict: each assigned keep-both name joins the set,
    // the way the backend's per-item FS probes see earlier renames land.
    const set = new Set(["a.txt", "a(1).txt"]);
    const first = nextVersionedName("a.txt", set); // a(2).txt
    set.add(first);
    const second = nextVersionedName("a(1).txt", set); // a(1)(1).txt
    set.add(second);
    expect(first).toBe("a(2).txt");
    expect(second).toBe("a(1)(1).txt");
  });
});
