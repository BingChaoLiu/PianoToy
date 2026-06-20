// Tauri-free environment probe. Kept in its own module (with no
// @tauri-apps/api import) so that native.ts — and therefore the Tauri API —
// is only loaded when isNative() is true. Importing isNative statically from
// here does NOT pull the Tauri bundle into the browser.

export function isNative(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
