// Main-thread facade for the webmscore MIDI→MusicXML converter worker.
//
// Exposes convertMidiToMusicXml(bytes, { onStage }) which:
//   1. Lazily boots the worker (first call only — the WASM is ~23 MB and takes
//      several seconds to instantiate, so we report stage "loading-converter"
//      to the caller for the one-time cold start).
//   2. Posts the MIDI bytes to the worker.
//   3. Reports stage "converting" while the worker runs the conversion.
//   4. Resolves with the MusicXML text, or rejects on failure.
//
// The worker is reused across conversions (the WASM stays warm), so subsequent
// calls skip the "loading-converter" stage entirely.

import type { ConvertRequest, ConvertResponse } from "./worker";

export type ConvertStage = "loading-converter" | "converting";

export interface ConvertOptions {
  /** Called when the conversion enters a new stage (drives the toast UI). */
  onStage?: (stage: ConvertStage) => void;
  /** Abort the conversion if the worker doesn't reply within this many ms. */
  timeoutMs?: number;
}

let worker: Worker | null = null;
let workerBooted = false;
let nextId = 1;
const pending = new Map<number, { resolve: (xml: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    // Vite's `?worker` suffix bundles this module as a Web Worker and returns
    // a Worker constructor. The worker file is code-split into its own chunk.
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<ConvertResponse>) => {
      const res = e.data;
      if (!res || typeof res.id !== "number") return;
      const entry = pending.get(res.id);
      if (!entry) return;
      pending.delete(res.id);
      if (res.ok && typeof res.musicXml === "string") {
        entry.resolve(res.musicXml);
      } else {
        entry.reject(new Error(res.error ?? "Conversion failed"));
      }
    });
    worker.addEventListener("error", (e) => {
      // Fatal worker error — reject all pending and force a re-boot next time.
      console.error("[midi-converter] worker error", e.message, e.filename, e.lineno);
      for (const entry of pending.values()) {
        entry.reject(new Error(e.message || "Converter worker crashed"));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
      workerBooted = false;
    });
  }
  return worker;
}

/**
 * Convert imported MIDI bytes to MusicXML text via the webmscore WASM worker.
 *
 * On the first call (cold start), reports stage "loading-converter" while the
 * WASM boots (~3-8s); subsequent calls report only "converting".
 *
 * @returns MusicXML document as a string (uncompressed — what Verovio expects).
 * @throws Error if the worker fails to boot, the conversion is rejected, or
 *   the worker doesn't respond within `timeoutMs` (default 120s — a safety net
 *   so the caller never hangs forever waiting on a silently-stalled WASM init).
 */
export async function convertMidiToMusicXml(
  midiBytes: Uint8Array,
  opts: ConvertOptions = {},
): Promise<string> {
  const firstRun = !workerBooted;
  workerBooted = true;

  if (firstRun) {
    opts.onStage?.("loading-converter");
  } else {
    opts.onStage?.("converting");
  }

  const w = getWorker();
  const id = nextId++;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return new Promise<string>((resolve, reject) => {
    // Safety net: if the worker never replies (e.g. WASM init stalled after a
    // silent locateFile failure), reject so the UI can surface an error
    // instead of hanging on "Generating sheet music…" forever.
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Converter timed out — the WASM engine may have failed to load. Check your network/devtools for failed /webmscore/ requests."));
      }
    }, timeoutMs);

    pending.set(id, {
      resolve: (xml) => {
        clearTimeout(timer);
        resolve(xml);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    const req: ConvertRequest = { type: "convert", id, midiBytes };
    w.postMessage(req, [midiBytes.buffer]);
    if (firstRun) {
      // Once the request is queued, the worker is loading then converting.
      // Surface the "converting" stage right away for the non-cold path; for
      // the cold path the caller already knows loading precedes converting.
      opts.onStage?.("converting");
    }
  });
}

/** Release the worker (frees the WASM memory). Call on app teardown if needed. */
export function destroyConverter(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    workerBooted = false;
    pending.clear();
  }
}
