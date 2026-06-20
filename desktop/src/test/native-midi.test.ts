import { describe, it, expect, beforeEach } from "vitest";

describe("native-midi (browser fallback)", () => {
  beforeEach(() => {
    // Ensure no Tauri runtime is detected during browser-mode tests.
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("listNativeMidiInputs returns [] in browser", async () => {
    const { listNativeMidiInputs } = await import("@/lib/native-midi");
    expect(await listNativeMidiInputs()).toEqual([]);
  });

  it("startNativeMidiListen is a no-op in browser", async () => {
    const { startNativeMidiListen } = await import("@/lib/native-midi");
    await expect(startNativeMidiListen("foo")).resolves.toBeUndefined();
  });

  it("stopNativeMidiListen is a no-op in browser", async () => {
    const { stopNativeMidiListen } = await import("@/lib/native-midi");
    await expect(stopNativeMidiListen()).resolves.toBeUndefined();
  });

  it("subscribeNativeMidi returns null in browser", async () => {
    const { subscribeNativeMidi } = await import("@/lib/native-midi");
    expect(await subscribeNativeMidi(() => {})).toBeNull();
  });

  it("isTauriRuntime returns false in browser", async () => {
    const { isTauriRuntime } = await import("@/lib/native-midi");
    expect(isTauriRuntime()).toBe(false);
  });
});
