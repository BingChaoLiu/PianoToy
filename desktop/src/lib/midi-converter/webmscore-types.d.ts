// Ambient type shim for the webmscore npm package.
//
// webmscore ships its own types in src/index.d.ts, but they aren't reliably
// resolved under Vite's ESM resolution + our resolve.alias override (which
// points the bare specifier at webmscore.mjs). This ambient declaration gives
// us a minimal, stable surface for the load + saveXml API we actually use.
// Keep it narrow — only the methods called from the converter worker.

declare module "webmscore" {
  export type ScoreFormat =
    | "mscz"
    | "mscx"
    | "musicxml"
    | "mxl"
    | "midi"
    | "mei"
    | "bagpipe-musicwriter"
    | "bb"
    | "bww"
    | "cap"
    | "capx"
    | "gtp"
    | "gp3"
    | "gp4"
    | "gp5"
    | "gpx"
    | "gui"
    | "ptb"
    | "ove"
    | "scw"
    | "sgu"
    | "svd"
    | "xml";

  export interface WebMscoreScore {
    /** Export the score as uncompressed MusicXML text. */
    saveXml(): Promise<string>;
    /** Export the score as compressed MusicXML (.mxl) bytes. */
    saveMxl(): Promise<Uint8Array>;
    /** Export as MIDI bytes. */
    saveMidi(expandRepeats?: boolean, exportRPNs?: boolean): Promise<Uint8Array>;
    /** Destroy the score instance (frees WASM memory). */
    destroy(soft?: boolean): void;
  }

  export interface WebMscoreStatic {
    /**
     * Load a score from raw file bytes.
     * @param format One of the supported ScoreFormat strings ("midi" for us).
     * @param data   The file's raw bytes.
     * @param fonts  Optional font files (we use none — default fonts are baked
     *               into the WASM data file).
     * @param doLayout Whether to lay out the score (default true; needed for
     *                 export to produce well-formed MusicXML).
     */
    load(
      format: ScoreFormat,
      data: Uint8Array,
      fonts?: Uint8Array[],
      doLayout?: boolean,
    ): Promise<WebMscoreScore>;
    /** Promise that resolves when the WASM module is ready. */
    ready: Promise<void>;
  }

  const WebMscore: WebMscoreStatic;
  export default WebMscore;
}
