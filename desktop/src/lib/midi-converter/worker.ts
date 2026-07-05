// Web Worker that runs the webmscore WASM (MuseScore libmscore) to convert
// imported MIDI bytes into MusicXML text.
//
// WHY A WORKER: webmscore is a ~23 MB Emscripten WASM module that performs
// CPU-heavy score layout. Loading + converting on the main thread would freeze
// the UI for several seconds. The worker keeps the app responsive.
//
// WASM ASSET RESOLUTION: the webmscore glue resolves its sibling files
// (webmscore.lib.wasm ~9MB, .mem.wasm ~4MB, .data ~4MB, .symbols ~5MB) via an
// Emscripten `locateFile` that uses the global MSCORE_SCRIPT_URL when present.
// We set self.MSCORE_SCRIPT_URL = "/webmscore/" BEFORE importing the library;
// the vite plugin in vite.config.ts serves /webmscore/* from node_modules in
// dev and copies them into dist/webmscore/ at build time. Fully offline.
//
// PROTOCOL: main thread posts { id, midiBytes } → worker replies once with
// { id, ok, musicXml?, error? }. The id lets the facade correlate requests
// (though we only ever run one conversion at a time). bytes are transferable
// to avoid a copy.

// NOTE: we no longer set self.MSCORE_SCRIPT_URL here. webmscore spawns its OWN
// internal Web Worker (from a Blob URL) that runs the WASM, and that inner
// worker has an isolated global scope — our outer-worker global wouldn't
// reach it. Instead, vite.config.ts patches webmscore.mjs at config-load time
// to bake the asset URL expression (`self.location.origin + "/webmscore/"`)
// directly into the source string that gets evaluated inside the inner worker.
// `self.location.origin` resolves to the app origin in blob workers too
// (they inherit the creator's origin), so the same expression works in dev
// (http://127.0.0.1:7777) and prod (<tauri-origin>).

export interface ConvertRequest {
  type: "convert";
  id: number;
  midiBytes: Uint8Array;
}

export interface ConvertResponse {
  id: number;
  ok: boolean;
  musicXml?: string;
  error?: string;
}

let cachedModule: Promise<typeof import("webmscore").default> | null = null;

async function getModule() {
  // Cache the dynamic import so the WASM only boots once across conversions.
  // The library's internal `ready` promise gates the actual load call.
  if (!cachedModule) {
    cachedModule = import("webmscore").then((m) => m.default);
    // Surface import failures in the devtools console — without this the only
    // symptom would be the `ready` promise never settling (silent hang).
    cachedModule.catch((err) => {
      console.error("[webmscore worker] module import failed", err);
    });
  }
  return cachedModule;
}

async function handleConvert(req: ConvertRequest): Promise<ConvertResponse> {
  try {
    const WebMscore = await getModule();
    await WebMscore.ready;
    const score = await WebMscore.load("midi", req.midiBytes, [], true);
    try {
      const musicXml = await score.saveXml();
      return { id: req.id, ok: true, musicXml };
    } finally {
      score.destroy(true);
    }
  } catch (err) {
    console.error("[webmscore worker] conversion failed", err);
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

self.addEventListener("message", async (e: MessageEvent<ConvertRequest>) => {
  const msg = e.data;
  if (!msg || msg.type !== "convert") return;
  const res = await handleConvert(msg);
  // Transfer the input buffer back is unnecessary; just post the response.
  (self as unknown as Worker).postMessage(res);
});
