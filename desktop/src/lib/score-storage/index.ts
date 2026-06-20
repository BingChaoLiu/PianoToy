// Score storage facade. High-level API for importing, listing, loading and
// deleting scores. Routes to the Tauri native backend in production, or to the
// IndexedDB web-fallback in plain-browser dev.

import { isNative } from "./env";
import { webFallback } from "./web-fallback";
import { makeScoreId, isValidFolderName } from "./slug";
import { type ScoreMeta, META_SCHEMA_VERSION } from "./types";

export interface ImportScoreInput {
  midiBytes: Uint8Array;
  pdfBytes?: Uint8Array | null;
  name: string;
  composer?: string;
  difficulty?: string;
  /** Pre-parsed MIDI metadata (duration etc.). If omitted defaults apply. */
  duration?: number;
  noteCount?: number;
  tempo?: number;
  timeSignature?: string;
}

export interface ScoreMetaInput {
  id: string;
  name: string;
  composer: string;
  difficulty: string;
  duration: number;
  noteCount: number;
  tempo: number;
  timeSignature: string;
  hasPdf: boolean;
}

/** Build a meta.json object from imported MIDI metadata. */
export function buildMetaFromMidi(input: ScoreMetaInput): ScoreMeta {
  const meta: ScoreMeta = {
    schemaVersion: META_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    composer: input.composer,
    difficulty: input.difficulty,
    category: "custom",
    midiFile: "song.mid",
    hasPdf: false,
    duration: input.duration,
    noteCount: input.noteCount,
    tempo: input.tempo,
    timeSignature: input.timeSignature,
    addedAt: Math.floor(Date.now() / 1000),
  };
  if (input.hasPdf) {
    meta.pdfFile = "score.pdf";
    meta.hasPdf = true;
    meta.pdfScroll = { mode: "follow", scrollableHeight: 0, anchors: [] };
  }
  return meta;
}

/**
 * Parse raw meta.json strings from listScoreFolders into valid ScoreMeta[],
 * skipping corrupt/incomplete entries. hasPdf is recomputed from the pdfPresent
 * predicate (which checks score.pdf existence) so it never trusts stale meta.
 */
export function parseListedMetas(
  raws: string[],
  pdfPresent: (folderId: string) => boolean,
): ScoreMeta[] {
  const out: ScoreMeta[] = [];
  for (const raw of raws) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      !m ||
      typeof m.schemaVersion !== "number" ||
      typeof m.midiFile !== "string" ||
      typeof m.id !== "string" ||
      typeof m.name !== "string"
    ) {
      continue;
    }
    // Recompute hasPdf from actual file presence.
    const present = pdfPresent(m.id);
    if (present) {
      m.hasPdf = true;
      m.pdfFile = "score.pdf";
      if (!m.pdfScroll) m.pdfScroll = { mode: "follow", scrollableHeight: 0, anchors: [] };
    } else {
      m.hasPdf = false;
      delete m.pdfFile;
      delete m.pdfScroll;
    }
    // Ensure required fields have safe defaults.
    if (typeof m.composer !== "string") m.composer = "";
    if (typeof m.difficulty !== "string") m.difficulty = "medium";
    if (typeof m.duration !== "number") m.duration = 0;
    if (typeof m.noteCount !== "number") m.noteCount = 0;
    if (typeof m.tempo !== "number") m.tempo = 120;
    if (typeof m.timeSignature !== "string") m.timeSignature = "4/4";
    if (typeof m.addedAt !== "number") m.addedAt = 0;
    m.category = "custom";
    out.push(m as ScoreMeta);
  }
  return out;
}

// --- Backend routing -------------------------------------------------------

type Backend = {
  writeMidi(folder: string, bytes: Uint8Array): Promise<void>;
  writePdf(folder: string, bytes: Uint8Array): Promise<void>;
  writeMeta(folder: string, meta: ScoreMeta): Promise<void>;
  readMeta(folder: string): Promise<ScoreMeta | null>;
  readMidi(folder: string): Promise<Uint8Array | null>;
  readPdf(folder: string): Promise<Uint8Array | null>;
  listScoreFoldersRaw(): Promise<string[]>;
  deleteScoreFolder(folder: string): Promise<void>;
  getScoresRoot(): Promise<string>;
};

