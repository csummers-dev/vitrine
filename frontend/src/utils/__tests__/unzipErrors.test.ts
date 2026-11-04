import { describe, it, expect } from "vitest";
import { StatusError } from "@/api/utils";
import {
  mapUnzipError,
  isArchivePasswordError,
  deriveSubfolderName,
  buildBatchDests,
} from "@/utils/unzipErrors";

// Build a StatusError carrying the backend's plain-text body. The mapper
// lowercases and substring-matches, so these mirror the package-level error
// strings in errors/errors.go. If those strings drift, these tests (and the
// UI copy) regress to the catch-all — which is exactly what we're guarding.
const se = (message: string, status = 400) => new StatusError(message, status);

describe("mapUnzipError — backend message branches", () => {
  const cases: Array<[string, string]> = [
    [
      "the archive is too large",
      "Archive is too large to extract (server limit reached).",
    ],
    [
      "too high a decompression rate",
      "Possible zip bomb detected — extraction blocked.",
    ],
    [
      "too high a decompression size",
      "Archive contents would exceed the server's size limit.",
    ],
    ["invalid path in some files", "Archive contains unsafe file paths."],
    [
      "some files are invalid in the archive",
      "Archive is corrupt or malformed.",
    ],
    [
      "this archive format isn't supported",
      "This archive format can't be extracted.",
    ],
    [
      "split or multi-volume archives of this format aren't supported",
      "Split / multi-volume archives of this format aren't supported.",
    ],
    [
      "password-protected archives aren't supported",
      "Password-protected archives aren't supported.",
    ],
  ];

  for (const [body, expected] of cases) {
    it(`maps "${body}"`, () => {
      expect(mapUnzipError(se(body))).toBe(expected);
    });
  }

  it("is case-insensitive on the backend body", () => {
    expect(mapUnzipError(se("The Archive Is Too Large"))).toBe(
      "Archive is too large to extract (server limit reached)."
    );
  });

  it("distinguishes decompression rate from size (rate is checked first)", () => {
    expect(mapUnzipError(se("too high a decompression rate"))).toContain(
      "zip bomb"
    );
    expect(mapUnzipError(se("too high a decompression size"))).toContain(
      "size limit"
    );
  });
});

describe("mapUnzipError — status fallbacks for non-text payloads", () => {
  it("uses the HTTP status when no message matches", () => {
    expect(mapUnzipError(se("forbidden", 403))).toBe(
      "You don't have permission to extract here."
    );
    expect(mapUnzipError(se("missing", 404))).toBe("Archive not found.");
    expect(mapUnzipError(se("kaboom", 500))).toBe(
      "Extraction failed because of a server error."
    );
    expect(mapUnzipError(se("nope", 400))).toBe(
      "The archive couldn't be extracted."
    );
  });
});

describe("mapUnzipError — the server's own reason (4.0)", () => {
  it("shows why there isn't enough space", () => {
    expect(
      mapUnzipError(
        se(
          "507 Insufficient Storage (not enough space: needs 48.2 GB, 31.0 GB free)",
          507
        )
      )
    ).toBe("Not enough space: needs 48.2 GB, 31.0 GB free.");
  });

  it("shows why an archive was refused", () => {
    expect(
      mapUnzipError(
        se(
          '422 Unprocessable Entity (archive entry "zeros.bin" exceeds safe compression ratio)',
          422
        )
      )
    ).toBe('Archive entry "zeros.bin" exceeds safe compression ratio.');
  });

  it("falls back to a plain line when the reason is missing", () => {
    expect(mapUnzipError(se("507 Insufficient Storage", 507))).toBe(
      "Not enough space on the server to extract this archive."
    );
    expect(mapUnzipError(se("422 Unprocessable Entity", 422))).toBe(
      "This archive was refused as unsafe."
    );
  });
});

describe("isArchivePasswordError", () => {
  it("is a 422 about a password, not any 422", () => {
    expect(
      isArchivePasswordError(
        se("422 Unprocessable Entity (this archive is password-protected)", 422)
      )
    ).toBe(true);
    expect(
      isArchivePasswordError(
        se("422 Unprocessable Entity (the archive password is incorrect)", 422)
      )
    ).toBe(true);
    expect(
      isArchivePasswordError(
        se(
          "422 Unprocessable Entity (archive exceeds safe compression ratio)",
          422
        )
      )
    ).toBe(false);
    expect(isArchivePasswordError(se("password", 400))).toBe(false);
  });
});

describe("mapUnzipError — non-StatusError inputs", () => {
  it("returns a plain Error's message", () => {
    expect(mapUnzipError(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("falls back to a generic line for unknown values", () => {
    expect(mapUnzipError(null)).toBe("Extraction failed.");
    expect(mapUnzipError({ weird: true })).toBe("Extraction failed.");
    expect(mapUnzipError(new Error(""))).toBe("Extraction failed.");
  });
});

describe("deriveSubfolderName", () => {
  it("strips the archive suffix (delegates to archiveBaseName)", () => {
    expect(deriveSubfolderName("photos.zip")).toBe("photos");
    expect(deriveSubfolderName("backup.tar.gz")).toBe("backup");
    expect(deriveSubfolderName("movie.part01.rar")).toBe("movie");
  });
});

describe("buildBatchDests — multi-archive destination paths", () => {
  it("gives each archive its own subfolder under the base", () => {
    expect(buildBatchDests("/files/dl/", ["a.zip", "b.7z"])).toEqual([
      "/files/dl/a",
      "/files/dl/b",
    ]);
  });

  it("normalises a base with no trailing slash", () => {
    expect(buildBatchDests("/files/dl", ["a.zip"])).toEqual(["/files/dl/a"]);
  });

  it("de-duplicates colliding subfolder names (case-insensitively)", () => {
    // data.zip + data.7z both derive "data"; the second gets a suffix.
    expect(buildBatchDests("/x/", ["data.zip", "data.7z"])).toEqual([
      "/x/data",
      "/x/data%20(2)",
    ]);
    // Same name three times → data, data (2), data (3).
    expect(buildBatchDests("/x/", ["Data.zip", "data.zip", "DATA.7z"])).toEqual(
      ["/x/Data", "/x/data%20(2)", "/x/DATA%20(3)"]
    );
  });

  it("URL-encodes spaces and special characters in the folder name", () => {
    expect(buildBatchDests("/x/", ["My Backup #2.zip"])).toEqual([
      "/x/My%20Backup%20%232",
    ]);
  });

  it("falls back to 'archive' when a name derives an empty base", () => {
    expect(buildBatchDests("/x/", [".zip", ".zip"])).toEqual([
      "/x/archive",
      "/x/archive%20(2)",
    ]);
  });

  it("preserves input order and length", () => {
    const out = buildBatchDests("/x/", ["c.zip", "a.zip", "b.zip"]);
    expect(out).toHaveLength(3);
    expect(out).toEqual(["/x/c", "/x/a", "/x/b"]);
  });
});
