import { describe, it, expect } from "vitest";
import { isNewerVersion, pickInstallerUrl } from "@/lib/updater";

describe("pickInstallerUrl", () => {
  it("prefers the NSIS x64 setup exe", () => {
    const assets = [
      { name: "latest.json", browser_download_url: "u/json" },
      { name: "piano-visualizer_0.1.5_x64-setup.exe", browser_download_url: "u/exe" },
      { name: "piano-visualizer_0.1.5_x64_en-US.msi", browser_download_url: "u/msi" },
    ];
    expect(pickInstallerUrl(assets)).toBe("u/exe");
  });

  it("returns null when there is no exe asset", () => {
    const assets = [
      { name: "latest.json", browser_download_url: "u/json" },
      { name: "song.mid", browser_download_url: "u/mid" },
    ];
    expect(pickInstallerUrl(assets)).toBeNull();
  });

  it("falls back to any .exe when no setup asset exists", () => {
    const assets = [{ name: "helper.exe", browser_download_url: "u/helper" }];
    expect(pickInstallerUrl(assets)).toBe("u/helper");
  });

  it("ignores assets without a download url", () => {
    const assets = [{ name: "piano-visualizer_0.1.5_x64-setup.exe" }];
    expect(pickInstallerUrl(assets)).toBeNull();
  });
});

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
