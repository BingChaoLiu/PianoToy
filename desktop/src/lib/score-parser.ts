// Unified score parser: dispatches to parseSmf (MIDI) or parseMusicXml based on
// the source format. Centralizes the bytes→Song path so import + load + drag
// sites all go through one seam instead of calling parseSmf directly.

import { parseSmf } from "@/lib/smf-parser";
import { parseMusicXml, type ScoreBytes } from "@/lib/musicxml-parser";
import type { Song } from "@/types/midi";

export type ScoreSourceFormat = "midi" | "musicxml";

/** Coerce any accepted byte-source into a real Uint8Array (Tauri invoke
 *  returns number[]; browsers give ArrayBuffer/Uint8Array). */
function toUint8Array(bytes: ScoreBytes): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  return new Uint8Array(bytes as ArrayBuffer);
}

/**
 * Parse score bytes of a known format into a playable Song.
 *
 * - midi: synchronous parseSmf, wrapped in a Promise for a uniform signature.
 * - musicxml: async parseMusicXml (Verovio WASM, lazy-loaded).
 *
 * Accepts Uint8Array, ArrayBuffer, or number[] (Tauri's invoke returns the
 * latter despite the type claim) and normalizes internally.
 */
export async function parseScore(bytes: ScoreBytes, fmt: ScoreSourceFormat): Promise<Song> {
  const u8 = toUint8Array(bytes);
  if (fmt === "musicxml") return parseMusicXml(u8);
  return parseSmf(u8);
}

/** Infer the source format from a filename's extension. Returns null if unknown. */
export function inferFormatFromName(name: string): ScoreSourceFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mid") || lower.endsWith(".midi")) return "midi";
  if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) return "musicxml";
  return null;
}
