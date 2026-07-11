// Progress-storage facade. High-level load/save that routes to the native
// (Tauri) or web-fallback backend, mirroring score-storage/index.ts. Callers
// never know which backend is live.
//
// The facade owns debounced saving: card-state mutations are frequent (every
// answer), and we don't want to hit the filesystem on each one. Saves are
// coalesced into one write per debounce window.

// Reuse the Tauri-free environment probe from score-storage rather than
// duplicating it. It's intentionally generic and documented as reusable.
import { isNative } from "@/lib/score-storage/env";
import {
  serializeProgress,
  deserializeProgress,
  emptyProgress,
  type ProgressFile,
} from "./serialize";
import type { MasteryThreshold } from "@/lib/sm2";

const DEBOUNCE_MS = 400;

type Backend = {
  readProgressBytes(): Promise<Uint8Array | null>;
  saveProgressBytes(bytes: Uint8Array): Promise<void>;
};

async function backend(): Promise<Backend> {
  if (isNative()) {
    return await import("./native");
  }
  return await import("./web-fallback");
}

/**
 * Load progress.json, parsing defensively. A missing or corrupt file yields
 * fresh progress (empty card map) — never throws.
 *
 * `fallbackThreshold` is used when the file is missing/corrupt or lacks a
 * usable threshold.
 */
export async function loadProgress(fallbackThreshold: MasteryThreshold): Promise<ProgressFile> {
  const b = await backend();
  const bytes = await b.readProgressBytes();
  if (!bytes || bytes.length === 0) return emptyProgress(fallbackThreshold);
  const text = new TextDecoder().decode(bytes);
  return deserializeProgress(text, fallbackThreshold);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: ProgressFile | null = null;
let saveInFlight: Promise<void> = Promise.resolve();

/** Test-only: counts how many backend writes were actually issued. */
let __writeCount = 0;

/**
 * Debounced save: coalesces rapid mutations (one per answer) into a single
 * write per DEBOUNCE_MS window. Always writes the latest snapshot passed in,
 * so callers can fire-and-forget on every state change.
 */
export function saveProgressDebounced(progress: ProgressFile): void {
  pending = progress;
  if (saveTimer !== null) return; // already scheduled — the latest snapshot wins
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPendingSave();
  }, DEBOUNCE_MS);
}

/**
 * Flush any pending debounced save immediately and await its completion. Use
 * on app exit / mode switch to guarantee the last snapshot is durable.
 */
export async function flushPendingSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pending) {
    const snapshot = pending;
    pending = null;
    // Chain onto any in-flight write to preserve ordering.
    saveInFlight = saveInFlight.then(() => writeProgress(snapshot));
  }
  await saveInFlight;
}

async function writeProgress(progress: ProgressFile): Promise<void> {
  try {
    const b = await backend();
    const bytes = new TextEncoder().encode(serializeProgress(progress));
    await b.saveProgressBytes(bytes);
    __writeCount++;
  } catch (err) {
    // Persistence failures must not crash the practice session. Log and move
    // on; the next debounced save will retry.
    console.error("[progress-storage] save failed:", err);
  }
}

/** Test-only: reset the debounce timer + pending state between unit tests. */
export function __resetForTest(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pending = null;
  saveInFlight = Promise.resolve();
  __writeCount = 0;
}

/** Test-only: how many backend writes have been issued since the last reset. */
export function __writeCountForTest(): number {
  return __writeCount;
}

export type { ProgressFile } from "./serialize";
export type { Card, MasteryThreshold } from "@/lib/sm2";
export { serializeProgress, deserializeProgress, emptyProgress, PROGRESS_SCHEMA_VERSION } from "./serialize";
