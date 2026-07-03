// Unified score parser: dispatches to parseSmf (MIDI) or parseMusicXml based on
// the source format. Centralizes the bytes→Song path so import + load + drag
// sites all go through one seam instead of calling parseSmf directly.

import { parseSmf } from "@/lib/smf-parser";
import { parseMusicXml } from "@/lib/musicxml-parser";
import type { Song } from "@/types/midi";

export type ScoreSourceFormat = "midi" | "musicxml";

/**
 * Parse score bytes of a known format into a playable Song.
 *
 * - midi: synchronous parseSmf, wrapped in a Promise for a uniform signature.
 * - musicxml: async parseMusicXml (Verovio WASM, lazy-loaded).
 */
export async function parseScore(bytes: Uint8Array, fmt: ScoreSourceFormat): Promise<Song> {
  if (fmt === "musicxml") return parseMusicXml(bytes);
  return parseSmf(bytes);
}

/** Infer the source format from a filename's extension. Returns null if unknown. */
export function inferFormatFromName(name: string): ScoreSourceFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mid") || lower.endsWith(".midi")) return "midi";
  if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) return "musicxml";
  return null;
}
