import { describe, it, expect } from "vitest";
import { isNewerVersion } from "@/lib/updater";

describe("isNewerVersion", () => {
  it("detects a higher minor version", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns false when remote equals local", () => {
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
  });

  it("returns false when remote is older", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles leading v prefix on remote", () => {
    expect(isNewerVersion("1.0.0", "v1.0.1")).toBe(true);
  });

  it("handles missing patch segment", () => {
    expect(isNewerVersion("1.2.0", "1.3")).toBe(true);
    expect(isNewerVersion("1.3", "1.3.0")).toBe(false);
  });

  it("handles major version bump", () => {
    expect(isNewerVersion("1.9.9", "2.0.0")).toBe(true);
  });

  it("treats non-numeric segments as 0", () => {
    expect(isNewerVersion("1.0.0", "1.0.x")).toBe(false);
    expect(isNewerVersion("1.0.x", "1.1.0")).toBe(true);
  });
});
