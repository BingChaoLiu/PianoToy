// Verovio engine: loads MusicXML into a Verovio toolkit (singleton), renders
// every page to SVG, and builds the playback timemap that drives the score
// view's note highlighting + auto-scroll.
//
// The toolkit is shared with musicxml-parser.ts — both lazily boot the same
// WASM module, so only one copy ever lives in memory. Rendering and MIDI
// rendering use different calls on the same toolkit instance; loading a score
// for the view re-loads the data (Verovio toolkit is stateful and single-doc).

/** A single entry in the timemap Verovio produces via renderToTimemap(). */
export interface VerovioTimemapEntry {
  /** Absolute time in milliseconds. */
  tstamp?: number;
  /** Metric time in beats (quarter-note units). */
  qstamp?: number;
  /** Tempo (BPM) effective from this entry. */
  tempo?: number;
  /** Note xml:ids that start sounding at this time. */
  on?: string[];
  /** Note xml:ids that stop sounding at this time. */
  off?: string[];
}

interface VerovioToolkit {
  loadData(data: string): boolean;
  renderToSVG(pageNo: number): string;
  renderToTimemap(): VerovioTimemapEntry[];
  setOptions(options: Record<string, unknown>): void;
  getPageCount(): number;
}

let toolkit: VerovioToolkit | null = null;

async function getToolkit(): Promise<VerovioToolkit> {
  if (!toolkit) {
    const createModule = (await import("verovio/wasm")).default;
    const mod = await createModule();
    const { VerovioToolkit: Tk } = await import("verovio/esm");
    toolkit = new Tk(mod) as unknown as VerovioToolkit;
  }
  return toolkit;
}

/** Release the memoized toolkit (frees WASM memory). */
export function destroyVerovio(): void {
  toolkit = null;
}

/** A sorted index of (start time, note ids) for binary-search highlighting. */
export interface NoteOnEntry {
  /** Absolute time in milliseconds when these notes start sounding. */
  startMs: number;
  /** Verovio note xml:ids that begin at startMs. */
  noteIds: string[];
}

export interface VerovioScore {
  /** One SVG string per laid-out page (1-indexed in Verovio). */
  svgPages: string[];
  /** Raw timemap from Verovio (each entry has tstamp ms + on/off note ids). */
  timemap: VerovioTimemapEntry[];
  /** noteIds aggregated by their start time, sorted ascending by startMs. */
  noteIdByStartMs: NoteOnEntry[];
  /** Number of measures in the score. */
  measureCount: number;
}

/**
 * Load a MusicXML document into Verovio and render it for display.
 * Options favour a single auto-flowed column that fits the container width.
 */
export async function loadScoreIntoVerovio(
  musicXmlText: string,
  pageWidthPx?: number,
): Promise<VerovioScore> {
  const tk = await getToolkit();
  // Set options BEFORE loadData so layout uses them. adjustPageHeight grows
  // each page to its content so a single continuous column scrolls cleanly.
  tk.setOptions({
    scale: 40,
    pageWidth: pageWidthPx ?? 2100, // Verovio internal units; default ~A4 width
    adjustPageHeight: true,
    breaks: "auto",
    // Keep output lean: no timestamps that bloat the SVG.
    removeIds: false, // we NEED ids for highlighting
  });
  const ok = tk.loadData(musicXmlText);
  if (!ok) {
    throw new Error("Verovio rejected the score (loadData returned false). The file may be malformed.");
  }

  const pageCount = tk.getPageCount();
  const svgPages: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    svgPages.push(tk.renderToSVG(p));
  }

  const timemap = tk.renderToTimemap();

  // Aggregate note "on" events by their absolute start time. Each Verovio
  // timemap entry's `on` array lists ids that start sounding at tstamp.
  const byStart = new Map<number, string[]>();
  for (const e of timemap) {
    const t = e.tstamp ?? 0;
    if (e.on && e.on.length > 0) {
      const existing = byStart.get(t);
      if (existing) existing.push(...e.on);
      else byStart.set(t, [...e.on]);
    }
  }
  const noteIdByStartMs: NoteOnEntry[] = [...byStart.entries()]
    .map(([startMs, noteIds]) => ({ startMs, noteIds }))
    .sort((a, b) => a.startMs - b.startMs);

  // Measure count isn't directly exposed; approximate from timemap tempo
  // changes / structure. Verovio doesn't give a clean measure count via the
  // JS toolkit, so we leave it as 0 (unused by the view for now).
  return { svgPages, timemap, noteIdByStartMs, measureCount: 0 };
}

/**
 * Return the note xml:ids that should be highlighted at a given playback time.
 *
 * A note is "active" from its startMs until the next startMs boundary — i.e.
 * the most recent start that is <= timemapMs. This intentionally highlights a
 * whole chord (all notes starting together) and holds until the next onset,
 * matching how a learner's eye tracks the score.
 *
 * Pure function (no toolkit dependency) so it is unit-testable.
 */
export function findActiveNoteIds(timemapMs: number, score: VerovioScore): string[] {
  const { noteIdByStartMs } = score;
  if (noteIdByStartMs.length === 0) return [];
  if (timemapMs < noteIdByStartMs[0].startMs) return [];
  // Binary search for the last entry with startMs <= timemapMs.
  let lo = 0;
  let hi = noteIdByStartMs.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (noteIdByStartMs[mid].startMs <= timemapMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return noteIdByStartMs[result].noteIds;
}
