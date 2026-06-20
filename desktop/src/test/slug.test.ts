import { describe, it, expect } from "vitest";
import { slugify, makeScoreId, isValidFolderName } from "@/lib/score-storage/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Mad World")).toBe("mad-world");
  });

  it("filters forbidden filename characters", () => {
    expect(slugify('a<b>:"c/d\\e|f?g*h')).toBe("a-b-c-d-e-f-g-h");
  });

  it("collapses consecutive dashes", () => {
    expect(slugify("Hello   --- World")).toBe("hello-world");
  });

  it("strips leading/trailing dashes and dots", () => {
    expect(slugify("...Trailing...")).toBe("trailing");
  });

  it("preserves unicode (chinese)", () => {
    expect(slugify("月光奏鸣曲")).toBe("月光奏鸣曲");
  });

  it("falls back to untitled when result is empty", () => {
    expect(slugify("???")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });

  it("rejects windows reserved names by suffixing", () => {
    expect(slugify("CON")).toBe("con-");
    expect(slugify("nul")).toBe("nul-");
  });
});

describe("makeScoreId", () => {
  it("combines timestamp and slug", () => {
    expect(makeScoreId(1718841600, "Mad World")).toBe("1718841600-mad-world");
  });

  it("uses untitled slug for empty name", () => {
    expect(makeScoreId(1718841600, "")).toBe("1718841600-untitled");
  });
});

describe("isValidFolderName", () => {
  it("accepts valid names", () => {
    expect(isValidFolderName("1718841600-mad-world")).toBe(true);
    expect(isValidFolderName("a_b-c123")).toBe(true);
  });

  it("accepts unicode (CJK) folder names, matching slugify output", () => {
    expect(isValidFolderName("1718841600-月光奏鸣曲")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidFolderName("..")).toBe(false);
    expect(isValidFolderName("../etc")).toBe(false);
    expect(isValidFolderName(".")).toBe(false);
  });

  it("rejects separators and dots prefix", () => {
    expect(isValidFolderName("a/b")).toBe(false);
    expect(isValidFolderName("a\\b")).toBe(false);
    expect(isValidFolderName(".hidden")).toBe(false);
  });

  it("rejects Windows reserved names", () => {
    expect(isValidFolderName("CON")).toBe(false);
    expect(isValidFolderName("nul")).toBe(false);
    expect(isValidFolderName("com1")).toBe(false);
  });

  it("rejects whitespace and control chars", () => {
    expect(isValidFolderName("a b")).toBe(false);
    expect(isValidFolderName("a\tb")).toBe(false);
    expect(isValidFolderName("a\u0000b")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidFolderName("")).toBe(false);
  });
});

describe("slugify ↔ isValidFolderName consistency", () => {
  it("makeScoreId output always passes isValidFolderName", () => {
    const names = [
      "Mad World",
      "月光奏鸣曲",
      "...Trailing...",
      'a<b>:"c/d\\e|f?g*h',
      "CON",
      "",
      "???",
      "  spaces  ",
      "fur-elise",
      "emoji🎵test",
    ];
    for (const n of names) {
      const id = makeScoreId(1718841600, n);
      expect(isValidFolderName(id)).toBe(true);
    }
  });
});
