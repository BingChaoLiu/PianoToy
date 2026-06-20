// Native MIDI backend: Tauri invoke + event listener.
// Falls back gracefully when not running under Tauri (browser dev mode).

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface NativeMidiDevice {
  /** Stable id, formatted as "native:<port_name>". */
  id: string;
  /** Human-readable port name returned by the OS. */
  name: string;
}

export type NativeMidiUnlisten = UnlistenFn;

/** True when running inside a Tauri window. False in browser dev mode. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Enumerate native MIDI input ports via midir. Empty array in browser. */
export async function listNativeMidiInputs(): Promise<NativeMidiDevice[]> {
  if (!isTauriRuntime()) return [];
  try {
    return await invoke<NativeMidiDevice[]>("list_native_midi_inputs");
  } catch (err) {
    console.warn("[native-midi] list failed:", err);
    return [];
  }
}

/** Start forwarding MIDI events from the named port. No-op in browser. */
export async function startNativeMidiListen(name: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("start_native_midi_listen", { name });
}

/** Stop the active native listener. No-op in browser / when not listening. */
export async function stopNativeMidiListen(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("stop_native_midi_listen");
}

/**
 * Subscribe to native-midi-message events forwarded from Rust.
 * Returns null in browser mode (no Tauri runtime).
 */
export async function subscribeNativeMidi(
  cb: (status: number, d1: number, d2: number) => void,
): Promise<NativeMidiUnlisten | null> {
  if (!isTauriRuntime()) return null;
  const unlisten = await listen<{ status: number; d1: number; d2: number }>(
    "native-midi-message",
    (e) => {
      const { status, d1, d2 } = e.payload;
      cb(status, d1, d2);
    },
  );
  return unlisten;
}
