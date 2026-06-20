// Types for the file-system-backed score storage.

export interface PdfAnchor {
  /** MIDI playback time in seconds. */
  songTime: number;
  /** PDF y coordinate in pixels (relative to the top of the rendered PDF). */
  pdfY: number;
}

export interface PdfScrollConfig {
  /** Currently always "follow" (synced to MIDI time). Reserved for future modes. */
  mode: "follow";
  /** Total scrollable PDF height in pixels, measured on first open. */
  scrollableHeight: number;
  /** Sorted anchors; empty array means "not yet generated". */
  anchors: PdfAnchor[];
}

/** Raw shape of meta.json on disk. */
export interface ScoreMeta {
  schemaVersion: number;
  id: string;
  name: string;
  composer: string;
  difficulty: string;
  category: "custom";
  midiFile: string;
  pdfFile?: string;
  hasPdf: boolean;
  duration: number;
  noteCount: number;
  tempo: number;
  timeSignature: string;
  addedAt: number;
  pdfScroll?: PdfScrollConfig;
}

export const META_SCHEMA_VERSION = 1;

export const MIDI_FILENAME = "song.mid";
export const PDF_FILENAME = "score.pdf";
export const META_FILENAME = "meta.json";
export const MIGRATED_MARKER = ".migrated";
