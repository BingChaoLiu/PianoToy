// MusicXML parser: converts a MusicXML file into the same Song shape used
// everywhere else, by routing through Verovio.
//
// Pipeline: MusicXML text → Verovio loadData → renderToMIDI (base64 SMF)
// → base64-decode → existing parseSmf → Song. This reuses the proven MIDI
// pipeline (synth, scheduling, scoring) without re-implementing note extraction.
//
// Verovio's WASM is heavy (~3MB) and only needed for MusicXML, so the imports
// are dynamic — plain MIDI imports never pay this cost.

import { parseSmf } from "@/lib/smf-parser";
import type { Song } from "@/types/midi";

/** Lazily create and memoize the single Verovio toolkit instance. */
let toolkitPromise: Promise<unknown> | null = null;

async function getToolkit(): Promise<{
  loadData: (data: string) => boolean;
  renderToMIDI: () => string;
}> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      // Dynamic imports keep Verovio's WASM out of the main bundle and only
      // load it when a MusicXML file is actually parsed.
      const createModule = (await import("verovio/wasm")).default;
      const { VerovioToolkit } = await import("verovio/esm");
      const mod = await createModule();
      return new VerovioToolkit(mod as never);
    })();
  }
  return (await toolkitPromise) as never;
}

/** Decode a base64 string into a Uint8Array of raw bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Parse a MusicXML file into a playable Song.
 *
 * Verovio renders the MusicXML to an SMF (base64), which is then fed to the
 * existing parseSmf. The resulting Song's `name` is left for the caller to set.
 */
export async function parseMusicXml(bytes: Uint8Array): Promise<Song> {
  const xml = new TextDecoder().decode(bytes);
  const tk = await getToolkit();

  let ok = false;
  try {
    ok = tk.loadData(xml);
  } catch (err) {
    throw new Error(`Verovio failed to load MusicXML: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!ok) {
    throw new Error("Verovio rejected the MusicXML (loadData returned false). The file may be malformed.");
  }

  let midiB64: string;
  try {
    midiB64 = tk.renderToMIDI();
  } catch (err) {
    throw new Error(`Verovio failed to render MIDI: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!midiB64 || midiB64.length < 4) {
    throw new Error("Verovio produced empty MIDI output.");
  }

  const smfBytes = base64ToBytes(midiB64);
  const song = parseSmf(smfBytes);
  // parseSmf sets a placeholder name; callers overwrite it. Do not attach the
  // original MusicXML bytes as Song.source — that field is only consumed by
  // smf-writer re-export and would be malformed for a non-MIDI source.
  return song;
}

/** Release the memoized toolkit (frees WASM memory). For tests / teardown. */
export function resetMusicXmlToolkit(): void {
  toolkitPromise = null;
}
