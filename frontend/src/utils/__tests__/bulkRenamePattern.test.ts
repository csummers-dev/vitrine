import { describe, expect, it } from "vitest";
import {
  applyFindReplace,
  expandPattern,
  splitName,
} from "../bulkRenamePattern";

describe("splitName", () => {
  it("splits a standard filename", () => {
    expect(splitName("draft.txt")).toEqual({ name: "draft", ext: "txt" });
  });

  it("lowercases the extension", () => {
    expect(splitName("photo.JPG")).toEqual({ name: "photo", ext: "jpg" });
  });

  it("returns no extension for ext-less files", () => {
    expect(splitName("README")).toEqual({ name: "README", ext: "" });
  });

  it("uses the LAST dot for multi-dot filenames", () => {
    expect(splitName("archive.tar.gz")).toEqual({
      name: "archive.tar",
      ext: "gz",
    });
  });

  it("treats dotfiles as ext-less (POSIX convention)", () => {
    expect(splitName(".env")).toEqual({ name: ".env", ext: "" });
    expect(splitName(".gitignore")).toEqual({ name: ".gitignore", ext: "" });
  });

  it("handles trailing-dot files by stripping the dot", () => {
    expect(splitName("trailing.")).toEqual({ name: "trailing", ext: "" });
  });

  it("handles the empty string defensively", () => {
    expect(splitName("")).toEqual({ name: "", ext: "" });
  });
});

describe("expandPattern", () => {
  const ctx = (index: number, total: number, original: string) => ({
    index,
    total,
    original,
  });

  describe("placeholder coverage", () => {
    it("{n} = 1-based index", () => {
      expect(expandPattern("{n}", ctx(0, 5, "a.txt"))).toBe("1");
      expect(expandPattern("{n}", ctx(4, 5, "a.txt"))).toBe("5");
    });

    it("{N} = 1-based index zero-padded to total digit count", () => {
      // 5 items → 1 digit; no padding needed.
      expect(expandPattern("{N}", ctx(0, 5, "a.txt"))).toBe("1");
      // 10 items → 2 digits.
      expect(expandPattern("{N}", ctx(0, 10, "a.txt"))).toBe("01");
      // 100 items → 3 digits.
      expect(expandPattern("{N}", ctx(0, 100, "a.txt"))).toBe("001");
    });

    it("{####} = 4-digit zero-padded (spec default)", () => {
      expect(expandPattern("{####}", ctx(0, 5, "a.txt"))).toBe("0001");
      expect(expandPattern("{####}", ctx(8, 100, "a.txt"))).toBe("0009");
    });

    it("variable-width #-runs work too ({##}, {#####})", () => {
      expect(expandPattern("{##}", ctx(0, 5, "a.txt"))).toBe("01");
      expect(expandPattern("{#####}", ctx(0, 5, "a.txt"))).toBe("00001");
    });

    it("{ext} = lowercase extension without leading dot", () => {
      expect(expandPattern("{ext}", ctx(0, 1, "draft.TXT"))).toBe("txt");
      expect(expandPattern("{ext}", ctx(0, 1, "README"))).toBe("");
    });

    it("{name} = basename minus extension", () => {
      expect(expandPattern("{name}", ctx(0, 1, "draft.txt"))).toBe("draft");
      expect(expandPattern("{name}", ctx(0, 1, "archive.tar.gz"))).toBe(
        "archive.tar"
      );
      expect(expandPattern("{name}", ctx(0, 1, ".env"))).toBe(".env");
    });

    it("{original} = full original filename including extension", () => {
      expect(expandPattern("{original}", ctx(0, 1, "draft.txt"))).toBe(
        "draft.txt"
      );
    });
  });

  describe("compound patterns", () => {
    it("re-builds the original via {name}.{ext}", () => {
      expect(expandPattern("{name}.{ext}", ctx(0, 1, "draft.txt"))).toBe(
        "draft.txt"
      );
    });

    it("typical 'rename-with-counter' pattern", () => {
      expect(expandPattern("{name}-{####}.{ext}", ctx(0, 5, "photo.jpg"))).toBe(
        "photo-0001.jpg"
      );
      expect(expandPattern("{name}-{####}.{ext}", ctx(4, 5, "photo.jpg"))).toBe(
        "photo-0005.jpg"
      );
    });

    it("strips name entirely with a fresh prefix", () => {
      expect(
        expandPattern("vacation-{N}.{ext}", ctx(2, 10, "DSC_0042.jpg"))
      ).toBe("vacation-03.jpg");
    });
  });

  describe("edge cases", () => {
    it("leaves unknown placeholders as literal text", () => {
      expect(expandPattern("{name}-{unknown}.{ext}", ctx(0, 1, "a.txt"))).toBe(
        "a-{unknown}.txt"
      );
    });

    it("does NOT re-expand substituted content", () => {
      // If a filename contained "{n}" literally and we expanded {original}
      // then ran the substitution again, we'd corrupt the result. Single-
      // pass regex guarantees the literal survives.
      expect(expandPattern("{original}", ctx(2, 5, "weird{n}.txt"))).toBe(
        "weird{n}.txt"
      );
    });

    it("empty pattern yields empty string", () => {
      expect(expandPattern("", ctx(0, 1, "a.txt"))).toBe("");
    });

    it("pattern with no placeholders renames all items to the same name", () => {
      // Caller's responsibility to flag this as a collision; the pure
      // function happily expands.
      expect(expandPattern("static.txt", ctx(0, 5, "a.txt"))).toBe(
        "static.txt"
      );
      expect(expandPattern("static.txt", ctx(4, 5, "a.txt"))).toBe(
        "static.txt"
      );
    });
  });
});

describe("applyFindReplace", () => {
  it("replaces all occurrences literally", () => {
    expect(applyFindReplace("foo-bar-foo.txt", "foo", "baz")).toBe(
      "baz-bar-baz.txt"
    );
  });

  it("returns the original when `find` is empty", () => {
    // Empty find shouldn't be treated as "match everywhere" (which is
    // what split("").join("x") would do).
    expect(applyFindReplace("hello.txt", "", "x")).toBe("hello.txt");
  });

  it("returns the original when `find` doesn't match", () => {
    expect(applyFindReplace("hello.txt", "nope", "x")).toBe("hello.txt");
  });

  it("treats find as a literal string, not a regex", () => {
    expect(applyFindReplace("a.b.c.txt", ".", "-")).toBe("a-b-c-txt");
    // Regex metacharacters in `find` should not match anything special.
    expect(applyFindReplace("a+b.txt", ".+", "x")).toBe("a+b.txt");
  });

  it("allows empty replace (deletion)", () => {
    expect(applyFindReplace("draft-final.txt", "-final", "")).toBe("draft.txt");
  });
});
