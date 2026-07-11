// Tauri command wrappers for progress.json. Mirrors score-storage/native.ts:
// thin invoke() calls, no business logic (parsing lives in serialize.ts).

import { invoke } from "@tauri-apps/api/core";

/**
 * Read progress.json bytes. Returns null when the file does not exist yet
 * (fresh learner) — the Rust command returns an empty vector in that case.
 */
export async function readProgressBytes(): Promise<Uint8Array | null> {
  const arr = await invoke<number[]>("read_progress");
  if (!arr || arr.length === 0) return null;
  return new Uint8Array(arr);
}

/** Write progress.json bytes (creating the app-local-data dir if needed). */
export async function saveProgressBytes(bytes: Uint8Array): Promise<void> {
  await invoke<void>("save_progress", { bytes: Array.from(bytes) });
}