async function backend(): Promise<Backend> {
  if (isNative()) {
    const n = await import("./native");
    return {
      writeMidi: n.writeMidi,
      writePdf: n.writePdf,
      writeMeta: n.writeMeta,
      readMeta: n.readMeta,
      readMidi: n.readMidi,
      readPdf: n.readPdf,
      listScoreFoldersRaw: n.listScoreFoldersRaw,
      deleteScoreFolder: n.deleteScoreFolderNative,
      getScoresRoot: n.getScoresRoot,
    };
  }
  return webFallback as Backend;
}

/** Import a score: create folder, write files + meta. Returns the new meta. */
export async function importScoreToFolder(
  input: ImportScoreInput,
  folder: string,
): Promise<ScoreMeta> {
  if (!isValidFolderName(folder)) {
    throw new Error(`invalid folder name: ${folder}`);
  }
  const b = await backend();
  const hasPdf = !!input.pdfBytes && input.pdfBytes.length > 0;
  const meta = buildMetaFromMidi({
    id: folder,
    name: input.name,
    composer: input.composer ?? "",
    difficulty: input.difficulty ?? "medium",
    duration: input.duration ?? 0,
    noteCount: input.noteCount ?? 0,
    tempo: input.tempo ?? 120,
    timeSignature: input.timeSignature ?? "4/4",
    hasPdf,
  });
  // Write MIDI first; if it fails, nothing else is written (no half-state).
  await b.writeMidi(folder, input.midiBytes);
  if (hasPdf && input.pdfBytes) {
    await b.writePdf(folder, input.pdfBytes);
  }
  await b.writeMeta(folder, meta);
  return meta;
}

/** Convenience: generate id from name + current time, then import. */
export async function importScore(input: ImportScoreInput): Promise<ScoreMeta> {
  const folder = makeScoreId(Math.floor(Date.now() / 1000), input.name);
  return importScoreToFolder(input, folder);
}

/** List all valid score metas on disk. */
export async function listScores(): Promise<ScoreMeta[]> {
  const b = await backend();
  const raws = await b.listScoreFoldersRaw();
  // Determine pdf presence per folder (best-effort, parallel). A single corrupt
  // meta.json must never brick the whole listing — guard both the parse and the
  // read so a bad entry is simply treated as "no pdf".
  const present = new Set<string>();
  await Promise.all(
    raws.map(async (raw) => {
      let id = "";
      try {
        id = (JSON.parse(raw) as ScoreMeta).id;
      } catch {
        return;
      }
      if (typeof id !== "string" || !isValidFolderName(id)) return;
      let pdf: Uint8Array | null = null;
      try {
        pdf = await b.readPdf(id);
      } catch {
        pdf = null;
      }
      if (pdf && pdf.length > 0) present.add(id);
    }),
  );
  return parseListedMetas(raws, (id) => present.has(id));
}

/** Load the parsed MIDI bytes for a score (caller runs parseSmf). */
export async function loadScoreMidi(folder: string): Promise<Uint8Array | null> {
  const b = await backend();
  return b.readMidi(folder);
}

/** Load the PDF bytes for a score. */
export async function loadScorePdf(folder: string): Promise<Uint8Array | null> {
  const b = await backend();
  return b.readPdf(folder);
}

/** Read+write back an updated meta (e.g. after editing pdfScroll anchors). */
export async function saveScoreMeta(folder: string, meta: ScoreMeta): Promise<void> {
  const b = await backend();
  await b.writeMeta(folder, meta);
}

export async function readScoreMeta(folder: string): Promise<ScoreMeta | null> {
  const b = await backend();
  return b.readMeta(folder);
}

/** Delete an entire score folder. */
export async function deleteScore(folder: string): Promise<void> {
  if (!isValidFolderName(folder)) {
    throw new Error(`invalid folder name: ${folder}`);
  }
  const b = await backend();
  await b.deleteScoreFolder(folder);
}

/** Scores root path (mainly for an "open folder" button). */
export async function getScoresRoot(): Promise<string> {
  const b = await backend();
  return b.getScoresRoot();
}

export type { ScoreMeta, PdfAnchor, PdfScrollConfig } from "./types";
export { makeScoreId, isValidFolderName, slugify } from "./slug";
